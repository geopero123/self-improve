import { EventEmitter } from "node:events";

export interface ActivityEntry {
    id: string;
    ts: number;
    kind: "info" | "success" | "error" | "pending";
    text: string;
    data?: unknown;
}

export const activityBus = new EventEmitter();

const history: ActivityEntry[] = [];
const MAX_HISTORY = 200;
let counter = 0;

export function logActivity(kind: ActivityEntry["kind"], text: string, data?: unknown): ActivityEntry {
    const entry: ActivityEntry = { id: String(++counter), ts: Date.now(), kind, text, data };
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();
    activityBus.emit("log", entry);
    return entry;
}

export function getHistory(): ActivityEntry[] {
    return history;
}
