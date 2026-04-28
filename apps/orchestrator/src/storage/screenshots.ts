import { supabaseAdmin } from "../db/supabase.js";
import { logger } from "../logger.js";

const BUCKET = "screenshots";

let bucketEnsured = false;

/** Idempotent — creates the screenshots bucket on first call. */
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const sb = supabaseAdmin();
  const { data: existing } = await sb.storage.getBucket(BUCKET);
  if (!existing) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Failed to create bucket: ${error.message}`);
    }
  }
  bucketEnsured = true;
}

/**
 * Upload a screenshot buffer and return the storage path.
 * Path format: <runId>/<stepIndex>-<timestamp>.png
 */
export async function uploadScreenshot(args: {
  runId: string;
  stepIndex: number;
  buffer: Buffer;
}): Promise<string> {
  await ensureBucket();
  const sb = supabaseAdmin();
  const path = `${args.runId}/${args.stepIndex}-${Date.now()}.png`;

  const { error } = await sb.storage.from(BUCKET).upload(path, args.buffer, {
    contentType: "image/png",
    upsert: false,
  });
  if (error) {
    logger.error({ err: error, path }, "screenshot upload failed");
    throw new Error(`Screenshot upload failed: ${error.message}`);
  }
  return path;
}

/** Returns a short-lived signed URL for displaying a screenshot in the UI. */
export async function signedScreenshotUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Sign URL failed: ${error?.message ?? "no url"}`);
  }
  return data.signedUrl;
}
