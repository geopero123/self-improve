import type { LLMClient } from "../llm/index.js";
import { runSelfImprove, type SelfImproveOutcome } from "./orchestrate.js";

export interface SequenceHooks {
    onLog: (kind: "info" | "pending" | "success" | "error", text: string) => void;
    onPromoted: () => void;
}

interface SequenceState {
    llm: LLMClient;
    steps: string[];
    nextIndex: number;
    requireApproval: boolean;
}

/** trial id -> the rest of its sequence, only set for a pending trial that has steps queued after it. */
const continuations = new Map<string, SequenceState>();

/** Runs a plan's steps in order, one at a time, starting from the first. */
export async function runSequence(
    llm: LLMClient,
    steps: string[],
    requireApproval: boolean,
    hooks: SequenceHooks
): Promise<SelfImproveOutcome> {
    if (steps.length > 1) {
        hooks.onLog("info", `Plan (${steps.length} steps): ` + steps.map((s, i) => `${i + 1}) ${s}`).join(" "));
    }
    return runStep({ llm, steps, nextIndex: 0, requireApproval }, hooks);
}

async function runStep(state: SequenceState, hooks: SequenceHooks): Promise<SelfImproveOutcome> {
    const { llm, steps, nextIndex, requireApproval } = state;
    const label = steps.length > 1 ? `Step ${nextIndex + 1}/${steps.length}: ` : "";
    hooks.onLog("pending", `${label}${steps[nextIndex]}`);

    // Planning already produced a concrete, scoped instruction for this step, so skip the separate
    // rephrase pass here - running both would be two preprocessing model calls for one step.
    const outcome = await runSelfImprove(llm, steps[nextIndex], requireApproval, undefined, true);
    const hasMore = nextIndex + 1 < steps.length;

    if (outcome.status === "failed") {
        hooks.onLog("error", `${label}failed: ${outcome.reason ?? ""}`);
        return outcome;
    }

    if (outcome.status === "pending-approval") {
        hooks.onLog("pending", `${label}verified, waiting for your approval.`);
        if (hasMore && outcome.trial) {
            continuations.set(outcome.trial.id, { ...state, nextIndex: nextIndex + 1 });
        }
        return outcome;
    }

    hooks.onLog("success", `${label}applied: ${outcome.trial?.summary ?? ""}`);
    hooks.onPromoted();
    return hasMore ? runStep({ ...state, nextIndex: nextIndex + 1 }, hooks) : outcome;
}

/** Call after approving a trial: continues to the next queued step, if this trial was part of a sequence. */
export function continueSequenceAfterApprove(trialId: string, hooks: SequenceHooks): void {
    const state = continuations.get(trialId);
    if (!state) return;
    continuations.delete(trialId);
    void runStep(state, hooks);
}

/** Call after rejecting a trial: drops any remaining queued steps rather than skipping ahead to them. */
export function cancelSequenceAfterReject(trialId: string, hooks: SequenceHooks): void {
    if (continuations.delete(trialId)) {
        hooks.onLog("info", "Remaining steps in this plan were cancelled since you rejected a step.");
    }
}
