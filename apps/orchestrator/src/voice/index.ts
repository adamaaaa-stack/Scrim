import { KokoroReplicateTTS } from "./kokoro-replicate.js";
import { OpenAITTS } from "./openai-tts.js";
import type { TTSProvider } from "./tts.js";
import { logger } from "../logger.js";

const PROVIDERS: TTSProvider[] = [
  new KokoroReplicateTTS(),
  new OpenAITTS(),
];

/**
 * Get the active TTS provider. Honors TTS_PROVIDER env var if set; else
 * picks the first available provider (one with credentials configured).
 */
export function getTTSProvider(): TTSProvider {
  const preferred = process.env.TTS_PROVIDER;
  if (preferred) {
    const found = PROVIDERS.find((p) => p.name === preferred);
    if (found && found.available) return found;
    logger.warn(
      { preferred, available: PROVIDERS.filter((p) => p.available).map((p) => p.name) },
      "preferred TTS provider not available, falling back",
    );
  }
  const fallback = PROVIDERS.find((p) => p.available);
  if (!fallback) {
    throw new Error(
      "No TTS provider available. Set REPLICATE_API_TOKEN (Kokoro) or OPENAI_API_KEY (OpenAI tts-1).",
    );
  }
  return fallback;
}

export * from "./personas.js";
export * from "./tts.js";
