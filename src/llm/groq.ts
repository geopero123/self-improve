import type { LLMClient, LLMRequest, LLMResult } from "./index.js";
import { parseResponse } from "./parseResponse.js";
import { buildPrompt } from "./prompt.js";
import { RateLimitError } from "./errors.js";

const DEFAULT_MODEL = "llama-3.1-8b-instant";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqChatResponse {
    choices?: { message?: { content?: string } }[];
}

export class GroqClient implements LLMClient {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model?: string) {
        if (!apiKey) throw new Error("GROQ_API_KEY is not set");
        this.apiKey = apiKey;
        this.model = model ?? DEFAULT_MODEL;
    }

    async generate(request: LLMRequest): Promise<LLMResult> {
        const prompt = buildPrompt(request);

        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                response_format: { type: "json_object" }
            })
        });

        if (!res.ok) {
            const body = await res.text();
            if (res.status === 429) {
                throw new RateLimitError(`Groq API error 429: ${body}`, parseRetryAfterMs(res, body));
            }
            throw new Error(`Groq API error ${res.status}: ${body}`);
        }

        const data = (await res.json()) as GroqChatResponse;
        const text = data.choices?.[0]?.message?.content ?? "";
        return parseResponse(text);
    }
}

const DEFAULT_RETRY_AFTER_MS = 15_000;

function parseRetryAfterMs(res: Response, body: string): number {
    const header = res.headers.get("retry-after");
    if (header) {
        const seconds = Number(header);
        if (!Number.isNaN(seconds)) return seconds * 1000;
    }

    const match = body.match(/try again in ([\d.]+)s/i);
    if (match) return Math.ceil(parseFloat(match[1]) * 1000);

    return DEFAULT_RETRY_AFTER_MS;
}
