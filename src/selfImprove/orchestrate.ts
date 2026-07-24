import type { LLMClient } from "../llm/index.js";
import { snapshot } from "./snapshot.js";
import { createTrial } from "./trial.js";
import { verify } from "./verify.js";
import { promote } from "./promote.js";
import { rollback } from "./rollback.js";
import { registerPending } from "./pending.js";
import { listSourcePaths, readSourceFiles } from "./sourceContext.js";
import { selectRelevantFiles } from "./selectFiles.js";
import type { TrialInfo, VerifyStep } from "./types.js";

export interface SelfImproveOutcome {
    status: "promoted" | "pending-approval" | "failed";
    trial?: TrialInfo;
    reason?: string;
    verifySteps?: VerifyStep[];
}

const MAX_ATTEMPTS = 3;

const SYSTEM_CONTEXT =
    "You are editing your OWN source code (a Node.js/TypeScript agent). " +
    "Only output files that actually need to change. Keep changes minimal and consistent with the existing " +
    "code style you can see in the provided files. Never modify package.json dependencies unless the task " +
    "explicitly asks you to add a package.";

/**
 * Runs the full self-improve safety loop: snapshot -> isolated trial -> verify -> promote/rollback,
 * with bounded retries on verification failure. Never touches the live running source directly.
 */
export async function runSelfImprove(
    llm: LLMClient,
    instruction: string,
    requireApproval: boolean
): Promise<SelfImproveOutcome> {
    const baseCommit = await snapshot();
    const allPaths = await listSourcePaths();

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const fullInstruction = lastError
            ? `${instruction}\n\nYour previous attempt failed verification with this output:\n${lastError}\n\nFix the issue and try again.`
            : instruction;

        let selectedPaths: string[];
        try {
            selectedPaths = await selectRelevantFiles(llm, fullInstruction, allPaths);
        } catch (err) {
            lastError = `File selection step failed: ${err instanceof Error ? err.message : String(err)}`;
            continue;
        }
        const contextFiles = await readSourceFiles(selectedPaths);

        let result;
        try {
            result = await llm.generate({
                instruction: fullInstruction,
                contextFiles,
                systemContext: SYSTEM_CONTEXT
            });
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            continue;
        }

        if (!result.files.length) {
            lastError = "Model returned no files to change.";
            continue;
        }

        const trial = await createTrial(baseCommit, result.files, result.summary);
        const verifyResult = await verify(trial);

        if (!verifyResult.ok) {
            lastError = verifyResult.steps
                .filter(s => !s.ok)
                .map(s => `[${s.name}]\n${s.output}`)
                .join("\n\n");
            await rollback(trial);
            continue;
        }

        if (requireApproval) {
            registerPending(trial);
            return { status: "pending-approval", trial, verifySteps: verifyResult.steps };
        }

        await promote(trial);
        return { status: "promoted", trial, verifySteps: verifyResult.steps };
    }

    return { status: "failed", reason: lastError ?? "Unknown failure" };
}
