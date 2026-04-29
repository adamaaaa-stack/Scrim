import type {
  ChatCompletionRequest,
  ChatMessage,
  OpenRouterClient,
} from "@ai-testing/shared/openrouter";
import { supabaseAdmin } from "../db/supabase.js";
import { uploadAudio } from "../storage/audio.js";
import { logger } from "../logger.js";
import { personaById, type VoicePersona } from "./personas.js";
import { getSTTProvider, getTTSProvider } from "./index.js";
import {
  liveKitConfigFromEnv,
  VoiceSession,
  type LiveKitConfig,
} from "./livekit-session.js";

const MAX_TURNS = 10;
const SILENCE_TIMEOUT_MS = 4000; // wait this long after no new audio frames before transcribing
const MIN_LISTEN_MS = 1500; // wait at least this long even if AI starts talking immediately
const MAX_LISTEN_MS = 30000; // hard cap on listening per turn

export interface VoiceRunInput {
  runId: string;
  projectId: string;
  prompt: string; // the test scenario, e.g. "call to dispute a charge"
  personaId: string;
  /** LiveKit room name to join. Must already exist; the AI under test joins
   *  the same room independently. */
  roomName: string;
}

export interface VoiceJudgeScores {
  overall_pass: boolean;
  helpfulness: number; // 0-10
  accuracy: number;
  tone_match: number;
  latency: number;
  recovery: number;
  reasoning: string;
}

export async function runVoiceAgent(
  llm: OpenRouterClient,
  input: VoiceRunInput,
): Promise<{ status: "passed" | "failed" | "errored"; reason: string; scores?: VoiceJudgeScores }> {
  const persona = personaById(input.personaId);
  if (!persona) {
    return { status: "errored", reason: `Unknown persona id '${input.personaId}'` };
  }

  let cfg: LiveKitConfig;
  try {
    cfg = liveKitConfigFromEnv();
  } catch (err) {
    return { status: "errored", reason: (err as Error).message };
  }

  await markRunRunning(input.runId, input.personaId, cfg.url, input.roomName);

  const tts = getTTSProvider();
  const stt = getSTTProvider();
  const session = new VoiceSession(cfg, /* publisher sample rate */ 24000);
  const conversation: Array<{ role: "persona" | "ai"; text: string }> = [];
  let stepIndex = 0;

  try {
    await session.join({
      roomName: input.roomName,
      identity: `tester-${persona.id}`,
      metadata: JSON.stringify({ persona: persona.id, scenario: input.prompt }),
    });

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // 1. Decide what the persona says next
      const utterance = await generatePersonaUtterance(llm, {
        persona,
        scenario: input.prompt,
        conversation,
        turnNumber: turn,
      });

      if (utterance.action === "end") {
        logger.info({ runId: input.runId, turn }, "persona ended call");
        break;
      }

      // 2. Synthesize audio
      const speakStart = Date.now();
      const synth = await tts.synthesize({
        text: utterance.text,
        voiceId: persona.voiceId,
        pace: persona.pace,
      });
      const speakAudioPath = await uploadAudio({
        runId: input.runId,
        filename: `${stepIndex.toString().padStart(3, "0")}-persona.wav`,
        audio: synth.audio,
        mimeType: synth.mimeType,
      });

      // 3. Publish audio + record step
      const samples = wavBufferToInt16PCM(synth.audio);
      session.subscriber.startCapture();
      await session.publisher.sendAudio(samples);
      await session.publisher.waitForDrain();
      stepIndex += 1;
      await persistVoiceStep({
        runId: input.runId,
        index: stepIndex,
        toolName: "sayAsPersona",
        intent: utterance.text,
        audioPath: speakAudioPath,
        transcript: utterance.text,
      });
      conversation.push({ role: "persona", text: utterance.text });

      // 4. Listen for AI response — wait for silence after first frames
      const listenStart = Date.now();
      let lastFrameAt = Date.now();
      const checkUntil = Date.now() + MAX_LISTEN_MS;
      let everHeard = false;
      while (Date.now() < checkUntil) {
        await new Promise((r) => setTimeout(r, 250));
        if (session.subscriber.hasFrames()) {
          if (!everHeard) {
            everHeard = true;
            // ensure minimum listen window even after first audio
          }
          lastFrameAt = Date.now();
        }
        const elapsed = Date.now() - listenStart;
        const silenceFor = Date.now() - lastFrameAt;
        if (everHeard && elapsed >= MIN_LISTEN_MS && silenceFor >= SILENCE_TIMEOUT_MS) break;
        if (!everHeard && elapsed >= MIN_LISTEN_MS + SILENCE_TIMEOUT_MS) break;
      }
      const captured = session.subscriber.stopCapture();
      const aiLatencyMs = Date.now() - speakStart;

      // 5. Transcribe
      let transcript = "";
      let aiAudioPath: string | undefined;
      if (captured.samples.length > 0) {
        const wav = int16PCMToWavBuffer(captured.samples, captured.sampleRate, captured.channels);
        aiAudioPath = await uploadAudio({
          runId: input.runId,
          filename: `${stepIndex.toString().padStart(3, "0")}-ai.wav`,
          audio: wav,
          mimeType: "audio/wav",
        });
        try {
          const result = await stt.transcribe({ audio: wav, language: "en" });
          transcript = result.text.trim();
        } catch (err) {
          logger.warn({ err, runId: input.runId }, "transcription failed");
        }
      }

      stepIndex += 1;
      await persistVoiceStep({
        runId: input.runId,
        index: stepIndex,
        toolName: "listenForResponse",
        intent: transcript || "(no audio captured)",
        ...(aiAudioPath ? { audioPath: aiAudioPath } : {}),
        transcript,
        latencyMs: aiLatencyMs,
      });
      conversation.push({ role: "ai", text: transcript });

      if (!transcript) {
        logger.info({ runId: input.runId, turn }, "no AI response; ending");
        break;
      }
    }

    // 6. Judge the conversation
    const scores = await judgeConversation(llm, {
      persona,
      scenario: input.prompt,
      conversation,
    });
    return {
      status: scores.overall_pass ? "passed" : "failed",
      reason: scores.reasoning,
      scores,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, runId: input.runId }, "voice agent crashed");
    return { status: "errored", reason: message };
  } finally {
    await session.leave().catch(() => {});
  }
}

