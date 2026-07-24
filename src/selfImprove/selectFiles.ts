import type { LLMClient } from "../llm/index.js";

const MAX_SELECTED_FILES = 6;

const SYSTEM_CONTEXT = `
You are about to edit files in a Node.js/TypeScript agent's own source tree, but you have NOT been shown file
contents yet - only paths, to keep this request small. Decide which of these existing files you need to read
before you can make the requested change, plus any brand new file paths you intend to create.

Project layout, to help you pick the right files:
- public/*.html, public/*.css, public/*.js: the web UI - what the user actually sees and reads as text/labels/styling.
- src/apps/*, src/proxy.ts: hosting generated user apps at /apps/<id>/.
- src/selfImprove/*: the safety pipeline (snapshot/trial/verify/promote/rollback) that applies self-edits. Only
  touch these if the task is explicitly about how self-improvement itself works, not about UI wording or appearance.
- src/llm/*: the LLM client/provider integration.
- src/server.ts: the Express routes wiring everything together.
If the request is about visible text, labels, colors, or layout, the files you need are almost always under public/,
not src/selfImprove/.

Respond with the same JSON shape as usual: { "summary": "", "files": [ { "path": "...", "content": "" } ] }
where each entry's "path" is a file you need to see or create, and "content" is just an empty string for now
(you'll write the real content in a later step). Only list files you actually need - keep the list short.
`.trim();

/** Cheap first pass: ask the model which files (from a path-only listing) it needs full content for. */
export async function selectRelevantFiles(llm: LLMClient, instruction: string, allPaths: string[]): Promise<string[]> {
    const result = await llm.generate({
        instruction,
        systemContext: `${SYSTEM_CONTEXT}\n\nAvailable files:\n${allPaths.join("\n")}`
    });

    const unique = [...new Set(result.files.map(f => f.path))];
    return unique.slice(0, MAX_SELECTED_FILES);
}
