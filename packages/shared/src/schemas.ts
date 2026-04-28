import { z } from "zod";

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "failed",
  "errored",
]);

export const StepKindSchema = z.enum([
  "navigate",
  "click",
  "type",
  "wait",
  "screenshot",
  "assert",
  "custom",
]);

export const CreateRunInput = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1),
  contextRefs: z.array(z.string()).default([]),
});

export type CreateRunInput = z.infer<typeof CreateRunInput>;

export const ProjectInput = z.object({
  name: z.string().min(1),
  targetUrl: z.string().url(),
  description: z.string().optional(),
});

export type ProjectInput = z.infer<typeof ProjectInput>;
