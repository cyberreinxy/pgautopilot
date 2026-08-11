import { Router } from "express";
import type { RequestHandler } from "express";
import type { ChangeHub } from "../services/changeHub.js";
import { noopRateLimiter } from "../middleware/rateLimit.js";

const HEARTBEAT_MS = 15000;
const RETRY_MS = 3000;

export function createLiveRouter(
  hub: ChangeHub,
  rateLimiter: RequestHandler | null = null,
): Router {
  const router = Router();

  router.get("/live", rateLimiter ?? noopRateLimiter, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`retry: ${RETRY_MS}\n\n`);

    let closed = false;

    const send = (payload: string): void => {
      if (closed) return;
      try {
        res.write(payload);
      } catch {
        closed = true;
      }
    };

    const unsubscribe = hub.subscribe((event) => {
      send(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      send(": ping\n\n");
    }, HEARTBEAT_MS);

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on("close", cleanup);
    res.on("error", cleanup);
  });

  return router;
}
