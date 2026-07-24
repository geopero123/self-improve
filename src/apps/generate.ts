import type { LLMClient } from "../llm/index.js";
import { createApp } from "./runner.js";
import type { AppRecord } from "./registry.js";

const SYSTEM_CONTEXT = `
You are generating a small standalone web application to be hosted at a sub-path like /apps/<id>/.
Constraints:
- Use ONLY Node.js built-in modules (http, fs, path, etc). No npm dependencies, no build step, no package.json.
- The entry file MUST be named "server.js" and MUST listen on the port from process.env.PORT.
- Every HTML page, asset URL, and link the app serves must be relative (e.g. "./style.css", not "/style.css"),
  since the app is served under a sub-path and does not own the domain root.
- Serve a complete, working, reasonably nice-looking UI for what was asked, using inline <style> or a relative
  stylesheet file. Keep it self-contained.
`.trim();

export interface GenerateAppResult {
    record: AppRecord;
    summary: string;
}

/** Asks the LLM to build a small self-contained app from a prompt, then hosts it. */
export async function generateApp(llm: LLMClient, instruction: string): Promise<GenerateAppResult> {
    const result = await llm.generate({
        instruction,
        systemContext: SYSTEM_CONTEXT
    });

    if (!result.files.some(f => f.path === "server.js")) {
        throw new Error("Model did not produce a server.js entry file");
    }

    const name = instruction.slice(0, 60);
    const record = await createApp(name, result.files, "server.js");
    return { record, summary: result.summary };
}
