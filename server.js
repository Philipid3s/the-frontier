require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const GEMINI_MODEL = 'gemini-2.5-flash';

function buildPrompt() {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `You are a real-time AI model intelligence tracker. Today is ${today}.

Return a JSON array of the most important recent and upcoming AI models. Include ALL major labs: OpenAI, Anthropic, Google, Meta, xAI, DeepSeek, Mistral, and others relevant.

For each model return EXACTLY this JSON shape:
{
  "name": "Model Name",
  "lab": "openai|anthropic|google|meta|xai|deepseek|mistral|other",
  "date": "Short date string e.g. Feb 2026 or Q2 2026",
  "status": "released|upcoming|imminent",
  "logo": "Single relevant emoji",
  "logoBg": "Dark hex color for logo background",
  "color": "Brand-appropriate hex accent color",
  "desc": "2-3 sentence description of key capabilities and positioning.",
  "tags": ["coding","reasoning","multimodal","agents","open","video","speed"],
  "note": "Optional short warning/note string, or null"
}

Rules:
- "imminent" = announced/leaked and expected within ~4 weeks
- "upcoming" = expected in next 1-6 months
- "released" = launched in last ~3 months
- Include 6-8 released and 4-6 upcoming/imminent
- Be accurate and specific about benchmarks/capabilities
- Respond with ONLY the raw JSON array, no markdown, no explanation`;
}

async function fetchFromAnthropic(apiKey) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: buildPrompt() }]
    })
  });
  const data = await res.json();
  if (data.type === 'error') throw new Error(data.error?.message || 'Anthropic API error');
  const textBlock = (data?.content || []).filter(b => b.type === 'text').pop();
  return textBlock?.text || '';
}

async function fetchFromGemini(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt() }] }],
      generationConfig: { maxOutputTokens: 8192 }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini API error');
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

app.post('/api/fetch-models', async (req, res) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!anthropicKey && !geminiKey) {
    return res.status(500).json({ error: 'No API key set. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to .env' });
  }

  try {
    let raw;
    if (anthropicKey) {
      console.log('Using Anthropic');
      raw = await fetchFromAnthropic(anthropicKey);
    } else {
      console.log('Using Gemini');
      raw = await fetchFromGemini(geminiKey);
    }
    const clean = raw.replace(/```json|```/gi, '').trim();
    const models = JSON.parse(clean);
    await fs.writeFile(path.join(__dirname, 'data', 'models.json'), JSON.stringify(models, null, 2));
    res.json(models);
  } catch (err) {
    console.error('API error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`The Frontier → http://localhost:${PORT}`));
