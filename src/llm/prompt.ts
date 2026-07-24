import type { LLMRequest } from "./index.js";

const RESPONSE_FORMAT_HINT = `
Respond with ONLY a single JSON object, no markdown fences, no commentary outside the JSON. Shape:
{
  "summary": "one or two sentences describing what you did",
  "files": [ { "path": "relative/path/to/file.ext", "content": "full file contents" } ]
}
Each entry in "files" must contain the FULL, complete contents of that file after your change - every line,
including the parts you did not change. NEVER use placeholder comments like "... (unchanged)", "// rest stays
the same", or any other stand-in for content you're omitting - that produces a broken, truncated file. If you
are only changing one part of a file, you must still copy out the entire rest of the file byte-for-byte around
your change.
Only include files you are creating or changing.
The "content" value must be a single valid JSON string: escape newlines as \\n and double quotes as \\", on one
logical JSON string - never use triple quotes or any other non-JSON syntax for it.
Write any non-ASCII characters (accents, emoji, symbols) as literal UTF-8 characters in the string - do not use
\\u escape sequences for them, and never use \\u{...} (that is not valid JSON; \\u must be followed by exactly 4
hex digits if used at all).
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
