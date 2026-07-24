import { simpleGit } from "simple-git";
import { ROOT_DIR } from "../paths.js";

const git = simpleGit(ROOT_DIR);

/**
 * Records the current HEAD commit as the known-good rollback point.
 * Refuses to proceed if the live source tree has uncommitted changes,
 * since a self-improve attempt must start from a state we can safely return to.
 */
export async function snapshot(): Promise<string> {
    const status = await git.status();
    if (!status.isClean()) {
        throw new Error(
            "Working tree is not clean; refusing to start a self-improve attempt. " +
                "Commit or discard pending changes to the agent's own source first."
        );
    }
    const log = await git.log(["-1"]);
    if (!log.latest) throw new Error("No commits found in repo");
    return log.latest.hash;
}
