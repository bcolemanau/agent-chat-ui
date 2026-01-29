/**
 * Persist processed decisions (approved/rejected) in localStorage by threadId.
 * Backend persistence can be added later; this keeps a per-thread history in the browser.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY_PREFIX = "reflexion_processed_decisions_";
const MAX_ITEMS = 500;

export interface ProcessedDecision {
  id: string;
  type: string;
  title: string;
  status: "approved" | "rejected";
  timestamp: number;
}

function getStorageKey(threadId: string | undefined): string {
  return threadId ? `${STORAGE_KEY_PREFIX}${threadId}` : `${STORAGE_KEY_PREFIX}default`;
}

function loadFromStorage(threadId: string | undefined): ProcessedDecision[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProcessedDecision[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useProcessedDecisions(threadId: string | undefined): {
  processed: ProcessedDecision[];
  addProcessed: (decision: ProcessedDecision) => void;
  clearProcessed: () => void;
} {
  const [processed, setProcessed] = useState<ProcessedDecision[]>([]);

  useEffect(() => {
    setProcessed(loadFromStorage(threadId));
  }, [threadId]);

  const addProcessed = useCallback(
    (decision: ProcessedDecision) => {
      const entry: ProcessedDecision = {
        ...decision,
        timestamp: decision.timestamp || Date.now(),
      };
      setProcessed((prev) => {
        const next = [entry, ...prev].slice(0, MAX_ITEMS);
        try {
          localStorage.setItem(getStorageKey(threadId), JSON.stringify(next));
        } catch (e) {
          console.warn("[useProcessedDecisions] localStorage setItem failed", e);
        }
        return next;
      });
    },
    [threadId]
  );

  const clearProcessed = useCallback(() => {
    setProcessed([]);
    try {
      localStorage.removeItem(getStorageKey(threadId));
    } catch (e) {
      console.warn("[useProcessedDecisions] localStorage removeItem failed", e);
    }
  }, [threadId]);

  return { processed, addProcessed, clearProcessed };
}
