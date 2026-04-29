import { TTSError, type SynthesizeInput, type SynthesizeOutput, type TTSProvider } from "./tts.js";
import { logger } from "../logger.js";

/**
 * Kokoro TTS running locally via kokoro-js (ONNX runtime in Node).
 * First call downloads the ~330MB model to the local HF cache.
 * No API costs, no rate limits, no network needed after warm-up.
 *
 * Model is loaded lazily and reused across calls (singleton).
 */
let modelPromise: Promise<KokoroTTSModel> | null = null;

interface KokoroTTSModel {
  generate(text: string, opts: { voice: string; speed?: number }): Promise<{
    audio: Float32Array;
    sampling_rate: number;
    toWav(): ArrayBuffer;
  }>;
}

async function loadModel(): Promise<KokoroTTSModel> {
  // Dynamic import so the heavy dep is only loaded when actually used.
  // kokoro-js has its own load mechanism; the model id can be overridden.
  const modelId = process.env.KOKORO_MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
  const dtype = (process.env.KOKORO_DTYPE ?? "q8") as "fp32" | "fp16" | "q8" | "q4" | "q4f16";

  logger.info({ modelId, dtype }, "loading kokoro-js model (first call may download ~330MB)");

  const { KokoroTTS } = await import("kokoro-js");
  const model = await KokoroTTS.from_pretrained(modelId, { dtype });
  logger.info("kokoro-js model loaded");
  return model as unknown as KokoroTTSModel;
}

export class KokoroLocalTTS implements TTSProvider {
  readonly name = "kokoro_local";
  // Always available — runs on the host machine.
  readonly available = true;

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    if (!modelPromise) modelPromise = loadModel();
    let model: KokoroTTSModel;
    try {
      model = await modelPromise;
    } catch (err) {
      modelPromise = null;
      throw new TTSError(
        `Failed to load Kokoro model: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err,
      );
    }

    const speed = input.pace === "slow" ? 0.85 : input.pace === "fast" ? 1.15 : 1.0;

    try {
      const result = await model.generate(input.text, {
        voice: input.voiceId,
        speed,
      });
      const wav = Buffer.from(result.toWav());
      const durationMs = (result.audio.length / result.sampling_rate) * 1000;
      return {
        audio: wav,
        mimeType: "audio/wav",
        durationMs,
        sampleRate: result.sampling_rate,
      };
    } catch (err) {
      throw new TTSError(
        `Kokoro synth failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err,
      );
    }
  }
}
