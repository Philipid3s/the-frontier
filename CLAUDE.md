# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"The Frontier" is an AI model tracker dashboard — a live intelligence feed displaying the latest and upcoming AI models from major labs (OpenAI, Anthropic, Google, Meta, xAI, DeepSeek, Moonshot, MiniMax, Qwen, Mistral).

## Running the Project

```bash
# First-time setup
cp .env.example .env        # then add your ANTHROPIC_API_KEY
npm install

# Start the server
npm start                   # → http://localhost:3000
```

Requires Node.js 18+ (uses the built-in `fetch` API).

## Architecture

```
the-frontier/
├── index.html          # Markup only — no inline CSS or JS
├── styles.css          # All styles (~230 lines, CSS variables for dark theme)
├── app.js              # All client-side logic (render, filter, API fetch)
├── data/
│   └── models.json     # Seed data (14 models) loaded on page init
└── server.js           # Express server: static files + /api/fetch-models proxy
```

**Why a server?** The Anthropic API requires an `x-api-key` header and cannot be called directly from the browser (CORS + key exposure). `server.js` is a thin proxy that keeps the key server-side and forwards requests to `api.anthropic.com`.

**Data flow:**
1. Page loads → `app.js` fetches `/data/models.json` → renders seed cards
2. User clicks "Fetch latest" → `POST /api/fetch-models` → `server.js` calls Claude API → returns JSON array → re-renders cards

## Key Conventions

- Vanilla JS only — no frameworks, no bundler
- API endpoint URL and model ID are `const` declarations at the top of `server.js`
- The prompt that instructs Claude to return model data lives in `server.js:buildPrompt()`
- Filter state lives in `activeFilters` object in `app.js`; filtering operates on DOM `data-*` attributes, not the `allModels` array
- Model card colors use CSS custom property `--card-color` set inline per card
- To add a new capability tag: add the CSS class in `styles.css` (follow `.tag-*` pattern) and add the pill button in `index.html`
- To add a new lab filter: add the pill button in `index.html` and update the `lab` enum comment in `server.js:buildPrompt()`
