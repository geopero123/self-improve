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
