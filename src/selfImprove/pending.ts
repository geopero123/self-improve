import type { TrialInfo } from "./types.js";
import { promote } from "./promote.js";
import { rollback } from "./rollback.js";

const pending = new Map<string, TrialInfo>();

export function registerPending(trial: TrialInfo): void {
    pending.set(trial.id, trial);
}

export function getPending(id: string): TrialInfo | undefined {
    return pending.get(id);
}

export function listPending(): TrialInfo[] {
    return [...pending.values()];
}

export async function approvePending(id: string): Promise<TrialInfo> {
    const trial = pending.get(id);
    if (!trial) throw new Error(`No pending trial with id ${id}`);
    await promote(trial);
    pending.delete(id);
    return trial;
}

export async function rejectPending(id: string): Promise<TrialInfo> {
    const trial = pending.get(id);
    if (!trial) throw new Error(`No pending trial with id ${id}`);
    await rollback(trial);
    pending.delete(id);
    return trial;
}
