import { test } from "node:test";
import assert from "node:assert/strict";
import { logActivity, getHistory } from "../src/events.js";

test("logActivity appends an entry to history", () => {
    const before = getHistory().length;
    logActivity("info", "hello");
    assert.equal(getHistory().length, before + 1);
    assert.equal(getHistory().at(-1)?.text, "hello");
});

test("logActivity caps history length", () => {
    for (let i = 0; i < 250; i++) logActivity("info", `entry ${i}`);
    assert.ok(getHistory().length <= 200);
});
