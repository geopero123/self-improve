# self-agent

A personal, self-hosted coding agent. It can:

1. Build and host small apps on request, served at `/apps/<id>/`.
2. Propose changes to its **own** source code, test them in isolation, and only apply them once they pass — with your approval required by default.

## Setup

1. Get a free Groq API key at [console.groq.com/keys](https://console.groq.com/keys) — no credit card, works immediately. (Gemini's free tier requires billing/prepay to be set up in some regions, so Groq is the default here.)
2. Copy `.env.example` to `.env` and paste your key in:
   ```
   copy .env.example .env
   ```
   Then edit `.env` and set `GROQ_API_KEY=your-key-here`.
3. Install dependencies (already done if you just scaffolded this):
   ```
   npm install
   ```

To use Gemini instead, set `LLM_PROVIDER=gemini` and `GEMINI_API_KEY=...` in `.env`.

To use a self-hosted model instead (no rate limits, runs on your own GPU):
1. Install [Ollama](https://ollama.com) and pull a model, e.g. `ollama pull qwen2.5:7b-instruct`.
2. Set `LLM_PROVIDER=ollama` in `.env` (`OLLAMA_MODEL`/`OLLAMA_BASE_URL`/`OLLAMA_NUM_CTX` are optional overrides).
3. Run `ollama serve` (or let the Ollama app run in the background), then `npm start` as usual.

Speed notes for small GPUs: Ollama's automatic layer split reserves headroom it often doesn't
need, stranding a few layers on the CPU — on a 6GB RTX 3050 that measured 16.5 tok/s. Setting
`OLLAMA_NUM_GPU=99` forces every layer onto the GPU (identical weights and output, purely a
placement change) and measured 27.5 tok/s, a 1.67x speedup. If a model genuinely doesn't fit,
Ollama will fail to load it — drop the value or unset it to restore the automatic split.
Prompt processing is not the bottleneck (~960 tok/s); generation is (~27 tok/s), and the agent
rewrites whole files, so latency scales with the size of the files being edited, not the size
of the edit.

On a 6-12GB VRAM GPU, stick to 7-8B instruct models — anything bigger leaves too little VRAM for context and will silently truncate the source-tree context this app sends on self-edits, which tends to produce broken output. Quality will generally be a step below Groq/Gemini's hosted models at this size, but there's no external rate limit at all.

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
- Self-improve uses a two-step context strategy to stay within free-tier token limits: first a cheap call with just a file-path listing asks the model which files it needs, then only those files' content is sent for the actual edit (capped at 6 files). This keeps individual requests small regardless of overall codebase size, but very broad asks that genuinely need many files at once may still need to be split into smaller instructions.
- Generated apps are in-memory only in the registry — restarting `npm start` stops them (their files stay on disk under `generated-apps/`, but they won't auto-restart yet).
- API keys are loaded from `.env` via a small built-in loader — no `dotenv` dependency needed.
- The default Groq model may change on Groq's end over time — check [console.groq.com/docs/models](https://console.groq.com/docs/models) if you see model-not-found errors, and set `GROQ_MODEL` in `.env` to override.
- Groq's free tier caps tokens-per-minute per model, and the cap is much lower for large models (e.g. 8k TPM for a 120B model on some accounts) than small ones. Since self-improve sends the whole source tree as context, a small/fast model (the default, `llama-3.1-8b-instant`) is what actually works within free-tier limits — a bigger model may look better on paper but 413 on every real request. If you see a `tokens_per_minute`/413 error, drop to a smaller `GROQ_MODEL`.
