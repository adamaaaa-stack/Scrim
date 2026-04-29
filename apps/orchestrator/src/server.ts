import { Hono } from "hono";
import { z } from "zod";
import { createOpenRouterClient } from "@ai-testing/shared/openrouter";
import { runAgentLoop } from "./agent/loop.js";
import { handleChatTurn } from "./agent/chat.js";
import { rewritePrompt } from "./agent/rewrite.js";
import { insertRun } from "./agent/persistence.js";
import { supabaseAdmin } from "./db/supabase.js";
import { logger } from "./logger.js";

const RunRequest = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1),
  contextRefs: z.array(z.string().uuid()).default([]),
  model: z.string().optional(),
  devicePreset: z.enum(["desktop", "iphone", "ipad", "android"]).optional(),
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

    const { projectId, prompt, contextRefs, model, devicePreset } = parsed.data;
    const sb = supabaseAdmin();

    // Look up project + concatenate context bodies (MVP: simple string concat)
    const { data: project, error: projectErr } = await sb
      .from("projects")
      .select("target_url, device_preset")
      .eq("id", projectId)
      .single();
    if (projectErr || !project) {
      return c.json({ error: "Project not found" }, 404);
    }
    const effectiveDevice = devicePreset ?? (project.device_preset as "desktop" | "iphone" | "ipad" | "android" | null) ?? "desktop";

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
      projectId,
      prompt,
      context,
      targetUrl: project.target_url,
      devicePreset: effectiveDevice,
      ...(model ? { model } : {}),
    }).catch((err) =>
      logger.error({ err, runId }, "agent loop top-level error"),
    );

    return c.json({ id: runId, status: "queued" }, 202);
  });

  app.post("/rewrite-prompt", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const Req = z.object({
      projectId: z.string().uuid(),
      prompt: z.string().min(3),
    });
    const parsed = Req.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return c.json({ error: "OPENROUTER_API_KEY missing" }, 500);

    const llm = createOpenRouterClient({
      apiKey,
      defaultModel: process.env.OPENROUTER_DEFAULT_MODEL,
      appName: "AI Testing Platform Rewriter",
    });

    try {
      const result = await rewritePrompt(llm, parsed.data);
      return c.json(result);
    } catch (err) {
      logger.error({ err, projectId: parsed.data.projectId }, "rewrite failed");
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  });

  app.post("/conversations/:id/messages", async (c) => {
    const conversationId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const ChatRequest = z.object({
      projectId: z.string().uuid(),
      message: z.string().min(1),
    });
    const parsed = ChatRequest.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return c.json({ error: "OPENROUTER_API_KEY missing" }, 500);

    const llm = createOpenRouterClient({
      apiKey,
      defaultModel: process.env.OPENROUTER_DEFAULT_MODEL,
      appName: "AI Testing Platform Chat",
    });

    try {
      const result = await handleChatTurn(llm, {
        conversationId,
        projectId: parsed.data.projectId,
        userMessage: parsed.data.message,
      });
      return c.json(result);
    } catch (err) {
      logger.error({ err, conversationId }, "chat turn failed");
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
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
