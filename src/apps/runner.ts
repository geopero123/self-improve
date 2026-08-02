import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GENERATED_APPS_DIR } from "../paths.js";
import type { LLMFile } from "../llm/index.js";
import { allocatePort, register, updateStatus, list, type AppRecord } from "./registry.js";

const processes = new Map<string, ChildProcess>();

/** Writes files into an app's isolated folder, refusing anything that would escape it. */
export async function writeAppFiles(dir: string, files: LLMFile[]): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
    const resolvedDir = path.resolve(dir);
    for (const file of files) {
        const target = path.resolve(dir, file.path);
        if (target !== resolvedDir && !target.startsWith(resolvedDir + path.sep)) {
            throw new Error(`Refusing to write outside app directory: ${file.path}`);
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, "utf8");
    }
}

/** Reads every file currently in an app's folder, for handing back to the model as edit context. */
export async function readAppFiles(dir: string): Promise<LLMFile[]> {
    const out: LLMFile[] = [];
    async function walk(abs: string, rel: string): Promise<void> {
        const entries = await fs.readdir(abs, { withFileTypes: true });
        for (const entry of entries) {
            const entryAbs = path.join(abs, entry.name);
            const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                await walk(entryAbs, entryRel);
            } else {
                out.push({ path: entryRel, content: await fs.readFile(entryAbs, "utf8") });
            }
        }
    }
    await walk(dir, "");
    return out;
}

/** Writes a generated app's files to its own isolated folder and starts it as its own process. */
export async function createApp(name: string, files: LLMFile[], entry = "server.js"): Promise<AppRecord> {
    const id = randomUUID().slice(0, 8);
    const dir = path.join(GENERATED_APPS_DIR, id);
    await writeAppFiles(dir, files);

    // Generated apps live inside this project, so without their own package.json they inherit its
    // "type": "module" and every `require(...)` app dies with "require is not defined". Generated
    // apps are asked for plain CommonJS Node, so pin that here unless the model wrote its own.
    if (!files.some((f) => path.basename(f.path) === "package.json")) {
        await fs.writeFile(
            path.join(dir, "package.json"),
            JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
            "utf8"
        );
    }

    const port = allocatePort();
    const record: AppRecord = { id, name, dir, port, entry, status: "starting", createdAt: Date.now() };
    register(record);
    startApp(record);
    return record;
}

function startApp(record: AppRecord): void {
    const child = spawn("node", [record.entry], {
        cwd: record.dir,
        env: { ...process.env, PORT: String(record.port) }
    });
    processes.set(record.id, child);

    // Without this a crashing app just flips to "stopped" with no trace of why.
    child.stderr?.on("data", (chunk: Buffer) => {
        console.error(`[app ${record.id}] ${chunk.toString().trimEnd()}`);
    });

    child.on("exit", (code) => {
        if (code) console.error(`[app ${record.id}] exited with code ${code}`);
        updateStatus(record.id, "stopped");
        processes.delete(record.id);
    });
    child.on("error", () => {
        updateStatus(record.id, "error");
    });

    setTimeout(() => {
        if (processes.has(record.id)) updateStatus(record.id, "running");
    }, 500);
}

/** Kills an app's current process (if any) and starts a fresh one on the same port/id, so its
 *  /apps/:id/ URL keeps working after its files are edited in place. */
export function restartApp(record: AppRecord): void {
    const existing = processes.get(record.id);
    if (existing) {
        // The old process's own "exit" handler would otherwise race the new one and flip status
        // back to "stopped" right after we mark it "starting".
        existing.removeAllListeners("exit");
        existing.removeAllListeners("error");
        existing.kill();
        processes.delete(record.id);
    }
    updateStatus(record.id, "starting");
    startApp(record);
}

export function stopApp(id: string): void {
    const child = processes.get(id);
    if (child) {
        child.kill();
        processes.delete(id);
    }
    updateStatus(id, "stopped");
}

export function stopAllApps(): void {
    for (const id of [...processes.keys()]) stopApp(id);
}

export function isRunning(id: string): boolean {
    return processes.has(id);
}

export { list as listApps };
