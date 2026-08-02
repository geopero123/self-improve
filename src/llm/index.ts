import { GeminiClient } from "./gemini.js";
import { GroqClient } from "./groq.js";
import { GroqPoolClient } from "./groqPool.js";
import { OllamaClient } from "./ollama.js";

export interface LLMFile {
    path: string;
    content: string;
}

export interface LLMRequest {
    instruction: string;
    /** Existing files the model should treat as current state (e.g. its own source, for self-edits). */
    contextFiles?: LLMFile[];
    /** Extra system-level framing (e.g. "you are editing your own source code"). */
    systemContext?: string;
}

export interface LLMResult {
    summary: string;
    files: LLMFile[];
}

export interface LLMClient {
    generate(request: LLMRequest): Promise<LLMResult>;
}

export { GeminiClient } from "./gemini.js";
export { GroqClient } from "./groq.js";
export { OllamaClient } from "./ollama.js";
export { RateLimitError } from "./errors.js";

function splitKeys(value?: string): string[] {
    return (value ?? "")
        .split(",")
        .map(key => key.trim())
        .filter(Boolean);
}

/** Picks the LLM backend from env: LLM_PROVIDER=groq (default, free no-card tier), gemini, or ollama (self-hosted, no limits). */
export function createLLMClient(): LLMClient {
    const provider = (process.env.LLM_PROVIDER ?? "groq").toLowerCase();

    if (provider === "groq") {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error(
                "GROQ_API_KEY is not set. Get a free key (no card required) at https://console.groq.com/keys " +
                    "and add it to .env."
            );
        }

        const extraPrimaryKeys = splitKeys(process.env.GROQ_API_KEYS_EXTRA);
        const fallbackKeys = splitKeys(process.env.GROQ_FALLBACK_API_KEYS);
        const primaryKeys = [apiKey, ...extraPrimaryKeys];

        if (extraPrimaryKeys.length === 0 && fallbackKeys.length === 0) {
            return new GroqClient(apiKey, process.env.GROQ_MODEL);
        }
        return new GroqPoolClient(primaryKeys, fallbackKeys, process.env.GROQ_MODEL);
    }

    if (provider === "gemini") {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.");
        }
        return new GeminiClient(apiKey, process.env.GEMINI_MODEL);
    }

    if (provider === "ollama") {
        const numCtx = process.env.OLLAMA_NUM_CTX ? Number(process.env.OLLAMA_NUM_CTX) : undefined;
        const numGpu = process.env.OLLAMA_NUM_GPU ? Number(process.env.OLLAMA_NUM_GPU) : undefined;
        return new OllamaClient(
            process.env.OLLAMA_BASE_URL,
            process.env.OLLAMA_MODEL,
            numCtx,
            process.env.OLLAMA_KEEP_ALIVE,
            numGpu
        );
    }

    throw new Error(`Unknown LLM_PROVIDER "${provider}". Use "groq", "gemini", or "ollama".`);
}
