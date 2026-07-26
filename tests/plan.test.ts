import { test } from "node:test";
import assert from "node:assert/strict";
import { planSteps } from "../src/selfImprove/plan.js";
import type { LLMClient } from "../src/llm/index.js";

test("splits a multi-line response into ordered steps", async () => {
    const llm: LLMClient = {
        generate: async () => ({
            summary: "1) change colors in style.css\n2) add hover animation to button",
            files: []
        })
    };
    const steps = await planSteps(llm, "improve the ui");
    assert.deepEqual(steps, ["change colors in style.css", "add hover animation to button"]);
});

test("caps the number of steps at 5", async () => {
    const llm: LLMClient = {
        generate: async () => ({
            summary: Array.from({ length: 8 }, (_, i) => `step ${i + 1}`).join("\n"),
            files: []
        })
    };
    const steps = await planSteps(llm, "do everything");
    assert.equal(steps.length, 5);
});

test("falls back to the original instruction when the model returns nothing", async () => {
    const llm: LLMClient = {
        generate: async () => ({ summary: "", files: [] })
    };
    const steps = await planSteps(llm, "fix the typo in the header");
    assert.deepEqual(steps, ["fix the typo in the header"]);
});

test("falls back to the original instruction if the model call throws", async () => {
    const llm: LLMClient = {
        generate: async () => {
            throw new Error("model unavailable");
        }
    };
    const steps = await planSteps(llm, "fix the typo in the header");
    assert.deepEqual(steps, ["fix the typo in the header"]);
});
