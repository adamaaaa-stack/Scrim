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
  // The exact (model_id, dtype) combination must match a file that exists
  // in the HF repo. kokoro-js bundles a default but doesn't always load
  // cleanly. We try a sequence of known-good combinations.
  const candidates: Array<{ modelId: string; dtype: "fp32" | "fp16" | "q8" | "q4" | "q4f16" }> = [];

  if (process.env.KOKORO_MODEL_ID) {
    candidates.push({
      modelId: process.env.KOKORO_MODEL_ID,
      dtype: (process.env.KOKORO_DTYPE ?? "q8") as "q8",
    });
  }
  // Defaults — try fp32 first (most likely to exist), then quantized.
  candidates.push(
    { modelId: "onnx-community/Kokoro-82M-ONNX", dtype: "fp32" },
    { modelId: "onnx-community/Kokoro-82M-ONNX", dtype: "q8" },
    { modelId: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "fp32" },
    { modelId: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "q8" },
  );

  const { KokoroTTS } = await import("kokoro-js");
  let lastErr: unknown;
  for (const { modelId, dtype } of candidates) {
    try {
      logger.info({ modelId, dtype, device: "cpu" }, "loading kokoro-js model");
      // device: "cpu" is required in Node — default "wasm" is browser-only.
      const model = await KokoroTTS.from_pretrained(modelId, {
        dtype,
        device: "cpu" as never,
      } as never);
      logger.info({ modelId, dtype }, "kokoro-js model loaded");
      return model as unknown as KokoroTTSModel;
    } catch (err) {
      lastErr = err;
      logger.warn(
        { modelId, dtype, err: err instanceof Error ? err.message : String(err) },
        "kokoro candidate failed, trying next",
      );
    }
  }
  throw new Error(
    `All Kokoro candidates failed. Last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
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
