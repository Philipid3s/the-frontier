# The Frontier

> A live intelligence dashboard tracking the latest and upcoming AI models from major labs.

Covers **OpenAI · Anthropic · Google · Meta · xAI · DeepSeek · Moonshot · MiniMax · Qwen · Mistral** and updates on demand by querying an AI model for real-time intelligence.

---

## Features

- **Instant load** — page renders cached data from `models.json` immediately on load, no API call needed
- **Refresh on demand** — click "Refresh" to query the AI for the latest model landscape; `models.json` is updated on every successful fetch
- **Dual AI provider** — works with an Anthropic key (Claude Sonnet) or a Gemini key (Gemini 2.5 Flash, free tier); Anthropic takes priority if both are set
- **Filter & search** — filter by status (Released / Upcoming / Imminent), lab, or capability; full-text search across name, description, and tags
- **Stats bar** — live counts for total models tracked, released, upcoming, and active labs
- **Three themes** — Void (default), Nord, and Dracula; persisted to `localStorage`
- **Zero frontend dependencies** — vanilla JS, no framework, no bundler

---

## Getting Started

**Prerequisites:** Node.js 18+ and at least one API key (Anthropic or Gemini).

```bash
# 1. Clone the repo
git clone https://github.com/your-username/the-frontier.git
cd the-frontier

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Open .env and set at least one key:
#   ANTHROPIC_API_KEY=sk-ant-...   ← preferred
#   GEMINI_API_KEY=AIza...         ← free tier alternative (aistudio.google.com)

# 4. Start the server
npm start
# → http://localhost:3000
```

To use a different port set `PORT` in your `.env` file.

---

## Docker

A pre-built image is available. Copy `.env.example` to `.env`, fill in your key(s), then:

```bash
docker compose up -d
```

The `data/` folder is mounted as a named volume (`frontier-data`) so `models.json` persists across image updates — pulling a new image and recreating the container will not overwrite your cached data.

---

## How It Works

```
Page load
  Browser ── GET /data/models.json ──> Server ──> render cards immediately

Refresh click
  Browser ── POST /api/fetch-models ──> Server ──> AI API (Anthropic or Gemini)
                                                 <── JSON model array
          <── JSON model array ─────────────────
              re-render cards + overwrite data/models.json
```

A thin Express proxy (`server.js`) handles the AI API call server-side, keeping your key out of the browser and avoiding CORS restrictions. The prompt in `buildPrompt()` instructs the model to return a structured JSON array. On success, the response overwrites `data/models.json` so the next page load shows fresh data instantly.

---

## Project Structure

```
the-frontier/
├── index.html          # Markup only — no inline CSS or JS
├── styles.css          # All styles; CSS variables drive the three themes
├── app.js              # Client-side render, filter, fetch, and theme logic
├── server.js           # Express server: static files + /api/fetch-models proxy
├── docker-compose.yml  # Docker Compose with persistent data volume
├── data/
│   └── models.json     # Cached model data — updated on every successful refresh
└── .env.example        # Environment variable template
```

---

## Extending

**Add a new lab filter**

1. Add a pill button in `index.html` inside `#pills-lab`:
   ```html
   <button class="pill" data-group="lab" data-val="newlab" onclick="setPill(this)">NewLab</button>
   ```
2. Add the lab name to the enum comment in `server.js:buildPrompt()`.

**Add a new capability tag**

1. Add a `.tag-newcap` style in `styles.css` following the existing `.tag-*` pattern.
2. Add a pill button in `index.html` inside `#pills-cap`.

**Switch AI provider or model**

Update `ANTHROPIC_MODEL` or `GEMINI_MODEL` at the top of `server.js`. Provider selection is automatic based on which key is present in `.env`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML, CSS (no framework) |
| Backend | Node.js, Express |
| AI (preferred) | Claude Sonnet (`claude-sonnet-4-20250514`) via Anthropic API |
| AI (free tier) | Gemini 2.5 Flash via Google AI Studio API |
| Fonts | Space Mono, DM Serif Display (Google Fonts) |

---

## License

MIT
