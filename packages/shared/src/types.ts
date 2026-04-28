export type RunStatus = "queued" | "running" | "passed" | "failed" | "errored";

export type StepKind =
  | "navigate"
  | "click"
  | "type"
  | "wait"
  | "screenshot"
  | "assert"
  | "custom";

export interface RunStep {
  id: string;
  index: number;
  kind: StepKind;
  intent: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  observation?: {
    screenshotUrl?: string;
    domSnapshot?: string;
    consoleLog?: string[];
    networkLog?: unknown[];
    audioTranscript?: string;
  };
  judgment?: {
    pass: boolean;
    reasoning: string;
  };
}

export interface RunSummary {
  id: string;
  projectId: string;
  status: RunStatus;
  prompt: string;
  contextRefs: string[];
  steps: RunStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}
