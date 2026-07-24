export interface AppRecord {
    id: string;
    name: string;
    dir: string;
    port: number;
    entry: string;
    status: "starting" | "running" | "stopped" | "error";
    createdAt: number;
}

const apps = new Map<string, AppRecord>();
let nextPort = 4100;

export function allocatePort(): number {
    return nextPort++;
}

export function register(app: AppRecord): void {
    apps.set(app.id, app);
}

export function get(id: string): AppRecord | undefined {
    return apps.get(id);
}

export function list(): AppRecord[] {
    return [...apps.values()];
}

export function remove(id: string): void {
    apps.delete(id);
}

export function updateStatus(id: string, status: AppRecord["status"]): void {
    const app = apps.get(id);
    if (app) app.status = status;
}
