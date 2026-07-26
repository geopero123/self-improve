import type { LLMClient } from "../llm/index.js";

const SYSTEM_CONTEXT = `
Rewrite the user's instruction below into a clearer, more specific, and more actionable version for an AI
coding agent to follow. Preserve their intent and scope exactly - do not make a small, targeted request
sound bigger, and do not shrink a broad request into something narrower. Make vague asks concrete: spell out
ambiguous terms (e.g. "better UI" -> what "better" should mean here: layout, color palette, motion), and if
the request implies a substantial rewrite, say so explicitly so it does not get quietly treated as a small
tweak. If the instruction is already clear and specific, return it unchanged.

Respond with the same JSON shape as usual: { "summary": "the rewritten instruction, as plain text", "files": [] }
`.trim();

/**
 * Best-effort: asks the model to sharpen a vague instruction before the real edit runs, since small local
 * models otherwise tend to under-deliver on open-ended asks like "make the UI better". Falls back to the
 * original instruction on any failure so this step can never block self-improve from running.
 */
export async function rephraseInstruction(llm: LLMClient, instruction: string): Promise<string> {
    try {
        const result = await llm.generate({ instruction, systemContext: SYSTEM_CONTEXT });
        const rewritten = result.summary?.trim();
        return rewritten ? rewritten : instruction;
    } catch {
        return instruction;
    }
}
