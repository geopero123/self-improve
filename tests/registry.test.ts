import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePort, register, get, list, remove, updateStatus } from "../src/apps/registry.js";

test("allocatePort returns increasing distinct ports", () => {
    const a = allocatePort();
    const b = allocatePort();
    assert.ok(b > a);
});

test("register/get/list/remove round-trip", () => {
    const record = {
        id: "test-app",
        name: "Test App",
        dir: "/tmp/test-app",
        port: allocatePort(),
        entry: "server.js",
        status: "starting" as const,
        createdAt: Date.now()
    };
    register(record);
    assert.deepEqual(get("test-app"), record);
    assert.ok(list().some(a => a.id === "test-app"));

    updateStatus("test-app", "running");
    assert.equal(get("test-app")?.status, "running");

    remove("test-app");
    assert.equal(get("test-app"), undefined);
});
