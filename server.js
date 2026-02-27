require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

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

app.post('/api/fetch-models', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in environment' });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: buildPrompt() }]
      })
    });

    const data = await upstream.json();
    const raw = data?.content?.[0]?.text || '';
    const clean = raw.replace(/```json|```/gi, '').trim();
    const models = JSON.parse(clean);
    res.json(models);
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    res.status(502).json({ error: 'Failed to fetch from Anthropic API' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`The Frontier → http://localhost:${PORT}`));
