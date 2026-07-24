import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT_DIR = path.resolve(fileURLToPath(import.meta.url), "..", "..");
export const GENERATED_APPS_DIR = path.join(ROOT_DIR, "generated-apps");
export const TRIALS_DIR = path.join(ROOT_DIR, ".self-improve-trials");
export const PUBLIC_DIR = path.join(ROOT_DIR, "public");
