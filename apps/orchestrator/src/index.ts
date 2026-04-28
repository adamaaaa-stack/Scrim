import { serve } from "@hono/node-server";
import { buildServer } from "./server.js";
import { logger } from "./logger.js";

const port = Number(process.env.ORCHESTRATOR_PORT ?? 4000);
const app = buildServer();

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, "orchestrator listening");
});
