/**
 * Schema-driven config for Decisions pane: phase mapping from backend.
 * Fetches GET /config/decision-types so frontend uses backend as single source of truth.
 * Falls back to inferPhaseFromType when config not yet loaded or API unavailable.
 */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ORG_PHASE_TYPES, inferPhaseFromType } from "@/lib/decision-types";

interface DecisionTypesConfig {
  org_phase_types: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

let cached: DecisionTypesConfig | null = null;
let cachedAt = 0;

export function useDecisionTypesConfig(): {
  config: DecisionTypesConfig | null;
  inferPhase: (type: string) => "Organization" | "Project";
  isLoading: boolean;
} {
  const [config, setConfig] = useState<DecisionTypesConfig | null>(() => cached);
  const [isLoading, setIsLoading] = useState(!cached);

  const load = useCallback(async () => {
    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
      setConfig(cached);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/config/decision-types");
      if (!res.ok) return;
      const data = (await res.json()) as DecisionTypesConfig;
      if (data?.org_phase_types) {
        cached = data;
        cachedAt = Date.now();
        setConfig(data);
      }
    } catch {
      if (!cached) {
        cached = { org_phase_types: Array.from(DEFAULT_ORG_PHASE_TYPES) };
        cachedAt = Date.now();
        setConfig(cached);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inferPhase = useCallback(
    (type: string): "Organization" | "Project" => {
      if (config?.org_phase_types?.length) {
        return inferPhaseFromType(type, config.org_phase_types);
      }
      return inferPhaseFromType(type);
    },
    [config]
  );

  return { config, inferPhase, isLoading };
}
