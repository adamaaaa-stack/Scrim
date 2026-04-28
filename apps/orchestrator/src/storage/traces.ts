import { readFile } from "fs/promises";
import { supabaseAdmin } from "../db/supabase.js";
import { logger } from "../logger.js";

const BUCKET = "traces";
let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const sb = supabaseAdmin();
  const { data: existing } = await sb.storage.getBucket(BUCKET);
  if (!existing) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Failed to create traces bucket: ${error.message}`);
    }
  }
  bucketEnsured = true;
}

/**
 * Upload a Playwright trace.zip from local disk and return the storage path.
 * Path: <runId>.zip
 */
export async function uploadTrace(args: {
  runId: string;
  localPath: string;
}): Promise<string> {
  await ensureBucket();
  const buf = await readFile(args.localPath);
  const path = `${args.runId}.zip`;
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: "application/zip",
    upsert: true,
  });
  if (error) {
    logger.error({ err: error, path }, "trace upload failed");
    throw new Error(`Trace upload failed: ${error.message}`);
  }
  return path;
}

export async function signedTraceUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}
