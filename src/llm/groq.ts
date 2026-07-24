import type { LLMClient, LLMRequest, LLMResult } from "./index.js";
import { parseResponse } from "./parseResponse.js";
import { buildPrompt } from "./prompt.js";

const DEFAULT_MODEL = "qwen/qwen3-32b";
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
                temperature: 0.2
            })
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Groq API error ${res.status}: ${body}`);
        }

        const data = (await res.json()) as GroqChatResponse;
        const text = data.choices?.[0]?.message?.content ?? "";
        return parseResponse(text);
    }
}
