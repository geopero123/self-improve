import { promises as fs } from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../paths.js";
import type { LLMFile } from "../llm/index.js";

const INCLUDE_DIRS = ["src", "public", "tests"];
const INCLUDE_ROOT_FILES = ["package.json", "supervisor.js", "tsconfig.json"];

/** Reads the agent's own source tree so the model can see what it's editing. */
export async function collectSourceFiles(): Promise<LLMFile[]> {
    const files: LLMFile[] = [];

    for (const rootFile of INCLUDE_ROOT_FILES) {
        try {
            files.push({
                path: rootFile,
                content: await fs.readFile(path.join(ROOT_DIR, rootFile), "utf8")
            });
        } catch {
            // optional file, skip if missing
        }
    }

    for (const dir of INCLUDE_DIRS) {
        await walk(path.join(ROOT_DIR, dir), dir, files);
    }

    return files;
}

async function walk(dirAbs: string, dirRel: string, out: LLMFile[]): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
        entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const abs = path.join(dirAbs, entry.name);
        const rel = path.join(dirRel, entry.name);
        if (entry.isDirectory()) {
            await walk(abs, rel, out);
        } else {
            out.push({ path: rel.replace(/\\/g, "/"), content: await fs.readFile(abs, "utf8") });
        }
    }
}
