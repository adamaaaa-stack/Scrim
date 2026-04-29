/**
 * Speech-to-text abstraction. Currently has one implementation:
 * Whisper Small via @huggingface/transformers (ONNX in Node).
 *
 * No API key required, runs locally. First call downloads ~250MB model.
 */

export interface TranscribeInput {
  /** Audio buffer (WAV/MP3/FLAC). */
  audio: Buffer;
  /** Optional language hint (ISO-639 code, e.g. 'en'). */
  language?: string;
}

export interface TranscribeOutput {
  text: string;
  /** Per-segment timestamps if the model provides them. */
  segments?: Array<{ start: number; end: number; text: string }>;
  /** Detected (or hinted) language. */
  language?: string;
}

export interface STTProvider {
  readonly name: string;
  readonly available: boolean;
  transcribe(input: TranscribeInput): Promise<TranscribeOutput>;
}

export class STTError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "STTError";
  }
}