// ============================================================
// Helpers
// ============================================================

async function generatePersonaUtterance(
  llm: OpenRouterClient,
  args: {
    persona: VoicePersona;
    scenario: string;
    conversation: Array<{ role: "persona" | "ai"; text: string }>;
    turnNumber: number;
  },
): Promise<{ action: "say" | "end"; text: string }> {
  const sys = `${args.persona.scriptSystemPrompt}

# Test scenario
${args.scenario}

# Output rules
- Output STRICTLY JSON: {"action": "say"|"end", "text": "..."}
- "say": what to speak next (1-2 sentences max, natural conversational length)
- "end": you're done with the call, hang up
- This is turn ${args.turnNumber + 1} of up to ${MAX_TURNS}. End naturally if the goal is achieved or hopeless.`;

  const userMsg =
    args.conversation.length === 0
      ? "Start the call. What's your opening line?"
      : "Conversation so far:\n" +
        args.conversation
          .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
          .join("\n") +
        "\n\nWhat does the persona say next?";

  const req: ChatCompletionRequest = {
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 300,
  };
  const resp = await llm.chat(req);
  const raw = resp.choices[0]?.message.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as { action?: string; text?: string };
    if (parsed.action === "end") return { action: "end", text: parsed.text ?? "" };
    return { action: "say", text: (parsed.text ?? "").slice(0, 500) };
  } catch {
    return { action: "say", text: raw.slice(0, 500) };
  }
}

