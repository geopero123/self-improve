import { GoogleGenAI } from "@google/genai";
import type { LLMClient, LLMRequest, LLMResult } from "./index.js";
import { parseResponse } from "./parseResponse.js";
import { buildPrompt } from "./prompt.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiClient implements LLMClient {
    private ai: GoogleGenAI;
    private model: string;

    constructor(apiKey: string, model?: string) {
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
        this.ai = new GoogleGenAI({ apiKey });
        this.model = model ?? DEFAULT_MODEL;
    }

    async generate(request: LLMRequest): Promise<LLMResult> {
        const prompt = buildPrompt(request);

        const response = await this.ai.models.generateContent({
            model: this.model,
            contents: prompt
        });

        const text = response.text ?? "";
        return parseResponse(text);
    }
}
