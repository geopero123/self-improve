import { Router, type RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { get as getApp } from "./apps/registry.js";

const proxyCache = new Map<string, RequestHandler>();

/** Reverse-proxies /apps/:id/* to the generated app's own child-process port. */
export function appsRouter(): Router {
    const router = Router();

    router.use("/:id", (req, res, next) => {
        const record = getApp(req.params.id);
        if (!record || record.status !== "running") {
            res.status(404).send("App not found or not running yet");
            return;
        }

        const cacheKey = `${record.id}:${record.port}`;
        let proxy = proxyCache.get(cacheKey);
        if (!proxy) {
            proxy = createProxyMiddleware({
                target: `http://127.0.0.1:${record.port}`,
                changeOrigin: true,
                ws: true
            });
            proxyCache.set(cacheKey, proxy);
        }
        proxy(req, res, next);
    });

    return router;
}
