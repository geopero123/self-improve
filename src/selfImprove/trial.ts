import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { simpleGit } from "simple-git";
import { ROOT_DIR, TRIALS_DIR } from "../paths.js";
import type { LLMFile } from "../llm/index.js";
import type { TrialInfo } from "./types.js";

const git = simpleGit(ROOT_DIR);

/**
 * Applies proposed files in an isolated git worktree (a separate real copy of the
 * repo on disk, on its own branch) so nothing touches the live running source.
 */
export async function createTrial(baseCommit: string, files: LLMFile[], summary: string): Promise<TrialInfo> {
    const id = randomUUID().slice(0, 8);
    const branch = `self-improve/${id}`;
    const dir = path.join(TRIALS_DIR, id);

    await fs.mkdir(TRIALS_DIR, { recursive: true });
    await git.raw(["worktree", "add", "-b", branch, dir, baseCommit]);

    await linkNodeModules(dir);

    const resolvedDir = path.resolve(dir);
    for (const file of files) {
        const target = path.resolve(dir, file.path);
        if (!target.startsWith(resolvedDir + path.sep)) {
            throw new Error(`Refusing to write outside trial directory: ${file.path}`);
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, "utf8");
    }

    const trialGit = simpleGit(dir);
    await trialGit.add(".");
    const diff = await trialGit.diff(["--cached"]);
    await trialGit.commit(summary || "Self-improve attempt");

    return { id, branch, dir, baseCommit, summary, files, diff, createdAt: Date.now() };
}

async function linkNodeModules(trialDir: string): Promise<void> {
    const source = path.join(ROOT_DIR, "node_modules");
    const dest = path.join(trialDir, "node_modules");
    try {
        await fs.symlink(source, dest, "junction");
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
}
