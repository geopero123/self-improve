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

test("throws when file content is double-JSON-encoded (literal \\n, no real newlines)", () => {
    // Simulates the real incident: content was itself JSON.stringify'd into the content field,
    // so the actual value has literal backslash-n sequences instead of real newline characters.
    const doubleEncoded = "{\"" + "<!doctype html>\\n<html>\\n<body>\\n</body>\\n</html>".repeat(6) + "\"}";
    const text = JSON.stringify({ summary: "s", files: [{ path: "index.html", content: doubleEncoded }] });
    assert.throws(() => parseResponse(text), /double|encoded|literal/i);
});

test("accepts normal multi-line content with real newlines", () => {
    const content = "line one\nline two\nline three\n".repeat(10);
    const text = JSON.stringify({ summary: "s", files: [{ path: "a.txt", content }] });
    const result = parseResponse(text);
    assert.equal(result.files[0].content, content);
});
