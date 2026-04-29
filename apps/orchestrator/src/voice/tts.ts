/**
 * Text-to-speech abstraction. Multiple providers can implement this so
 * we can swap between self-hosted Kokoro, Replicate-hosted Kokoro,
 * OpenAI tts-1, or ElevenLabs without changing the agent code.
 *
 * Default provider is selected via TTS_PROVIDER env var
 * (kokoro_local | kokoro_replicate | openai). Falls back to the first
 * available provider with credentials configured.
 */

export interface SynthesizeInput {
  /** The exact words to speak. */
  text: string;
  /** Provider-specific voice id (e.g. Kokoro "af_heart" or OpenAI "alloy"). */
  voiceId: string;
  /** Optional pace override ("slow" | "normal" | "fast"). */
  pace?: "slow" | "normal" | "fast";
}

export interface SynthesizeOutput {
  /** PCM/WAV/MP3 audio buffer. */
  audio: Buffer;
  /** Mime type of the audio buffer. */
  mimeType: string;
  /** Duration in milliseconds (if the provider exposes it). */
  durationMs?: number;
  /** Sample rate (e.g. 24000). */
  sampleRate?: number;
}

export interface TTSProvider {
  readonly name: string;
  readonly available: boolean;
  synthesize(input: SynthesizeInput): Promise<SynthesizeOutput>;
}

export class TTSError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TTSError";
  }
}
