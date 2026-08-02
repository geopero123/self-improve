import type { LLMClient, LLMFile } from "../llm/index.js";
import { createApp, readAppFiles, writeAppFiles, restartApp } from "./runner.js";
import { get as getAppRecord } from "./registry.js";
import type { AppRecord } from "./registry.js";

const SYSTEM_CONTEXT = `
You are generating a small standalone web application to be hosted at a sub-path like /apps/<id>/.
Constraints:
- Use ONLY Node.js built-in modules (http, fs, path, etc). No npm dependencies, no build step, no package.json.
- The entry file MUST be named "server.js" and MUST listen on the port from process.env.PORT.
- Every HTML page, asset URL, and link the app serves must be relative (e.g. "./style.css", not "/style.css"),
  since the app is served under a sub-path and does not own the domain root.
- This relative-URL rule applies ONLY to href/src attributes written in HTML. It does NOT apply to server.js:
  req.url is always the resolved absolute path (e.g. "/", "/style.css"), never a literal "./" string. Compare
  req.url against absolute paths like "/" and "/style.css", not "./" or "./style.css".
- Serve a complete, working, reasonably nice-looking UI for what was asked, using inline <style> or a relative
  stylesheet file. Keep it self-contained.
`.trim();

const FUNCTIONAL_REVIEW_INSTRUCTION = `
Act as a tester. Read through server.js and every file it serves as if you were going to run
"node server.js" and click through the app in a browser. Look specifically for: syntax errors; route/URL
comparisons in server.js that don't match what a browser will actually request (req.url is always an
absolute path like "/" or "/style.css", never "./..."); broken references between files (a script or
stylesheet the HTML links to that the server doesn't actually serve, or vice versa); and any JS logic bug
that would make a button or feature not work.
If you find a real bug, fix it and return the complete corrected contents of every file you changed.
If you do not find any bugs, return an empty "files" array - do not return files just to restate them
unchanged.
`.trim();

const DESIGN_REVIEW_INSTRUCTION = `
Act as a design reviewer. Look at the HTML/CSS of this app and judge whether it looks reasonably polished:
sensible spacing and alignment, a coherent color scheme, readable typography, and no obviously broken or
bare-bones layout for what the app is supposed to be.
If the design is weak, improve the styling (and only the styling/markup needed for it - don't change working
logic) and return the complete corrected contents of every file you changed.
If the design already looks reasonably good, return an empty "files" array - do not return files just to
restate them unchanged.
`.trim();

const MAX_ROUNDS_PER_PASS = 2;

export interface GenerateAppResult {
    record: AppRecord;
    summary: string;
}

/** Overlays changed/new files from a patch onto a base file set, keeping everything else from base. */
function mergeFiles(base: LLMFile[], patch: LLMFile[]): LLMFile[] {
    const merged = new Map(base.map(f => [f.path, f]));
    for (const file of patch) merged.set(file.path, file);
    return [...merged.values()];
}

/**
 * Runs one review "pass" (e.g. functional testing, or a design critique) against the current files,
 * asking the model to fix anything it doesn't like. Loops up to MAX_ROUNDS_PER_PASS times since a fix
 * can itself introduce something worth re-checking; stops as soon as a round reports no changes needed.
 */
async function reviewPass(
    llm: LLMClient,
    files: LLMFile[],
    label: string,
    focusInstruction: string,
    onProgress?: (message: string) => void
): Promise<LLMFile[]> {
    let current = files;
    for (let round = 1; round <= MAX_ROUNDS_PER_PASS; round++) {
        onProgress?.(`${label}: reviewing (pass ${round}/${MAX_ROUNDS_PER_PASS})...`);
        const result = await llm.generate({
            instruction: focusInstruction,
            contextFiles: current,
            systemContext: SYSTEM_CONTEXT + "\n\nYou are reviewing an app that already exists, not building a new one."
        });

        if (result.files.length === 0) {
            onProgress?.(`${label}: looks good, no changes needed.`);
            return current;
        }

        onProgress?.(`${label}: found issues, fixed ${result.files.map(f => f.path).join(", ")}.`);
        current = mergeFiles(current, result.files);
    }
    return current;
}

/** Runs the app through a functional test pass and a design review pass, fixing what each finds. */
async function reviewAndTest(
    llm: LLMClient,
    files: LLMFile[],
    onProgress?: (message: string) => void
): Promise<LLMFile[]> {
    let current = await reviewPass(llm, files, "Testing", FUNCTIONAL_REVIEW_INSTRUCTION, onProgress);
    current = await reviewPass(llm, current, "Design review", DESIGN_REVIEW_INSTRUCTION, onProgress);
    return current;
}

/** Asks the LLM to build a small self-contained app from a prompt, tests/reviews it, then hosts it. */
export async function generateApp(
    llm: LLMClient,
    instruction: string,
    onProgress?: (message: string) => void
): Promise<GenerateAppResult> {
    onProgress?.("Building: writing the first draft...");
    const result = await llm.generate({
        instruction,
        systemContext: SYSTEM_CONTEXT
    });

    if (!result.files.some(f => f.path === "server.js")) {
        throw new Error("Model did not produce a server.js entry file");
    }

    const finalFiles = await reviewAndTest(llm, result.files, onProgress);

    const name = instruction.slice(0, 60);
    const record = await createApp(name, finalFiles, "server.js");
    return { record, summary: result.summary };
}

/** Asks the LLM to revise an existing generated app, tests/reviews the result, then restarts it in place. */
export async function iterateApp(
    llm: LLMClient,
    id: string,
    instruction: string,
    onProgress?: (message: string) => void
): Promise<GenerateAppResult> {
    const record = getAppRecord(id);
    if (!record) {
        throw new Error(`No app with id "${id}"`);
    }

    const existingFiles = await readAppFiles(record.dir);
    onProgress?.("Applying your requested change...");
    const result = await llm.generate({
        instruction,
        contextFiles: existingFiles,
        systemContext:
            SYSTEM_CONTEXT +
            "\n\nYou are EDITING an existing app, not creating a new one. The current files are given " +
            "as context - apply the requested change to them. Return the COMPLETE updated set of files " +
            "(every file the app needs to run, not just the ones that changed)."
    });

    if (!result.files.some(f => f.path === "server.js")) {
        throw new Error("Model did not produce a server.js entry file");
    }

    const finalFiles = await reviewAndTest(llm, result.files, onProgress);

    await writeAppFiles(record.dir, finalFiles);
    restartApp(record);
    return { record, summary: result.summary };
}