async function judgeConversation(
  llm: OpenRouterClient,
  args: {
    persona: VoicePersona;
    scenario: string;
    conversation: Array<{ role: "persona" | "ai"; text: string }>;
  },
): Promise<VoiceJudgeScores> {
  const sys = `You are a senior QA judge for voice AI products. Score the AI's performance across the conversation below.

# Persona that called the AI
${args.persona.name} — ${args.persona.blurb}

# Scenario
${args.scenario}

# Score each on 0-10
- helpfulness: did the AI actually help the persona?
- accuracy: was the info correct + free of hallucinations?
- tone_match: was the tone appropriate for this persona?
- latency: was the conversation flowing naturally? (low scores for awkward pauses)
- recovery: when the persona was confused / interrupted, did the AI recover?

overall_pass = true only if helpfulness >= 6 AND accuracy >= 7 AND no critical issues.

Output STRICT JSON:
{"overall_pass": bool, "helpfulness": int, "accuracy": int, "tone_match": int, "latency": int, "recovery": int, "reasoning": "<2-3 sentence summary>"}`;

  const userMsg =
    "Transcript:\n\n" +
    args.conversation.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join("\n");

  const req: ChatCompletionRequest = {
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 600,
  };
  const resp = await llm.chat(req);
  const raw = resp.choices[0]?.message.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as VoiceJudgeScores;
    return {
      overall_pass: !!parsed.overall_pass,
      helpfulness: clamp(parsed.helpfulness, 0, 10),
      accuracy: clamp(parsed.accuracy, 0, 10),
      tone_match: clamp(parsed.tone_match, 0, 10),
      latency: clamp(parsed.latency, 0, 10),
      recovery: clamp(parsed.recovery, 0, 10),
      reasoning: String(parsed.reasoning ?? ""),
    };
  } catch {
    return {
      overall_pass: false,
      helpfulness: 0,
      accuracy: 0,
      tone_match: 0,
      latency: 0,
      recovery: 0,
      reasoning: "Judge returned malformed output",
    };
  }
}

function clamp(n: unknown, lo: number, hi: number): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(lo, Math.min(hi, Math.round(num)));
}

async function markRunRunning(
  runId: string,
  personaId: string,
  roomUrl: string,
  roomName: string,
): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from("runs")
    .update({
      status: "running",
      voice_persona_id: personaId,
      voice_room_url: `${roomUrl}#${roomName}`,
    })
    .eq("id", runId);
}

async function persistVoiceStep(args: {
  runId: string;
  index: number;
  toolName: "sayAsPersona" | "listenForResponse";
  intent: string;
  audioPath?: string;
  transcript?: string;
  latencyMs?: number;
}): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from("steps").insert({
    run_id: args.runId,
    index: args.index,
    kind: "custom",
    tool_name: args.toolName,
    intent: args.intent,
    tool_args: {},
    ...(args.audioPath ? { audio_path: args.audioPath } : {}),
    ...(args.transcript ? { transcript: args.transcript } : {}),
    ...(args.latencyMs !== undefined ? { latency_ms: args.latencyMs } : {}),
  });
}

// ============================================================
// WAV / PCM helpers
// ============================================================

function wavBufferToInt16PCM(wav: Buffer): Int16Array {
  // Find 'data' chunk and return Int16 view.
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let offset = 12;
  while (offset < wav.length - 8) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (id === 0x64617461) {
      return new Int16Array(wav.buffer, wav.byteOffset + offset + 8, size / 2);
    }
    offset += 8 + size;
  }
  return new Int16Array(0);
}

/** Wrap raw Int16 PCM samples into a minimal WAV container. */
function int16PCMToWavBuffer(
  samples: Int16Array,
  sampleRate: number,
  channels: number,
): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  // Copy samples
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i]!, 44 + i * 2);
  }
  return buf;
}

// Avoid unused-import warning when Hono/etc. are absent.
export type { ChatMessage };
