import { promises as fs } from "node:fs";
import { simpleGit } from "simple-git";
import { ROOT_DIR } from "../paths.js";
import type { TrialInfo } from "./types.js";

const git = simpleGit(ROOT_DIR);

/** Fast-forward merges a verified trial branch into main. Fails loudly rather than force-merging. */
export async function promote(trial: TrialInfo): Promise<void> {
    const status = await git.status();
    if (!status.isClean()) {
        throw new Error("Main working tree is not clean; refusing to promote.");
    }
    await git.merge(["--ff-only", trial.branch]);
    await cleanupTrial(trial);
}

export async function cleanupTrial(trial: TrialInfo): Promise<void> {
    await git.raw(["worktree", "remove", "--force", trial.dir]).catch(() => {});
    await fs.rm(trial.dir, { recursive: true, force: true }).catch(() => {});
    await git.branch(["-D", trial.branch]).catch(() => {});
}
