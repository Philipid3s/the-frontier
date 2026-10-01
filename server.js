require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ANTHROPIC_MODEL = 'claude-opus-5-5';
const ANTHROPIC_EFFORT = 'high';            // research quality matters more than speed here
const MAX_SEARCHES = 20;                    // cap on web searches per refresh (cost control)
const MAX_CONTINUATIONS = 5;                // cap on pause_turn resumptions
const GEMINI_MODEL = 'gemini-2.5-flash';
const MODELS_PATH = path.join(__dirname, 'data', 'models.json');
const COOLDOWN_MIN = Number(process.env.REFRESH_COOLDOWN_MIN);
const REFRESH_COOLDOWN_MS = (Number.isFinite(COOLDOWN_MIN) && COOLDOWN_MIN >= 0 && process.env.REFRESH_COOLDOWN_MIN !== '' ? COOLDOWN_MIN : 10) * 60 * 1000;

// Single source of truth for allowed enum values — keep LABS in sync with the lab pills in index.html
const LABS = ['openai', 'anthropic', 'google', 'meta', 'xai', 'deepseek', 'moonshot', 'minimax', 'qwen', 'mistral', 'other'];
const STATUSES = ['released', 'upcoming', 'imminent'];
const TAGS = ['coding', 'reasoning', 'multimodal', 'agents', 'open', 'video', 'speed'];
const HEX_RE = /^#[0-9a-f]{3,8}$/i;

// ─── PROMPT ──────────────────────────────────────────────────────
function todayString() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildPrompt() {
  return `Today is ${todayString()}. You maintain "The Frontier", a dashboard of the most important recent and upcoming frontier AI models.

Use web search to build an up-to-date list. Your training data is out of date, so do not rely on memory for which models exist, their release dates, or their benchmarks — verify everything against current sources.

Coverage: search for the latest releases from each of these labs: OpenAI, Anthropic, Google (Gemini), Meta (Llama), xAI (Grok), DeepSeek, Moonshot (Kimi), MiniMax, Qwen (Alibaba), and Mistral. Include another lab only if it shipped something comparably significant.

Selection:
- "released": the current flagship (and any notable specialised model) from each lab, launched within roughly the last 6 months. Aim for 8-12.
- "imminent": officially announced, or reported by multiple credible outlets, and expected within ~4 weeks.
- "upcoming": officially announced or credibly reported, expected in 1-6 months. Aim for 3-6 imminent/upcoming in total.
- Leave out models a lab has since superseded, unless it is still that lab's most notable release.

Accuracy:
- Prefer primary sources: the lab's own blog, release notes, model cards, or API docs. Use reputable news coverage only for unreleased models.
- Every entry needs a "source" URL you actually found in search results that supports it.
- Only quote benchmark numbers that appear in a source. If you are unsure of a detail, leave it out rather than guess.
- For an upcoming model that has not been officially confirmed, set "note" to say it is rumored and who reported it.
- "date": release month for released models (e.g. "Sep 2026"); expected month or quarter for upcoming ones (e.g. "Q1 2027").

Presentation fields: "logo" is a single emoji, "logoBg" a dark hex background color, "color" a brand-appropriate hex accent color. "desc" is 2-3 factual sentences on capabilities and positioning. "tags" uses only: ${TAGS.join(', ')} ("open" means open weights). "note" is a short caveat, or an empty string.`;
}

// The model hands its result over through a strict tool call instead of free text — web-search
// citations split text responses into many blocks, which makes raw JSON parsing fragile
const MODEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'lab', 'date', 'status', 'logo', 'logoBg', 'color', 'desc', 'tags', 'note', 'source'],
  properties: {
    name:   { type: 'string' },
    lab:    { type: 'string', enum: LABS },
    date:   { type: 'string' },
    status: { type: 'string', enum: STATUSES },
    logo:   { type: 'string' },
    logoBg: { type: 'string' },
    color:  { type: 'string' },
    desc:   { type: 'string' },
    tags:   { type: 'array', items: { type: 'string', enum: TAGS } },
    note:   { type: 'string' },
    source: { type: 'string', description: 'URL of the source that supports this entry' }
  }
};

const SUBMIT_TOOL = {
  name: 'submit_models',
  description: 'Submit the final, verified list of models for the dashboard. Call this exactly once, after your research is complete.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['models'],
    properties: { models: { type: 'array', items: MODEL_SCHEMA } }
  }
};

// ─── PROVIDERS ───────────────────────────────────────────────────
// Each provider returns a raw array of model objects; validateModels() cleans it up

async function fetchFromAnthropic(apiKey) {
  const client = new Anthropic({ apiKey, timeout: 10 * 60 * 1000 });
  const messages = [{
    role: 'user',
    content: 'Research the current AI model landscape, then call submit_models with the final list.'
  }];

  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    // Streaming keeps the connection alive during long research turns
    const response = await client.beta.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',                 // if a safety classifier declines, retry on Anthropic's recommended model
      output_config: { effort: ANTHROPIC_EFFORT },
      system: buildPrompt(),
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES },
        SUBMIT_TOOL
      ],
      messages
    }).finalMessage();

    const submit = response.content.find(b => b.type === 'tool_use' && b.name === 'submit_models');
    if (submit) return submit.input.models;

    switch (response.stop_reason) {
      case 'pause_turn':
        // Server-side search loop hit its iteration limit — send the turn back and it resumes
        messages.push({ role: 'assistant', content: response.content });
        continue;
      case 'refusal':
        throw new Error(`Anthropic declined the request${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}`);
      case 'max_tokens':
        throw new Error('Anthropic response truncated (max_tokens reached)');
      default: {
        // Answered in text instead of calling the tool — try to salvage a JSON array
        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
        return extractJsonArray(text);
      }
    }
  }
  throw new Error('Anthropic research did not finish within the continuation limit');
}

