"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client component that refreshes server data (router.refresh) at the
 * given interval while `enabled` is true. Used on the run detail page
 * so live runs update without a full page reload.
 */
export function AutoRefresh({
  enabled,
  intervalMs = 3000,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);
  return null;
}
