import { TTSError, type SynthesizeInput, type SynthesizeOutput, type TTSProvider } from "./tts.js";

const REPLICATE_BASE = "https://api.replicate.com/v1";
// Hexgrad's Kokoro on Replicate. Pin a known-good version hash.
const KOKORO_MODEL = "jaaari/kokoro-82m:f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13";

/**
 * Kokoro TTS via Replicate's hosted endpoint.
 * Requires REPLICATE_API_TOKEN env var. Pricing is ~$0.000725 per second
 * of audio at the time of writing — cheap for QA scale, not free.
 */
export class KokoroReplicateTTS implements TTSProvider {
  readonly name = "kokoro_replicate";

  get available(): boolean {
    return Boolean(process.env.REPLICATE_API_TOKEN);
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    if (!this.available) {
      throw new TTSError("REPLICATE_API_TOKEN not set", this.name);
    }
    const token = process.env.REPLICATE_API_TOKEN!;

    // Map our pace abstraction to Kokoro's speed parameter (1.0 = normal).
    const speed = input.pace === "slow" ? 0.85 : input.pace === "fast" ? 1.15 : 1.0;

    const startRes = await fetch(`${REPLICATE_BASE}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait", // Block until done; small audio files complete in seconds.
      },
      body: JSON.stringify({
        version: KOKORO_MODEL.split(":")[1],
        input: {
          text: input.text,
          voice: input.voiceId,
          speed,
        },
      }),
    });
    if (!startRes.ok) {
      const body = await startRes.text();
      throw new TTSError(`Replicate ${startRes.status}: ${body.slice(0, 300)}`, this.name);
    }
    const prediction = (await startRes.json()) as {
      status: string;
      output?: string | string[];
      error?: string;
    };
    if (prediction.status !== "succeeded" || !prediction.output) {
      throw new TTSError(
        `Prediction ${prediction.status}: ${prediction.error ?? "no output"}`,
        this.name,
      );
    }

    const audioUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!audioUrl) throw new TTSError("Kokoro returned no audio URL", this.name);

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new TTSError(`Audio fetch ${audioRes.status}`, this.name);
    }
    const arrayBuf = await audioRes.arrayBuffer();
    const audio = Buffer.from(arrayBuf);

    return {
      audio,
      mimeType: "audio/wav",
      sampleRate: 24000,
    };
  }
}
