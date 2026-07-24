import type { LLMFile } from "../llm/index.js";

export interface TrialInfo {
    id: string;
    branch: string;
    dir: string;
    baseCommit: string;
    summary: string;
    files: LLMFile[];
    diff: string;
    createdAt: number;
}

export interface VerifyStep {
    name: string;
    ok: boolean;
    output: string;
}

export interface VerifyResult {
    ok: boolean;
    steps: VerifyStep[];
}
