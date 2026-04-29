import { supabaseAdmin } from "../db/supabase.js";
import { logger } from "../logger.js";

const BUCKET = "audio";
let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const sb = supabaseAdmin();
  const { data: existing } = await sb.storage.getBucket(BUCKET);
  if (!existing) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Failed to create audio bucket: ${error.message}`);
    }
  }
  bucketEnsured = true;
}

/** Upload an audio buffer to the audio bucket. Returns the storage path. */
export async function uploadAudio(args: {
  runId: string;
  filename: string;
  audio: Buffer;
  mimeType: string;
}): Promise<string> {
  await ensureBucket();
  const path = `${args.runId}/${args.filename}`;
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).upload(path, args.audio, {
    contentType: args.mimeType,
    upsert: true,
  });
  if (error) {
    logger.error({ err: error, path }, "audio upload failed");
    throw new Error(`Audio upload failed: ${error.message}`);
  }
  return path;
}

export async function signedAudioUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}
