import { TTSError, type SynthesizeInput, type SynthesizeOutput, type TTSProvider } from "./tts.js";

/**
 * OpenAI TTS-1 fallback provider. Higher quality, paid, $15 per 1M chars.
 * Requires OPENAI_API_KEY env var. Voice id maps to one of OpenAI's named
 * voices (alloy, echo, fable, onyx, nova, shimmer); we map persona ids
 * loosely if Kokoro voice ids are passed in.
 */
const OPENAI_VOICE_MAP: Record<string, string> = {
  af_heart: "nova",
  af_bella: "shimmer",
  af_nicole: "alloy",
  am_adam: "onyx",
  am_michael: "fable",
  am_echo: "echo",
};

export class OpenAITTS implements TTSProvider {
  readonly name = "openai";

  get available(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    if (!this.available) throw new TTSError("OPENAI_API_KEY not set", this.name);

    const voice = OPENAI_VOICE_MAP[input.voiceId] ?? input.voiceId;
    const speed = input.pace === "slow" ? 0.85 : input.pace === "fast" ? 1.15 : 1.0;

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice,
        input: input.text,
        speed,
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new TTSError(`OpenAI ${res.status}: ${body.slice(0, 300)}`, this.name);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return { audio, mimeType: "audio/mpeg" };
  }
}
