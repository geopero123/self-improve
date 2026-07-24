import type { LLMRequest } from "./index.js";

const RESPONSE_FORMAT_HINT = `
Respond with ONLY a single JSON object, no markdown fences, no commentary outside the JSON. Shape:
{
  "summary": "one or two sentences describing what you did",
  "files": [ { "path": "relative/path/to/file.ext", "content": "full file contents" } ]
}
Each entry in "files" must contain the FULL contents of that file after your change, not a diff or partial snippet.
Only include files you are creating or changing.
The "content" value must be a single valid JSON string: escape newlines as \n and double quotes as \", on one
logical JSON string - never use triple quotes or any other non-JSON syntax for it.
`.trim();

export function buildPrompt(request: LLMRequest): string {
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
