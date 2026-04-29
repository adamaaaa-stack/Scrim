import { logger } from "../logger.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const EMBEDDING_MODEL = "openai/text-embedding-3-small"; // 1536 dims, matches schema

/**
 * Generate an embedding via OpenRouter's embeddings endpoint.
 * Returns null on failure (best-effort — never blocks the agent loop).
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn("OPENROUTER_API_KEY missing; skipping embedding");
    return null;
  }

  try {
    const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "AI Testing Platform Embeddings",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn(
        { status: res.status, body: body.slice(0, 200) },
        "embedding request failed",
      );
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    return json.data?.[0]?.embedding ?? null;
  } catch (err) {
    logger.warn({ err }, "embedding fetch threw");
    return null;
  }
}

/**
 * Build the text used for failure embedding. Captures the test prompt + the
 * agent's judgment reason + the failing step's intent. This produces a
 * representation where re-runs of the same prompt failing the same way will
 * have very high cosine similarity, while different bugs in the same project
 * will have lower.
 */
export function buildFailureText(args: {
  prompt: string;
  judgmentReason: string;
  failedStepIntent?: string;
  failedStepTool?: string;
}): string {
  return [
    `PROMPT: ${args.prompt}`,
    args.failedStepTool
      ? `FAILED_STEP: ${args.failedStepTool} — ${args.failedStepIntent ?? ""}`
      : null,
    `VERDICT: ${args.judgmentReason}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
