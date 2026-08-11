import type { RequestHandler } from "express";

const ALLOWED_METHODS = "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS";
const ALLOWED_HEADERS = "Content-Type,Authorization";

interface CorsOptions {
    allowedOrigins: string[];
    production: boolean;
}

function normalizeOrigin(origin: string): string {
    return origin.replace(/\/+$/, "");
}

export function createCorsMiddleware(options: CorsOptions): RequestHandler {
    const { allowedOrigins, production } = options;
    const allowed = new Set(allowedOrigins.map(normalizeOrigin));

    return (req, res, next) => {
        const origin = req.headers.origin;
        if (!origin) {
            res.setHeader("Vary", "Origin");
            next();
            return;
        }

        const normalized = normalizeOrigin(origin);
        if (allowed.has(normalized)) {
            res.setHeader("Access-Control-Allow-Origin", normalized);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
            res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
            res.setHeader("Vary", "Origin");
            if (req.method === "OPTIONS") {
                res.sendStatus(204);
                return;
            }
            next();
            return;
        }

        if (production) {
            res.status(403).json({ error: "CORS origin not allowed" });
            return;
        }

        res.setHeader("Access-Control-Allow-Origin", normalized);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
        res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
        res.setHeader("Vary", "Origin");
        if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
        }
        next();
    };
}
