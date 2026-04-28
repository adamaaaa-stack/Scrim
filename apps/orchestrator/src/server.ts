import { Hono } from "hono";
import { CreateRunInput } from "@ai-testing/shared/schemas";
import { logger } from "./logger.js";

export function buildServer() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/runs", async (c) => {
    const body = await c.req.json();
    const parsed = CreateRunInput.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    // TODO: enqueue real run via pg-boss + agent loop
    logger.info({ input: parsed.data }, "run requested (stub)");
    return c.json({ id: crypto.randomUUID(), status: "queued" }, 202);
  });

  return app;
}
