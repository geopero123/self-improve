import { loadEnv } from "./loadEnv.js";
loadEnv();

import express from "express";
import { PUBLIC_DIR } from "./paths.js";
import { createLLMClient, type LLMClient } from "./llm/index.js";
import {
    planSteps,
    runSequence,
    continueSequenceAfterApprove,
    cancelSequenceAfterReject,
    approvePending,
    rejectPending,
    listPending,
    type SequenceHooks
} from "./selfImprove/index.js";
import { generateApp, iterateApp, listApps } from "./apps/index.js";
import { appsRouter } from "./proxy.js";
import { activityBus, logActivity, getHistory, type ActivityEntry } from "./events.js";

const PORT = Number(process.env.PORT ?? 3000);
const REQUIRE_APPROVAL = process.env.SELF_IMPROVE_AUTO !== "1";

let llmInstance: LLMClient | null = null;
function getLLM(): LLMClient {
    if (!llmInstance) {
        llmInstance = createLLMClient();
    }
    return llmInstance;
}

function requestRestart(): void {
    if (process.send) {
        process.send({ type: "restart-requested" });
    } else {
        console.log("[server] no IPC channel to supervisor; run via `npm start` for self-improve restarts to take effect");
    }
}

const sequenceHooks: SequenceHooks = {
    onLog: (kind, text) => logActivity(kind, text),
    onPromoted: () => requestRestart()
};

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
});

app.get("/api/activity", (_req, res) => {
    res.json(getHistory());
});

app.get("/api/activity/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const listener = (entry: ActivityEntry) => {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
    };
    activityBus.on("log", listener);

    req.on("close", () => {
        activityBus.off("log", listener);
    });
});

app.get("/api/apps", (_req, res) => {
    res.json(listApps());
});

app.post("/api/apps", async (req, res) => {
    const instruction = String(req.body?.instruction ?? "").trim();
    if (!instruction) {
        res.status(400).json({ error: "instruction is required" });
        return;
    }

    logActivity("pending", `Building app: ${instruction}`);
    try {
        const { record, summary } = await generateApp(getLLM(), instruction, msg => logActivity("info", msg));
        logActivity("success", `App ready: ${record.name} -> /apps/${record.id}/`, { record, summary });
        res.json({ record, summary });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActivity("error", `App build failed: ${message}`);
        res.status(500).json({ error: message });
    }
});

app.post("/api/apps/:id/iterate", async (req, res) => {
    const instruction = String(req.body?.instruction ?? "").trim();
    if (!instruction) {
        res.status(400).json({ error: "instruction is required" });
        return;
    }

    logActivity("pending", `Updating app: ${instruction}`);
    try {
        const { record, summary } = await iterateApp(
            getLLM(),
            req.params.id,
            instruction,
            msg => logActivity("info", msg)
        );
        logActivity("success", `App updated: ${record.name} -> /apps/${record.id}/`, { record, summary });
        res.json({ record, summary });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActivity("error", `App update failed: ${message}`);
        res.status(500).json({ error: message });
    }
});

app.get("/api/self-improve/pending", (_req, res) => {
    res.json(listPending().map(trial => ({ status: "pending-approval" as const, trial })));
});

app.post("/api/self-improve", async (req, res) => {
    const instruction = String(req.body?.instruction ?? "").trim();
    if (!instruction) {
        res.status(400).json({ error: "instruction is required" });
        return;
    }

    logActivity("pending", `Self-improve: ${instruction}`);
    try {
        const llm = getLLM();
        const steps = await planSteps(llm, instruction);
        const outcome = await runSequence(llm, steps, REQUIRE_APPROVAL, sequenceHooks);
        if (outcome.status === "failed") {
            logActivity("error", `Self-improve failed after retries: ${outcome.reason ?? ""}`, outcome);
        }
        res.json(outcome);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActivity("error", `Self-improve error: ${message}`);
        res.status(500).json({ error: message });
    }
});

app.post("/api/self-improve/:id/approve", async (req, res) => {
    try {
        const trial = await approvePending(req.params.id);
        logActivity("success", `Approved and promoted self-improve: ${trial.summary}`);
        requestRestart();
        res.json({ ok: true });
        // Continues any queued later steps in the background; the response above doesn't wait on it,
        // since the next step can take as long as a full self-improve run.
        continueSequenceAfterApprove(req.params.id, sequenceHooks);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: message });
    }
});

app.post("/api/self-improve/:id/reject", async (req, res) => {
    try {
        const trial = await rejectPending(req.params.id);
        logActivity("info", `Rejected self-improve: ${trial.summary}`);
        res.json({ ok: true });
        cancelSequenceAfterReject(req.params.id, sequenceHooks);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: message });
    }
});

app.use("/apps", appsRouter());
app.use(express.static(PUBLIC_DIR));

app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
});
