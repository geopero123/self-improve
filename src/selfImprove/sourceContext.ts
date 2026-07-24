import { promises as fs } from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../paths.js";
import type { LLMFile } from "../llm/index.js";

const INCLUDE_DIRS = ["src", "public", "tests"];
const INCLUDE_ROOT_FILES = ["package.json", "supervisor.js", "tsconfig.json"];

/** Lists every source file path (no content) so the model can pick what it actually needs to see. */
export async function listSourcePaths(): Promise<string[]> {
    const paths: string[] = [];

    for (const rootFile of INCLUDE_ROOT_FILES) {
        try {
            await fs.access(path.join(ROOT_DIR, rootFile));
            paths.push(rootFile);
        } catch {
            // optional file, skip if missing
        }
    }

    for (const dir of INCLUDE_DIRS) {
        await walk(path.join(ROOT_DIR, dir), dir, paths);
    }

    return paths;
}

/** Reads the content of a specific subset of source files. Missing paths (e.g. new files) are skipped. */
export async function readSourceFiles(paths: string[]): Promise<LLMFile[]> {
    const files: LLMFile[] = [];
    for (const relPath of paths) {
        try {
            const content = await fs.readFile(path.join(ROOT_DIR, relPath), "utf8");
            files.push({ path: relPath, content });
        } catch {
            // model asked for a file that doesn't exist yet - it's presumably creating it
        }
    }
    return files;
}

async function walk(dirAbs: string, dirRel: string, out: string[]): Promise<void> {
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
            out.push(rel.replace(/\\/g, "/"));
        }
    }
}
