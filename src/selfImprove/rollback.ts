import { cleanupTrial } from "./promote.js";
import type { TrialInfo } from "./types.js";

/** Discards a trial worktree/branch entirely, leaving live source untouched. */
export async function rollback(trial: TrialInfo): Promise<void> {
    await cleanupTrial(trial);
}
