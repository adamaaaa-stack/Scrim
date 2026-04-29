import { KokoroLocalTTS } from "./kokoro-local.js";
import { KokoroReplicateTTS } from "./kokoro-replicate.js";
import { OpenAITTS } from "./openai-tts.js";
import { WhisperLocalSTT } from "./whisper-local.js";
import type { TTSProvider } from "./tts.js";
import type { STTProvider } from "./stt.js";
import { logger } from "../logger.js";

// Order = priority. Local providers first so we default to no-cost,
// no-rate-limit, on-device synthesis.
const TTS_PROVIDERS: TTSProvider[] = [
  new KokoroLocalTTS(),
  new KokoroReplicateTTS(),
  new OpenAITTS(),
];

const STT_PROVIDERS: STTProvider[] = [new WhisperLocalSTT()];

/**
 * Get the active TTS provider. Honors TTS_PROVIDER env var if set; else
 * picks the first available provider (defaults to local Kokoro).
 */
export function getTTSProvider(): TTSProvider {
  const preferred = process.env.TTS_PROVIDER;
  if (preferred) {
    const found = TTS_PROVIDERS.find((p) => p.name === preferred);
    if (found && found.available) return found;
    logger.warn(
      { preferred, available: TTS_PROVIDERS.filter((p) => p.available).map((p) => p.name) },
      "preferred TTS provider not available, falling back",
    );
  }
  const fallback = TTS_PROVIDERS.find((p) => p.available);
  if (!fallback) throw new Error("No TTS provider available.");
  return fallback;
}

/** Get the active STT provider. Currently always Whisper-local. */
export function getSTTProvider(): STTProvider {
  const fallback = STT_PROVIDERS.find((p) => p.available);
  if (!fallback) throw new Error("No STT provider available.");
  return fallback;
}

export * from "./personas.js";
export * from "./tts.js";
export * from "./stt.js";
