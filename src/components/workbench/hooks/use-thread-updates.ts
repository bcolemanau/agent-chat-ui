/**
 * Subscribe to decisions/KG updates for a thread via SSE.
 * Events trigger refetch callbacks when the backend pushes decisions_updated or kg_updated.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ThreadUpdatesCallbacks = {
    onDecisionsUpdate?: () => void;
    onKgUpdate?: () => void;
};

export function useThreadUpdates(
    threadId: string | undefined,
    callbacks: ThreadUpdatesCallbacks
): { connected: boolean } {
    const [connected, setConnected] = useState(false);
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    useEffect(() => {
        if (!threadId || threadId === "default") {
            setConnected(false);
            return;
        }

        const url = `/api/updates/stream?thread_id=${encodeURIComponent(threadId)}`;
        const es = new EventSource(url);

        const onOpen = () => setConnected(true);
        const onError = () => {
            setConnected(false);
            es.close();
        };

        es.addEventListener("decisions_updated", () => {
            callbacksRef.current.onDecisionsUpdate?.();
        });
        es.addEventListener("kg_updated", () => {
            callbacksRef.current.onKgUpdate?.();
        });
        es.onopen = onOpen;
        es.onerror = onError;

        return () => {
            es.close();
            setConnected(false);
        };
    }, [threadId]);

    return { connected };
}
