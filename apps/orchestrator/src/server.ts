import { Hono } from "hono";
import { z } from "zod";
import { createOpenRouterClient } from "@ai-testing/shared/openrouter";
import { runAgentLoop } from "./agent/loop.js";
import { insertRun } from "./agent/persistence.js";
import { supabaseAdmin } from "./db/supabase.js";
import { logger } from "./logger.js";

const RunRequest = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1),
  contextRefs: z.array(z.string().uuid()).default([]),
  model: z.string().optional(),
});

export function buildServer() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/runs", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = RunRequest.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { projectId, prompt, contextRefs, model } = parsed.data;
    const sb = supabaseAdmin();

    // Look up project + concatenate context bodies (MVP: simple string concat)
    const { data: project, error: projectErr } = await sb
      .from("projects")
      .select("target_url")
      .eq("id", projectId)
      .single();
    if (projectErr || !project) {
      return c.json({ error: "Project not found" }, 404);
    }

    let context = "";
    if (contextRefs.length > 0) {
      const { data: ctxs } = await sb
        .from("contexts")
        .select("title, body")
        .in("id", contextRefs);
      context = (ctxs ?? [])
        .map((r) => `## ${r.title}\n${r.body}`)
        .join("\n\n");
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return c.json({ error: "OPENROUTER_API_KEY missing" }, 500);

    const llm = createOpenRouterClient({
      apiKey,
      defaultModel: model ?? process.env.OPENROUTER_DEFAULT_MODEL,
      appName: "AI Testing Platform",
    });

    const runId = await insertRun({
      projectId,
      prompt,
      contextRefs,
      model: model ?? process.env.OPENROUTER_DEFAULT_MODEL ?? "x-ai/grok-4.1-fast",
    });

    // Fire and forget — caller polls /runs/:id for status.
    runAgentLoop(llm, {
      runId,
      prompt,
      context,
      targetUrl: project.target_url,
      ...(model ? { model } : {}),
    }).catch((err) =>
      logger.error({ err, runId }, "agent loop top-level error"),
    );

    return c.json({ id: runId, status: "queued" }, 202);
  });

  app.get("/runs/:id", async (c) => {
    const id = c.req.param("id");
    const sb = supabaseAdmin();
    const { data: run } = await sb.from("runs").select("*").eq("id", id).single();
    if (!run) return c.json({ error: "Not found" }, 404);
    const { data: steps } = await sb
      .from("steps")
      .select("*")
      .eq("run_id", id)
      .order("index", { ascending: true });
    return c.json({ run, steps: steps ?? [] });
  });

  return app;
}
