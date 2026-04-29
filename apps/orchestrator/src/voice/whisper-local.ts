import { STTError, type STTProvider, type TranscribeInput, type TranscribeOutput } from "./stt.js";
import { logger } from "../logger.js";

/**
 * Whisper Small running locally via @huggingface/transformers (ONNX
 * runtime in Node). No API key, no rate limits.
 *
 * First call downloads ~250MB model to the HF cache. Singleton pipeline.
 */
type WhisperPipeline = (
  input: Float32Array | string,
  options?: Record<string, unknown>,
) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }>;

let pipelinePromise: Promise<WhisperPipeline> | null = null;

async function loadPipeline(): Promise<WhisperPipeline> {
  const modelId = process.env.WHISPER_MODEL_ID ?? "Xenova/whisper-small";
  logger.info({ modelId }, "loading whisper pipeline (first call may download ~250MB)");
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("automatic-speech-recognition", modelId);
  logger.info("whisper pipeline ready");
  return pipe as unknown as WhisperPipeline;
}

/** Convert PCM/WAV/MP3 buffer into Float32Array PCM at 16kHz mono. */
async function audioToFloat32(audio: Buffer): Promise<Float32Array> {
  // Lazy import. node-wav-decoder or similar would be cleaner; for now we
  // assume the caller passes an already-decoded Float32Array via a
  // serialized form OR a WAV file. transformers.js accepts Float32Array
  // PCM at 16kHz mono.
  //
  // Minimal WAV parser: read 16-bit PCM samples and normalize.
  // This handles the WAV files Kokoro produces (24kHz mono 16-bit).
  // We resample naively to 16kHz by linear interpolation.
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  if (view.getUint32(0, false) !== 0x52494646) {
    throw new STTError("Not a RIFF/WAV buffer", "whisper_local");
  }
  const sampleRate = view.getUint32(24, true);
  // numChannels at offset 22, bitsPerSample at 34
  const numChannels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  if (bitsPerSample !== 16) {
    throw new STTError(`Unsupported bitsPerSample ${bitsPerSample}`, "whisper_local");
  }
  // Find 'data' chunk
  let offset = 12;
  while (offset < audio.length - 8) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x64617461) {
      // 'data'
      const samples = new Int16Array(audio.buffer, audio.byteOffset + offset + 8, chunkSize / 2);
      // Convert to mono Float32 normalized to [-1, 1].
      const monoLen = Math.floor(samples.length / numChannels);
      const mono = new Float32Array(monoLen);
      for (let i = 0; i < monoLen; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) sum += samples[i * numChannels + c]!;
        mono[i] = sum / numChannels / 32768;
      }
      // Resample to 16kHz if needed.
      if (sampleRate === 16000) return mono;
      const targetLen = Math.floor((mono.length * 16000) / sampleRate);
      const out = new Float32Array(targetLen);
      const ratio = mono.length / targetLen;
      for (let i = 0; i < targetLen; i++) {
        const srcIdx = i * ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(lo + 1, mono.length - 1);
        const frac = srcIdx - lo;
        out[i] = mono[lo]! * (1 - frac) + mono[hi]! * frac;
      }
      return out;
    }
    offset += 8 + chunkSize;
  }
  throw new STTError("WAV data chunk not found", "whisper_local");
}

export class WhisperLocalSTT implements STTProvider {
  readonly name = "whisper_local";
  readonly available = true;

  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    if (!pipelinePromise) pipelinePromise = loadPipeline();
    let pipe: WhisperPipeline;
    try {
      pipe = await pipelinePromise;
    } catch (err) {
      pipelinePromise = null;
      throw new STTError(
        `Failed to load Whisper: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err,
      );
    }

    let pcm: Float32Array;
    try {
      pcm = await audioToFloat32(input.audio);
    } catch (err) {
      throw err instanceof STTError
        ? err
        : new STTError(
            `Audio decode failed: ${err instanceof Error ? err.message : String(err)}`,
            this.name,
            err,
          );
    }

    try {
      const opts: Record<string, unknown> = {
        return_timestamps: true,
        chunk_length_s: 30,
      };
      if (input.language) opts.language = input.language;

      const result = await pipe(pcm, opts);
      return {
        text: result.text,
        ...(result.chunks
          ? {
              segments: result.chunks.map((c) => ({
                start: c.timestamp[0] ?? 0,
                end: c.timestamp[1] ?? 0,
                text: c.text,
              })),
            }
          : {}),
        ...(input.language ? { language: input.language } : {}),
      };
    } catch (err) {
      throw new STTError(
        `Whisper transcribe failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err,
      );
    }
  }
}
