import type { LLMClient } from "../llm/index.js";

const MAX_STEPS = 5;

const SYSTEM_CONTEXT = `
Decide whether the user's instruction describes ONE narrow, concrete change, or a BROADER goal that really
needs several separate, independently-verifiable changes to achieve (e.g. "improve the UI" touches colors,
layout, and animations, which are each their own concern).

If it is already narrow and concrete, respond with exactly one step: the instruction unchanged, or lightly
cleaned up if it is vague (spell out what ambiguous terms should mean here). Do not split a narrow request.

If it is broad, break it into 2 to ${MAX_STEPS} ordered, narrow steps. Each step must:
- Describe a change that is independently valid and verifiable on its own (typecheck, tests, boot check),
  without depending on a later step existing yet.
- Name the specific file(s) and CSS selector(s)/element(s)/function(s) involved, not vague goals.
- Together with the other steps, cover what was actually asked - do not invent unrelated work.

Respond with the same JSON shape as usual: { "summary": "one step per line, in order, no numbering or bullets", "files": [] }
`.trim();

/**
 * Turns one instruction into an ordered list of concrete steps. Small local models reliably under-deliver
 * on broad, open-ended asks ("make the UI better") when handled in a single pass, but do much better on a
 * sequence of narrow, well-scoped ones. Falls back to a single step (the original instruction) on any
 * failure or empty response, so this can never block self-improve from running.
 */
export async function planSteps(llm: LLMClient, instruction: string): Promise<string[]> {
    try {
        const result = await llm.generate({ instruction, systemContext: SYSTEM_CONTEXT });
        const steps = (result.summary ?? "")
            .split("\n")
            .map(line => line.replace(/^[-*\d.)\s]+/, "").trim())
            .filter(Boolean);
        return steps.length ? steps.slice(0, MAX_STEPS) : [instruction];
    } catch {
        return [instruction];
    }
}
