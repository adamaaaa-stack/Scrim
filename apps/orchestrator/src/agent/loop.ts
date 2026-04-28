import type { OpenRouterClient } from "@ai-testing/shared/openrouter";
import type { RunStep, RunSummary } from "@ai-testing/shared/types";

export interface AgentLoopDeps {
  llm: OpenRouterClient;
  // browser: BrowserWorker  // injected once Playwright worker exists
}

export interface AgentLoopInput {
  prompt: string;
  context: string;
  targetUrl: string;
}

/**
 * Skeleton agent loop. Real implementation arrives with the Playwright worker:
 *   plan -> for each step: act (tool call) -> observe -> judge -> next/exit
 */
export async function runAgentLoop(
  _deps: AgentLoopDeps,
  _input: AgentLoopInput,
): Promise<Omit<RunSummary, "id" | "projectId" | "startedAt">> {
  const steps: RunStep[] = [];
  return {
    status: "errored",
    prompt: _input.prompt,
    contextRefs: [],
    steps,
    error: "Agent loop not implemented yet",
  };
}
