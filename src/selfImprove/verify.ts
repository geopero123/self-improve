import { spawn, execFile, type ChildProcess } from "node:child_process";
import type { TrialInfo, VerifyResult, VerifyStep } from "./types.js";

/**
 * child.kill() only terminates the immediate process. On Windows that process is a cmd.exe
 * wrapper (since we spawn with shell:true there), so the real node.exe underneath survives
 * as an orphan unless we kill the whole tree via taskkill.
 */
function killTree(child: ChildProcess): void {
    if (process.platform === "win32" && child.pid) {
        execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
    } else {
        child.kill();
    }
}

function run(cmd: string, args: string[], cwd: string, timeoutMs = 60_000): Promise<{ ok: boolean; output: string }> {
    return new Promise(resolve => {
        const child = spawn(cmd, args, { cwd, shell: process.platform === "win32" });
        let output = "";
        const timer = setTimeout(() => {
            killTree(child);
            resolve({ ok: false, output: output + "\n[timed out]" });
        }, timeoutMs);

        child.stdout?.on("data", d => (output += d.toString()));
        child.stderr?.on("data", d => (output += d.toString()));
        child.on("close", code => {
            clearTimeout(timer);
            resolve({ ok: code === 0, output });
        });
        child.on("error", err => {
            clearTimeout(timer);
            resolve({ ok: false, output: output + `\n${err.message}` });
        });
    });
}

async function bootCheck(dir: string): Promise<{ ok: boolean; output: string }> {
    const port = 20000 + Math.floor(Math.random() * 20000);

    return new Promise(resolve => {
        let output = "";
        const child = spawn("node", ["--import", "tsx", "src/server.ts"], {
            cwd: dir,
            env: { ...process.env, PORT: String(port), SELF_IMPROVE_BOOT_CHECK: "1" },
            shell: process.platform === "win32"
        });

        child.stdout?.on("data", d => (output += d.toString()));
        child.stderr?.on("data", d => (output += d.toString()));

        let settled = false;
        const finish = (ok: boolean, extra?: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutTimer);
            clearInterval(poller);
            killTree(child);
            resolve({ ok, output: output + (extra ? `\n${extra}` : "") });
        };

        const timeoutTimer = setTimeout(() => finish(false, "[boot check timed out]"), 12_000);

        child.on("exit", code => {
            if (!settled) finish(false, `[process exited early with code ${code}]`);
        });

        const poller = setInterval(() => {
            fetch(`http://127.0.0.1:${port}/health`)
                .then(res => (res.ok ? checkUiIntegrity(port) : undefined))
                .then(uiIssue => {
                    if (uiIssue === undefined) return; // health not up yet, or check already handled
                    if (uiIssue === null) finish(true);
                    else finish(false, uiIssue);
                })
                .catch(() => {
                    // not up yet, keep polling
                });
        }, 400);
    });
}

/**
 * Beyond "does the server process boot", this checks the served UI page is still actually
 * intact - it caught a real incident where a self-edit replaced most of public/index.html
 * with a placeholder comment, silently dropping the <script> tag that loads app.js. Neither
 * typecheck nor the test suite would ever catch that, since it's a static HTML asset, not code.
 */
async function checkUiIntegrity(port: number): Promise<string | null> {
    const pageRes = await fetch(`http://127.0.0.1:${port}/`);
    if (!pageRes.ok) return `UI check: GET / returned ${pageRes.status}`;

    const html = await pageRes.text();
    if (!html.includes("<script") || !html.includes("app.js")) {
        return "UI check: served page no longer includes a <script> tag loading app.js - the page's JavaScript would not run";
    }

    const scriptRes = await fetch(`http://127.0.0.1:${port}/app.js`);
    if (!scriptRes.ok) return `UI check: GET /app.js returned ${scriptRes.status}`;

    return null;
}

/** Runs typecheck, the test suite, and a real boot+health-check against the isolated trial copy. */
export async function verify(trial: TrialInfo): Promise<VerifyResult> {
    const steps: VerifyStep[] = [];

    const typecheck = await run("npx", ["tsc", "--noEmit"], trial.dir, 60_000);
    steps.push({ name: "typecheck", ...typecheck });
    if (!typecheck.ok) return { ok: false, steps };

    const test = await run("npm", ["test"], trial.dir, 60_000);
    steps.push({ name: "test", ...test });
    if (!test.ok) return { ok: false, steps };

    const boot = await bootCheck(trial.dir);
    steps.push({ name: "boot", ...boot });
    if (!boot.ok) return { ok: false, steps };

    return { ok: true, steps };
}
