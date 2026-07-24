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
        const file = { path: (f as LLMFile).path, content: (f as LLMFile).content };
        const doubleEncoded = looksDoubleEncoded(file.content);
        if (doubleEncoded) {
            throw new Error(
                `files[${i}] ("${file.path}") content ${doubleEncoded} - it looks like the file was ` +
                    "JSON-stringified into the \"content\" value instead of written as plain text. Write the " +
                    "actual file content directly as the JSON string value (with real \\n escapes for newlines " +
                    "in the JSON itself), not a second layer of encoding."
            );
        }
        return file;
    });

    return {
        summary: typeof raw.summary === "string" ? raw.summary : "",
        files
    };
}

/**
 * Detects a real incident: the model wrapped a whole file's real content in an extra layer of
 * JSON-string encoding, so the actual bytes were things like literal `\n` two-character sequences
 * instead of real newlines, with the whole thing wrapped in a stray leading `{"` / trailing `"`.
 * Multi-line files (>200 chars) with zero real newlines but literal "\n" sequences are the tell.
 */
function looksDoubleEncoded(content: string): string | null {
    if (content.length < 200) return null;
    const hasRealNewline = content.includes("\n");
    const hasLiteralEscapedNewline = content.includes("\\n");
    if (!hasRealNewline && hasLiteralEscapedNewline) {
        return "contains literal \\n escape sequences but no real newline characters";
    }
    return null;
}

/** Strips markdown code fences if the model wrapped the JSON in them despite instructions. */
export function extractJson(text: string): string {
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch) return fenceMatch[1];
    return trimmed;
}
