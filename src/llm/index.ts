import { GeminiClient } from "./gemini.js";
import { GroqClient } from "./groq.js";

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

/** Picks the LLM backend from env: LLM_PROVIDER=groq (default, free no-card tier) or gemini. */
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
        return new GroqClient(apiKey, process.env.GROQ_MODEL);
    }

    if (provider === "gemini") {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.");
        }
        return new GeminiClient(apiKey, process.env.GEMINI_MODEL);
    }

    throw new Error(`Unknown LLM_PROVIDER "${provider}". Use "groq" or "gemini".`);
}
