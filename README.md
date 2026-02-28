# The Frontier

> A live intelligence dashboard tracking the latest and upcoming AI models from major labs — powered by Claude.

Covers **OpenAI · Anthropic · Google · Meta · xAI · DeepSeek · Moonshot · MiniMax · Qwen · Mistral** and updates on demand by querying Claude for real-time model intelligence.

---

## Features

- **Live fetch** — click "Fetch latest" to query Claude for the current frontier model landscape
- **Seed data** — 14 pre-loaded models so the dashboard is never empty; shown immediately on load and used as a fallback if the API is unavailable
- **Filter & search** — filter by status (Released / Upcoming / Imminent), lab, or capability; full-text search across name, description, and tags
- **Stats bar** — live counts for total models tracked, released, upcoming, and active labs
- **Three themes** — Void (default), Nord, and Dracula; persisted to `localStorage`
- **Zero dependencies on the frontend** — vanilla JS, no framework, no bundler

---

## Getting Started

**Prerequisites:** Node.js 18+ and an [Anthropic API key](https://console.anthropic.com/).

```bash
# 1. Clone the repo
git clone https://github.com/your-username/the-frontier.git
cd the-frontier

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Open .env and set your key:
#   ANTHROPIC_API_KEY=sk-ant-...

# 4. Start the server
npm start
# → http://localhost:3000
```

To use a different port set `PORT` in your `.env` file.

---

## How It Works

```
Browser                          Server (server.js)           Anthropic API
  │                                      │                          │
  │── GET /data/models.json ────────────>│                          │
  │<─ seed data (14 models) ────────────│                          │
  │   render cards immediately           │                          │
  │                                      │                          │
  │── POST /api/fetch-models ───────────>│                          │
  │                                      │── POST /v1/messages ───>│
  │                                      │<─ JSON model array ─────│
  │<─ JSON model array ─────────────────│                          │
  │   re-render cards                    │                          │
```

A thin Express proxy (`server.js`) handles the Anthropic API call server-side, keeping your API key out of the browser and avoiding CORS restrictions. The prompt in `buildPrompt()` instructs Claude to return a structured JSON array — no parsing gymnastics required.

---

## Project Structure

```
the-frontier/
├── index.html          # Markup only — no inline CSS or JS
├── styles.css          # All styles; CSS variables drive the three themes
├── app.js              # Client-side render, filter, fetch, and theme logic
├── server.js           # Express server: static files + /api/fetch-models proxy
├── data/
│   └── models.json     # Seed data (14 models) shown on initial load
└── .env.example        # Environment variable template
```

---

## Extending

**Add a new lab filter**

1. Add a pill button in `index.html` inside `#pills-lab`:
   ```html
   <button class="pill" data-group="lab" data-val="newlab" onclick="setPill(this)">NewLab</button>
   ```
2. Add the lab name to the enum comment in `server.js:buildPrompt()` so Claude knows to include it.

**Add a new capability tag**

1. Add a `.tag-newcap` style in `styles.css` following the existing `.tag-*` pattern.
2. Add a pill button in `index.html` inside `#pills-cap`.

**Change the AI model used**

Update the `MODEL` constant at the top of `server.js`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML, CSS (no framework) |
| Backend | Node.js, Express |
| AI | Claude (`claude-sonnet-4-20250514`) via Anthropic API |
| Fonts | Space Mono, DM Serif Display (Google Fonts) |

---

## License

MIT
