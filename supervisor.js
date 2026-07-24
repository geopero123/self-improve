import { spawn } from "node:child_process";

const SERVER_ARGS = ["--import", "tsx", "src/server.ts"];

let child = null;
let shuttingDown = false;

function startServer() {
    console.log("[supervisor] starting server...");
    child = spawn("node", SERVER_ARGS, { stdio: ["inherit", "inherit", "inherit", "ipc"] });

    child.on("message", msg => {
        if (msg && msg.type === "restart-requested") {
            console.log("[supervisor] restart requested (self-improve promoted a change)");
            restartServer();
        }
    });

    child.on("exit", (code, signal) => {
        child = null;
        if (shuttingDown) return;
        console.log(`[supervisor] server exited (code=${code}, signal=${signal}), restarting in 1s...`);
        setTimeout(startServer, 1000);
    });
}

function restartServer() {
    if (!child) {
        startServer();
        return;
    }
    const old = child;
    child = null;
    old.once("exit", () => startServer());
    old.kill();
}

function shutdown() {
    shuttingDown = true;
    if (child) child.kill();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
