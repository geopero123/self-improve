import type { LLMFile, LLMResult } from "./index.js";

export function parseResponse(text: string): LLMResult {
    const jsonText = extractJson(text);
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (err) {
        throw new Error(`Model did not return valid JSON: ${(err as Error).message}\n---\n${text}`);
    }

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("files" in parsed) ||
        !Array.isArray((parsed as { files: unknown }).files)
    ) {
        throw new Error(`Model response missing "files" array:\n${text}`);
    }

    const raw = parsed as { summary?: unknown; files: unknown[] };
    const files: LLMFile[] = raw.files.map((f, i) => {
        if (
            typeof f !== "object" ||
            f === null ||
            typeof (f as { path?: unknown }).path !== "string" ||
            typeof (f as { content?: unknown }).content !== "string"
        ) {
            throw new Error(`files[${i}] is missing a string "path" or "content"`);
        }
        return { path: (f as LLMFile).path, content: (f as LLMFile).content };
    });

    return {
        summary: typeof raw.summary === "string" ? raw.summary : "",
        files
    };
}

/** Strips markdown code fences if the model wrapped the JSON in them despite instructions. */
export function extractJson(text: string): string {
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch) return fenceMatch[1];
    return trimmed;
}
