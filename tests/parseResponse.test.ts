import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResponse } from "../src/llm/parseResponse.js";

test("parses a valid plain JSON response", () => {
    const text = JSON.stringify({
        summary: "did a thing",
        files: [{ path: "a.txt", content: "hello" }]
    });
    const result = parseResponse(text);
    assert.equal(result.summary, "did a thing");
    assert.deepEqual(result.files, [{ path: "a.txt", content: "hello" }]);
});

test("strips markdown fences before parsing", () => {
    const text = "```json\n" + JSON.stringify({ summary: "s", files: [] }) + "\n```";
    const result = parseResponse(text);
    assert.equal(result.summary, "s");
    assert.deepEqual(result.files, []);
});

test("throws on invalid JSON", () => {
    assert.throws(() => parseResponse("not json at all"));
});

test("throws when files field is missing", () => {
    assert.throws(() => parseResponse(JSON.stringify({ summary: "s" })));
});

test("throws when a file entry is missing path or content", () => {
    const text = JSON.stringify({ summary: "s", files: [{ path: "a.txt" }] });
    assert.throws(() => parseResponse(text));
});

test("defaults summary to empty string when absent", () => {
    const result = parseResponse(JSON.stringify({ files: [] }));
    assert.equal(result.summary, "");
});