async function fetchFromGemini(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const prompt = `${buildPrompt()}

Respond with ONLY a raw JSON array (no markdown, no explanation). Each element has exactly these keys: ${Object.keys(MODEL_SCHEMA.properties).join(', ')}.
"lab" must be one of: ${LABS.join(', ')}. "status" must be one of: ${STATUSES.join(', ')}.`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],      // ground the answer in live Google Search results
      // 2.5 models count thinking tokens against maxOutputTokens, so cap thinking explicitly
      generationConfig: { maxOutputTokens: 65536, thinkingConfig: { thinkingBudget: 8192 } }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini API error');
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('Gemini response truncated (max tokens reached)');
  const text = (candidate?.content?.parts || []).map(p => p.text || '').join('');
  const models = extractJsonArray(text);
  if (Array.isArray(models)) {
    await Promise.all(models.map(async m => { if (m) m.source = await resolveGroundingRedirect(m.source); }));
  }
  return models;
}

// Search grounding cites temporary vertexaisearch.cloud.google.com redirect links that hide the
// real site and expire — follow the redirect once to store the publisher's URL instead
async function resolveGroundingRedirect(url) {
  if (typeof url !== 'string' || !url.includes('vertexaisearch.cloud.google.com/grounding-api-redirect/')) return url;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    return res.headers.get('location') || null;
  } catch {
    return null;
  }
}

// ─── VALIDATION ──────────────────────────────────────────────────
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function safeUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

function normalizeModel(m) {
  if (!m || typeof m !== 'object') return null;
  const name = str(m.name, 80);
  const desc = str(m.desc, 600);
  const status = STATUSES.includes(m.status) ? m.status : null;
  if (!name || !desc || !status) return null;
  return {
    name,
    lab: LABS.includes(m.lab) ? m.lab : 'other',
    date: str(m.date, 30) || '—',
    status,
    logo: str(m.logo, 8) || '◆',
    logoBg: HEX_RE.test(m.logoBg) ? m.logoBg : '#111118',
    color: HEX_RE.test(m.color) ? m.color : '#6d28d9',
    desc,
    tags: Array.isArray(m.tags) ? [...new Set(m.tags.filter(t => TAGS.includes(t)))] : [],
    note: str(m.note, 200) || null,
    source: safeUrl(m.source)
  };
}

function extractJsonArray(raw) {
  const clean = String(raw || '').replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('AI response did not contain a JSON array');
  return JSON.parse(clean.slice(start, end + 1));
}

function validateModels(parsed) {
  if (!Array.isArray(parsed)) throw new Error('AI response is not an array');
  const models = parsed.map(normalizeModel).filter(Boolean);
  if (models.length < 3) throw new Error(`AI response had only ${models.length} valid model(s) — keeping cached data`);
  return models;
}

// ─── REFRESH COOLDOWN ───────────────────────────────────────────
// lastRefreshAt is seeded from the cache file's mtime so restarts don't reset the cooldown
let lastRefreshAt = 0;
let inflight = null;
fs.stat(MODELS_PATH).then(st => { lastRefreshAt = st.mtimeMs; }).catch(() => {});

async function refreshModels(anthropicKey, geminiKey) {
  const started = Date.now();
  console.log(anthropicKey
    ? `Refreshing via Anthropic (${ANTHROPIC_MODEL} + web search)…`
    : `Refreshing via Gemini (${GEMINI_MODEL} + Google Search)…`);
  const raw = anthropicKey ? await fetchFromAnthropic(anthropicKey) : await fetchFromGemini(geminiKey);
  const models = validateModels(raw);
  await fs.writeFile(MODELS_PATH, JSON.stringify(models, null, 2));
  lastRefreshAt = Date.now();
  console.log(`Refresh complete: ${models.length} models in ${Math.round((Date.now() - started) / 1000)}s`);
  return models;
}

app.get('/api/provider', (req, res) => {
  if (process.env.ANTHROPIC_API_KEY) return res.json({ label: 'Powered by Claude (Anthropic) + web search' });
  if (process.env.GEMINI_API_KEY)    return res.json({ label: 'Powered by Gemini (Google) + Search grounding' });
  res.json({ label: 'No provider configured' });
});

app.get('/api/status', (req, res) => {
  const retryAfterMs = Math.max(0, lastRefreshAt + REFRESH_COOLDOWN_MS - Date.now());
  res.json({ lastUpdated: lastRefreshAt || null, retryAfterSec: Math.ceil(retryAfterMs / 1000) });
});

app.post('/api/fetch-models', async (req, res) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!anthropicKey && !geminiKey) {
    return res.status(500).json({ error: 'No API key set. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to .env' });
  }

  // Concurrent clicks share the same in-flight request instead of each hitting the API
  if (inflight) {
    try { return res.json(await inflight); }
    catch (err) { return res.status(502).json({ error: err.message }); }
  }

  const retryAfterMs = lastRefreshAt + REFRESH_COOLDOWN_MS - Date.now();
  if (retryAfterMs > 0) {
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Refresh cooldown active', retryAfterSec, lastUpdated: lastRefreshAt });
  }

  try {
    inflight = refreshModels(anthropicKey, geminiKey);
    res.json(await inflight);
  } catch (err) {
    console.error('API error:', err.message);
    res.status(502).json({ error: err.message });
  } finally {
    inflight = null;
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`The Frontier → http://localhost:${PORT}`));
