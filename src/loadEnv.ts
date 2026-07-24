import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "./paths.js";

/** Minimal .env loader (no dependency needed) — reads KEY=VALUE lines, never overwrites already-set env vars. */
export function loadEnv(): void {
    const envPath = path.join(ROOT_DIR, ".env");
    if (!existsSync(envPath)) return;

    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (!(key in process.env)) process.env[key] = value;
    }
}
