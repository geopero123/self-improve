import { GoogleGenAI } from "@google/genai";
import type { LLMClient, LLMRequest, LLMResult } from "./index.js";
import { parseResponse } from "./parseResponse.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

const RESPONSE_FORMAT_HINT = `
Respond with ONLY a single JSON object, no markdown fences, no commentary outside the JSON. Shape:
{
  "summary": "one or two sentences describing what you did",
  "files": [ { "path": "relative/path/to/file.ext", "content": "full file contents" } ]
}
Each entry in "files" must contain the FULL contents of that file after your change, not a diff or partial snippet.
Only include files you are creating or changing.
`.trim();

export class GeminiClient implements LLMClient {
    private ai: GoogleGenAI;
    private model: string;

    constructor(apiKey: string, model: string = DEFAULT_MODEL) {
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
        this.ai = new GoogleGenAI({ apiKey });
        this.model = model;
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

function buildPrompt(request: LLMRequest): string {
    const parts: string[] = [];

    if (request.systemContext) {
        parts.push(request.systemContext.trim());
    }

    if (request.contextFiles?.length) {
        parts.push("Current relevant files:");
        for (const file of request.contextFiles) {
            parts.push(`--- ${file.path} ---\n${file.content}`);
        }
    }

    parts.push(`Task:\n${request.instruction.trim()}`);
    parts.push(RESPONSE_FORMAT_HINT);

    return parts.join("\n\n");
}
