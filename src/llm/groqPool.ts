import type { LLMClient, LLMRequest, LLMResult } from "./index.js";
import { GroqClient } from "./groq.js";

/**
 * Spreads calls round-robin across a pool of primary Groq API keys (so no single key eats all the
 * rate limit), and only reaches for the fallback keys if every primary key's call fails.
 */
export class GroqPoolClient implements LLMClient {
    private primary: GroqClient[];
    private fallback: GroqClient[];
    private nextPrimary = 0;

    constructor(primaryKeys: string[], fallbackKeys: string[], model?: string) {
        if (primaryKeys.length === 0) throw new Error("GroqPoolClient needs at least one primary API key");
        this.primary = primaryKeys.map(key => new GroqClient(key, model));
        this.fallback = fallbackKeys.map(key => new GroqClient(key, model));
    }

    async generate(request: LLMRequest): Promise<LLMResult> {
        const start = this.nextPrimary;
        this.nextPrimary = (this.nextPrimary + 1) % this.primary.length;

        let lastErr: unknown;
        for (let i = 0; i < this.primary.length; i++) {
            const client = this.primary[(start + i) % this.primary.length];
            try {
                return await client.generate(request);
            } catch (err) {
                lastErr = err;
            }
        }
        for (const client of this.fallback) {
            try {
                return await client.generate(request);
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
}
