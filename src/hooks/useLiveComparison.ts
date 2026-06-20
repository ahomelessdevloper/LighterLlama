import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { LiveComparisonPayload } from "../types/liveStats";

const REFRESH_MS = 28000;

export function useLiveComparison() {
  const [payload, setPayload] = useState<LiveComparisonPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/live-comparison.json");
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      setPayload((await res.json()) as LiveComparisonPayload);
    } catch (err: unknown) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Failed to load";
        toast.error("Load failed", { description: message });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData({ silent: true }), REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  return { payload, loading, reload: loadData };
}