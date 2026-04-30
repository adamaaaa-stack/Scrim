import { Hono } from "hono";
import { z } from "zod";
import { createOpenRouterClient } from "@ai-testing/shared/openrouter";
import { runAgentLoop } from "./agent/loop.js";
import { handleChatTurn } from "./agent/chat.js";
import { rewritePrompt } from "./agent/rewrite.js";
import { narrateRun } from "./agent/narrator.js";
import { insertRun, updateRun } from "./agent/persistence.js";
import { runVoiceAgent } from "./voice/voice-agent.js";

// ============================================================
// Cross-channel capture endpoints
// External services POST here when an email is sent or a webhook fires;
// we store the payload for the agent to query later via waitForEmail /
// expectWebhook. Public on purpose — these run on a project-id path so
// the user configures their app/email-provider to forward to that URL.
// ============================================================
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

  // Email capture. Accepts a flexible JSON shape — Postmark/SendGrid/Mailgun
  // all post different payloads, plus an internal {to, from, subject, body}
  // shape for direct testing. We extract common fields and store the raw too.
  app.post("/captures/email/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const ProjectId = z.string().uuid();
    if (!ProjectId.safeParse(projectId).success) {
      return c.json({ error: "Invalid projectId" }, 400);
    }
    const raw = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const to =
      String(raw.to ?? raw.To ?? raw.recipient ?? raw.envelope ?? "")
        .toString()
        .trim();
    const from = String(raw.from ?? raw.From ?? raw.sender ?? "").trim();
    const subject = String(raw.subject ?? raw.Subject ?? "").trim();
    const bodyText = String(raw.text ?? raw.TextBody ?? raw.body ?? "").trim();
    const bodyHtml = String(raw.html ?? raw.HtmlBody ?? "").trim();

    const sb = supabaseAdmin();
    const { error } = await sb.from("captured_emails").insert({
      project_id: projectId,
      to_addr: to,
      from_addr: from || null,
      subject: subject || null,
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      raw,
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 201);
  });

  // Webhook capture, label-keyed (e.g. /captures/webhook/<projectId>/order_paid).
  app.all("/captures/webhook/:projectId/:label", async (c) => {
    const projectId = c.req.param("projectId");
    const label = c.req.param("label");
    if (!z.string().uuid().safeParse(projectId).success) {
      return c.json({ error: "Invalid projectId" }, 400);
    }
    if (!/^[a-z0-9_-]{1,64}$/i.test(label)) {
      return c.json({ error: "Invalid label" }, 400);
    }
    const payload = await c.req.json().catch(() => ({}));
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    const query = c.req.queries();

    const sb = supabaseAdmin();
    const { error } = await sb.from("captured_webhooks").insert({
      project_id: projectId,
      label,
      method: c.req.method,
      headers,
      payload,
      query,
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true }, 201);
  });

  app.post("/voice-runs", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const Req = z.object({
      projectId: z.string().uuid(),
      prompt: z.string().min(1),
      personaId: z.string().min(1),
      roomName: z.string().min(1),
      model: z.string().optional(),
    });
    const parsed = Req.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return c.json({ error: "OPENROUTER_API_KEY missing" }, 500);

    const llm = createOpenRouterClient({
      apiKey,
      defaultModel: parsed.data.model ?? process.env.OPENROUTER_DEFAULT_MODEL,
      appName: "AI Testing Platform Voice",
    });

    const runId = await insertRun({
      projectId: parsed.data.projectId,
      prompt: parsed.data.prompt,
      contextRefs: [],
      model: parsed.data.model ?? process.env.OPENROUTER_DEFAULT_MODEL ?? "x-ai/grok-4.1-fast",
    });

    // Fire and forget — caller polls /runs/:id.
    runVoiceAgent(llm, {
      runId,
      projectId: parsed.data.projectId,
      prompt: parsed.data.prompt,
      personaId: parsed.data.personaId,
      roomName: parsed.data.roomName,
    })
      .then(async (result) => {
        await updateRun(runId, {
          status: result.status,
          completedAt: new Date(),
          ...(result.status === "errored" ? { error: result.reason } : { error: null }),
        });
        if (result.scores) {
          await supabaseAdmin()
            .from("runs")
            .update({ voice_judge_scores: result.scores })
            .eq("id", runId);
        }
      })
      .catch((err) => logger.error({ err, runId }, "voice run top-level error"));

    return c.json({ id: runId, status: "queued" }, 202);
  });

  app.post("/runs/:id/narrate", async (c) => {
    const runId = c.req.param("id");
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return c.json({ error: "OPENROUTER_API_KEY missing" }, 500);

    const llm = createOpenRouterClient({
      apiKey,
      defaultModel: process.env.OPENROUTER_DEFAULT_MODEL,
      appName: "AI Testing Platform Narrator",
    });

    try {
      const result = await narrateRun(llm, runId);
      return c.json(result);
    } catch (err) {
      logger.error({ err, runId }, "narrate failed");
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
