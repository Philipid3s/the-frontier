# Project Guidelines

This repository contains a single HTML page (`ai-models-dynamic.html`) that displays the latest and upcoming AI models. The code base is minimal and primarily consists of client-side HTML/JavaScript.

## Code Style
- The project uses plain HTML, CSS, and JavaScript.
- Follow existing style in `ai-models-dynamic.html` when adding new script or markup.
- Keep JavaScript simple and avoid frameworks; vanilla DOM APIs are fine.

## Architecture
- Single-page static asset.
- No build system or server components; changes are committed directly.
- Scripts fetch model data dynamically from external APIs (if applicable).

## Build and Test
- There is no build step. Open `ai-models-dynamic.html` in a browser to view changes.
- If additional assets are added, ensure they are referenced with relative paths.

## Project Conventions
- Keep functions and variables names clear and self-documenting.
- When modifying or adding features, update inline comments rather than external docs.

## Integration Points
- External API endpoints may be used to retrieve AI model data; store URLs in constants at the top of the HTML file.

## Security
- This repository is a static frontend; no sensitive credentials should be stored.
- Avoid committing API keys; use a development mechanism if required (e.g., prompt user input).

> This file is used by Copilot and other AI agents to understand project-specific patterns. It is intentionally brief due to the repository's size.