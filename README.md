# self-agent

A personal, self-hosted coding agent. It can:

1. Build and host small apps on request, served at `/apps/<id>/`.
2. Propose changes to its **own** source code, test them in isolation, and only apply them once they pass — with your approval required by default.

## Setup

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) (no credit card required for the free tier).
2. Copy `.env.example` to `.env` and paste your key in:
   ```
   copy .env.example .env
   ```
   Then edit `.env` and set `GEMINI_API_KEY=your-key-here`.
3. Install dependencies (already done if you just scaffolded this):
   ```
   npm install
   ```

## Running it

```
npm start
```

This starts `supervisor.js`, which spawns the actual server and restarts it whenever a self-improve change is promoted. Open **http://localhost:3000**.

For local development without the supervisor/restart behavior:
```
npm run dev
```

## Using it

- **Build an app**: type a description in the "Build an app" box. It writes a small self-contained Node.js app (no npm deps, single `server.js`) into `generated-apps/<id>/`, runs it as its own process, and links it at `/apps/<id>/`.
- **Improve yourself**: type an instruction (e.g. "give yourself a real UI and color scheme", "add a dark mode toggle"). The agent:
  1. Snapshots the current commit as a rollback point.
  2. Applies the proposed change in an isolated git worktree (never touches the live code directly).
  3. Runs typecheck, the test suite, and an actual boot+health-check against that isolated copy.
  4. If anything fails, it retries (up to 3 attempts) with the error fed back to the model, then gives up and reports the failure — live code is never touched on failure.
  5. If everything passes, **by default it waits for you to click Approve** in the activity log before merging and restarting. Set `SELF_IMPROVE_AUTO=1` in `.env` to skip the approval step once you trust it.

## Notes / limitations (MVP)

- Generated apps and self-edits currently can't add new npm dependencies — keeps `npm install` out of the hot path so builds stay fast and predictable. Ask it to work with what's already installed, or add dependencies yourself and re-run `npm install`.
- The self-improve step sends your whole `src/`, `public/`, and `tests/` tree to the model as context each time. Fine at this codebase's current size; will need chunking if the codebase grows a lot.
- Generated apps are in-memory only in the registry — restarting `npm start` stops them (their files stay on disk under `generated-apps/`, but they won't auto-restart yet).
- `GEMINI_API_KEY` is loaded from `.env` via a small built-in loader — no `dotenv` dependency needed.
