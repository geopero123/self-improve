import type { LLMClient, LLMRequest, LLMResult } from "./index.js";
import { parseResponse } from "./parseResponse.js";
import { buildPrompt } from "./prompt.js";

const DEFAULT_MODEL = "qwen2.5:7b-instruct";
const DEFAULT_BASE_URL = "http://localhost:11434";
// Self-edits send the whole source tree as context, so context window matters more than raw
// model size here. Keep this generous rather than maxing out model size and starving the context.
const DEFAULT_NUM_CTX = 4096;
// Ollama unloads an idle model after ~5 minutes, and reloading a 7B costs ~45s on a small GPU.
// Self-improve makes several calls with think time between them, so keep it resident.
const DEFAULT_KEEP_ALIVE = "30m";

interface OllamaChatResponse {
    message?: { content?: string };
}

export class OllamaClient implements LLMClient {
    private baseUrl: string;
    private model: string;
    private numCtx: number;
    private keepAlive: string;

    constructor(baseUrl?: string, model?: string, numCtx?: number, keepAlive?: string) {
        this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
        this.model = model ?? DEFAULT_MODEL;
        this.numCtx = numCtx ?? DEFAULT_NUM_CTX;
        this.keepAlive = keepAlive ?? DEFAULT_KEEP_ALIVE;
    }

    async generate(request: LLMRequest): Promise<LLMResult> {
        const prompt = buildPrompt(request);

        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: "user", content: prompt }],
                    stream: false,
                    format: "json",
                    keep_alive: this.keepAlive,
                    options: { temperature: 0.2, num_ctx: this.numCtx }
                })
            });
        } catch (err) {
            throw new Error(
                `Could not reach Ollama at ${this.baseUrl}: ${(err as Error).message}\n` +
                    "Make sure Ollama is installed and running (`ollama serve`)."
            );
        }

        if (!res.ok) {
            const body = await res.text();
            if (res.status === 404) {
                throw new Error(
                    `Ollama model "${this.model}" not found. Pull it first: \`ollama pull ${this.model}\``
                );
            }
            throw new Error(`Ollama API error ${res.status}: ${body}`);
        }

        const data = (await res.json()) as OllamaChatResponse;
        const text = data.message?.content ?? "";
        return parseResponse(text);
    }
}
