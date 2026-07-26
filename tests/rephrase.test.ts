import { test } from "node:test";
import assert from "node:assert/strict";
import { rephraseInstruction } from "../src/selfImprove/rephrase.js";
import type { LLMClient } from "../src/llm/index.js";

test("returns the model's rewritten instruction", async () => {
    const llm: LLMClient = {
        generate: async () => ({ summary: "a sharper version", files: [] })
    };
    const result = await rephraseInstruction(llm, "make it better");
    assert.equal(result, "a sharper version");
});

test("falls back to the original instruction when the model returns nothing", async () => {
    const llm: LLMClient = {
        generate: async () => ({ summary: "", files: [] })
    };
    const result = await rephraseInstruction(llm, "make it better");
    assert.equal(result, "make it better");
});

test("falls back to the original instruction if the model call throws", async () => {
    const llm: LLMClient = {
        generate: async () => {
            throw new Error("model unavailable");
        }
    };
    const result = await rephraseInstruction(llm, "make it better");
    assert.equal(result, "make it better");
});
