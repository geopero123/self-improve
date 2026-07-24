export class RateLimitError extends Error {
    retryAfterMs: number;

    constructor(message: string, retryAfterMs: number) {
        super(message);
        this.name = "RateLimitError";
        this.retryAfterMs = retryAfterMs;
    }
}
