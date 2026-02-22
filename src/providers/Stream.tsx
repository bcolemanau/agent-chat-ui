/* eslint-disable react-refresh/only-export-components -- file exports provider + useStreamContext */
"use client";

import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { getApiKey } from "@/lib/api-key";
import { useRouteScope } from "@/hooks/use-route-scope";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { createClient } from "./client";
/** Filtered KG from backend (filter_graph_data(..., context_mode=true)); streamed when Project Configurator sets it. */
export type FilteredKgType = {
  nodes: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

export type StateType = {
  messages: Message[];
  ui?: UIMessage[];
  current_trigger_id?: string;
  confidence_score?: number;
  required_artifacts?: string[];
  governing_mechanisms?: string[];
  active_risks?: string[];
  user_project_description?: string;
  context?: Record<string, unknown>;
  /** Active workflow phase (from backend); e.g. supervisor, project_configurator, concept, requirements, architecture, design, administration */
  active_agent?: string;
  visualization_html?: string;
  workbench_view?: "map" | "workflow" | "artifacts" | "discovery" | "settings";
  /** Filtered KG for current trigger; set by Project Configurator, streamed to client. Use for map view without extra /api/kg-data. */
  filtered_kg?: FilteredKgType;
};

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }
>;

// Cast to the full UseStream type since we're using callbacks that return UseStreamCustom
// but we need access to the full API (getMessagesMetadata, setBranch, etc.)
import type { UseStream } from "@langchain/langgraph-sdk/react";
type StreamContextType = UseStream<StateType, {
  UpdateType: {
    messages?: Message[] | Message | string;
    ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
    context?: Record<string, unknown>;
  };
  CustomEventType: UIMessage | RemoveUIMessage;
}> & {
  setApiKey: (key: string) => void;
  setWorkbenchView: (view: "map" | "workflow" | "artifacts" | "discovery" | "settings" | "decisions") => Promise<void>;
  /** Issue 37: Update thread state (e.g. after Begin Enriching handoff). */
  updateState?: (update: { values?: Record<string, unknown> }) => Promise<void>;
  /** After Apply, backend triggers a graph run; call this after a short delay to refetch thread state (new messages, active_mode). */
  refetchThreadState?: () => Promise<void>;
  setActiveAgentDebug?: (agent: string) => Promise<void>;
  /** Increment after a decision is applied so KG, Artifacts, Workflow refetch. */
  workbenchRefreshKey?: number;
  triggerWorkbenchRefresh?: () => void;
  apiUrl: string;
  /** Proposals from upload when proposals_injected=false (not in thread state); show in Decisions panel. */
  orphanProposals: Array<{ id: string; raw: Record<string, unknown> }>;
  setOrphanProposalsFromUpload: (response: { proposals?: unknown[]; proposals_injected?: boolean }) => void;
  removeOrphanProposal: (id: string) => void;
  /** Create a new cloned branch + thread (clone only on create). Use for "New Project" or "Create Organization"—not when selecting an existing org/project. Optional orgId = create in that org and set as current. */
  createNewThreadWithContext?: (orgId?: string) => Promise<string | null>;
};
const StreamContext = createContext<StreamContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
): Promise<boolean> {
  try {
    // Use Next.js API route to proxy to backend
    const res = await fetch("/api/info", {
      ...(apiKey && {
        headers: {
          "X-Api-Key": apiKey,
        },
      }),
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
  setApiKey,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
  setApiKey: (key: string) => void;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { projectId: projectIdFromPath } = useRouteScope();
  // Phase 3: When on /org/[orgId]/project/[projectId], use projectId as threadId (no opaque query param).
  const effectiveThreadId = projectIdFromPath ?? threadId ?? undefined;
  const { getThreads, setThreads } = useThreads();
  const prevThreadIdRef = useRef<string | null>(null);
  const reconnectProjectToNewThreadRef = useRef<() => void | Promise<void>>(() => {});

  // Load Org Context for Headers
  const [orgContext, setOrgContext] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrgContext(localStorage.getItem("reflexion_org_context"));
    }
  }, []);

  // When user switches organization, clear threadId so we don't keep using a project/thread from the
  // previous org. (Org switcher reloads after change; we clear threadId on next load via session flag.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("reflexion_clear_thread_for_org_switch") === "1") {
      sessionStorage.removeItem("reflexion_clear_thread_for_org_switch");
      setThreadId(null);
    }
  }, [setThreadId]);

  // Sync org context when it changes without reload (e.g. from shell or another component)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOrgContextChanged = () => {
      setOrgContext(localStorage.getItem("reflexion_org_context"));
      setThreadId(null);
    };
    window.addEventListener("orgContextChanged", handleOrgContextChanged);
    return () => window.removeEventListener("orgContextChanged", handleOrgContextChanged);
  }, [setThreadId]);

  const rawStream = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId: assistantId || "reflexion",
    threadId: effectiveThreadId,
    fetchStateHistory: !!effectiveThreadId,
    defaultHeaders: orgContext ? { "X-Organization-Context": orgContext } : undefined,
    onCustomEvent: (event, options) => {
      console.log("[Stream] Custom event received:", event);
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          if (!prev) return { messages: [], ui: uiMessageReducer([], event) };
          return { ...prev, ui: uiMessageReducer(prev.ui ?? [], event) };
        });
      }
    },
    onError: (error) => {
      console.error("[Stream] SDK Error:", error);
      const msg = String((error as Error)?.message ?? "");
      if (msg.includes("404") || msg.includes("Not Found")) {
        toast.error("Conversation state for this project isn’t available (e.g. after a server restart). You can still browse the map and decisions.", {
          duration: 8000,
          action: effectiveThreadId && apiUrl ? { label: "Reconnect to this project", onClick: () => reconnectProjectToNewThreadRef.current?.() } : undefined,
        });
        setThreadId(null);
        window.dispatchEvent(new CustomEvent("threadNotFound", { detail: { threadId: effectiveThreadId } }));
      }
    },
    onThreadId: (id) => {
      if (!id) return;
      // Only adopt thread id when we don't have one (first message created a new thread).
      // This preserves thread/project context during tool calls and node transitions:
      // we never overwrite an existing threadId from stream events.
      if (effectiveThreadId && id !== effectiveThreadId) {
        console.warn("[Stream] Ignoring onThreadId during active thread to preserve context", {
          received: id,
          current: effectiveThreadId,
        });
        return;
      }
      if (id !== effectiveThreadId) {
        console.log("[Stream] Thread ID set (new thread):", id);
        setThreadId(id);
        (async () => {
          await sleep();
          await getThreads().then(setThreads).catch(console.error);
        })();
      }
    },
  });

  // Detailed Client-Side Logging for State Transitions
  useEffect(() => {
    if (rawStream.values) {
      console.log("[Stream] Values Updated:", {
        agent: rawStream.values.active_agent,
        trigger: rawStream.values.current_trigger_id,
        risks: (rawStream.values as any).active_risks?.length ?? 0,
        hasContext: !!(rawStream.values as any).context,
      });
    }
  }, [rawStream.values]);

  // Method to update the backend state with the current view.
  // On 409 (thread busy), retry briefly then show a soft message instead of failing noisily.
  const setWorkbenchView = async (view: "map" | "workflow" | "artifacts" | "discovery" | "settings" | "decisions") => {
    if (!effectiveThreadId || !apiUrl) return;

    const maxRetries = 2;
    const retryDelayMs = 2000;
    const is409 = (e: unknown) =>
      (e as Error)?.message?.includes?.("409") || (e as Error)?.message?.includes?.("Conflict") || (e as { status?: number })?.status === 409;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {};
        if (orgContext) headers["X-Organization-Context"] = orgContext;
        const client = createClient(apiUrl, apiKey ?? undefined, headers);
        await client.threads.updateState(effectiveThreadId, {
          values: { workbench_view: view },
        });
        return;
      } catch (e) {
        if (is409(e) && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        if (is409(e)) {
          console.warn("[Stream] Thread busy; workbench view will update when the run finishes.");
          toast.info("Thread is busy. View will update when the run finishes.", { duration: 4000 });
          return;
        }
        const is404 = (x: unknown) =>
          (x as Error)?.message?.includes?.("404") || (x as { status?: number })?.status === 404;
        if (is404(e)) {
          toast.error("Conversation state for this project isn’t available (e.g. after a server restart). You can still browse the map and decisions.", {
            duration: 8000,
            action: effectiveThreadId && apiUrl ? { label: "Reconnect to this project", onClick: () => reconnectProjectToNewThreadRef.current?.() } : undefined,
          });
          window.dispatchEvent(new CustomEvent("threadNotFound", { detail: { threadId: effectiveThreadId } }));
          return;
        }
        console.error("[Stream] Failed to update workbench view:", e);
        return;
      }
    }
  };

  // When the user selects mode from the dropdown, we prefer overlay for a window so the selector doesn't revert.
  const userSetModeAtRef = useRef<number>(0);
  const USER_MODE_PRIORITY_MS = 60000; // 1 min: keep user's dropdown choice until backend/graph has caught up

  // DEBUG: manually override the active agent for this thread.
  const setActiveAgentDebug = async (agent: string) => {
    if (!effectiveThreadId || !apiUrl) {
      console.warn(`[Stream] setActiveAgentDebug skipped: threadId=${effectiveThreadId ?? "null"}, apiUrl=${apiUrl ? "set" : "null"} (need a thread; send a message first)`);
      toast.warning("Open a thread first to switch the active agent.", {
        description: "Send a message or select a thread so we can update the backend.",
      });
      return;
    }

    console.log(`[Stream] Setting active mode -> ${agent} (threadId=${effectiveThreadId}, apiUrl=${apiUrl})`);
    userSetModeAtRef.current = Date.now();
    // Optimistic update so the mode dropdown reflects the new value immediately (stream won't refetch until next message).
    valuesOverlayRef.current = { ...valuesOverlayRef.current, active_agent: agent, active_mode: agent };
    setValuesOverlay({ ...valuesOverlayRef.current });
    try {
      const headers: Record<string, string> = {};
      if (orgContext) headers["X-Organization-Context"] = orgContext;

      const client = createClient(apiUrl, apiKey ?? undefined, headers);
      await client.threads.updateState(effectiveThreadId, {
        values: { active_agent: agent, active_mode: agent },
      });
      console.log(`[Stream] Backend state updated to mode=${agent}`);
    } catch (e) {
      console.error("[Stream] Failed to set active mode (backend may not have updated):", e);
      toast.error("Failed to switch agent", {
        description: e instanceof Error ? e.message : "Backend may not have updated. Check console.",
      });
    }
  };

  // Optimistic overlay: stream hook doesn't refetch after updateState, so merge our updates so header (Mode) updates immediately.
  const [valuesOverlay, setValuesOverlay] = useState<Record<string, unknown>>({});
  const valuesOverlayRef = useRef<Record<string, unknown>>({});
  // Track stream message count so refetch never overwrites with an older snapshot (prevents "bunch of messages inserted before mine").
  const streamMessageCountRef = useRef(0);
  useEffect(() => {
    if (prevThreadIdRef.current !== (effectiveThreadId ?? null)) {
      prevThreadIdRef.current = effectiveThreadId ?? null;
      valuesOverlayRef.current = {};
      setValuesOverlay({});
      userSetModeAtRef.current = 0;
    }
  }, [effectiveThreadId]);
  useEffect(() => {
    const list = (rawStream as any)?.values?.messages;
    streamMessageCountRef.current = Array.isArray(list) ? list.length : 0;
  }, [rawStream]);

  // When the agent sets mode (e.g. set_active_mode tool), stream updates; sync overlay so the dropdown shows it.
  // Don't overwrite overlay if the user just set mode from the dropdown (avoid immediate revert).
  const rawValues = (rawStream as any)?.values;
  const streamMode = rawValues?.active_mode ?? rawValues?.active_agent;
  useEffect(() => {
    if (streamMode == null || typeof streamMode !== "string") return;
    const userJustSetMode = Date.now() - userSetModeAtRef.current < USER_MODE_PRIORITY_MS;
    if (userJustSetMode) return;
    const overlayMode = valuesOverlayRef.current?.active_mode ?? valuesOverlayRef.current?.active_agent;
    if (overlayMode === streamMode) return;
    valuesOverlayRef.current = { ...valuesOverlayRef.current, active_agent: streamMode, active_mode: streamMode };
    setValuesOverlay({ ...valuesOverlayRef.current });
  }, [streamMode]);

  // Issue 37: Update thread state (e.g. after Begin Enriching → handoff to Enrichment).
  // If values._appendMessages is present, merge those into overlay messages (so approval message appears in chat)
  // and do not send _appendMessages to the backend (backend already wrote them to thread state).
  const updateState = async (update: { values?: Record<string, unknown> }) => {
    if (!effectiveThreadId || !apiUrl || !update?.values) return;
    try {
      const values = update.values;
      const appendMessages = values._appendMessages as unknown[] | undefined;
      const rest = appendMessages
        ? Object.fromEntries(Object.entries(values).filter(([k]) => k !== "_appendMessages"))
        : values;
      if (appendMessages?.length && Array.isArray(appendMessages)) {
        const currentMessages = (rawStream as any)?.values?.messages ?? [];
        const merged = Array.isArray(currentMessages)
          ? [...currentMessages, ...appendMessages]
          : [...appendMessages];
        valuesOverlayRef.current = { ...valuesOverlayRef.current, ...rest, messages: merged };
      } else {
        valuesOverlayRef.current = { ...valuesOverlayRef.current, ...rest };
      }
      setValuesOverlay({ ...valuesOverlayRef.current });
      const headers: Record<string, string> = {};
      if (orgContext) headers["X-Organization-Context"] = orgContext;
      const client = createClient(apiUrl, apiKey ?? undefined, headers);
      await client.threads.updateState(effectiveThreadId, { values: rest });
    } catch (e) {
      console.error("[Stream] Failed to update state:", e);
    }
  };

  // After Apply, backend triggers a graph run; refetch thread state so we see new messages and active_mode.
  // Never overwrite with an older snapshot: if refetched has fewer messages than the stream, keep current messages
  // to avoid "bunch of messages inserted before mine" when user just sent a message and refetch returns stale state.
  // Handles 409 (thread busy) and connection resets with retries; 409 is expected while a run is in progress.
  const refetchThreadState = useCallback(async (attempt = 0) => {
    if (!effectiveThreadId || !apiUrl) return;
    const maxRetries = 1;
    const retryDelayMs = 3000;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Api-Key"] = apiKey;
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    const base = apiUrl.replace(/\/+$/, "");
    const url = `${base}/threads/${effectiveThreadId}/state`;
    try {
      const res = await fetch(url, { headers });
      if (res.status === 409 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return refetchThreadState(attempt + 1);
      }
      if (!res.ok) {
        if (res.status === 409) {
          // Thread busy is expected while a run is in progress; workbench will update when run finishes
          console.debug("[Stream] Thread busy; workbench view will update when the run finishes.");
        }
        if (res.status === 404) {
          // Don't clear threadId: map and decisions still work via backend (project resolved by thread_id).
          toast.error("Conversation state for this project isn’t available (e.g. after a server restart). You can still browse the map and decisions.", {
            duration: 8000,
            action: effectiveThreadId && apiUrl ? { label: "Reconnect to this project", onClick: () => reconnectProjectToNewThreadRef.current?.() } : undefined,
          });
          window.dispatchEvent(new CustomEvent("threadNotFound", { detail: { threadId: effectiveThreadId } }));
        }
        return;
      }
      const data = (await res.json()) as { values?: Record<string, unknown> };
      const values = data?.values;
      if (values && typeof values === "object") {
        const refetchedCount = Array.isArray(values.messages) ? values.messages.length : 0;
        const currentCount = streamMessageCountRef.current;
        const merged = { ...valuesOverlayRef.current, ...values };
        if (refetchedCount < currentCount && merged.messages) {
          delete merged.messages;
        }
        valuesOverlayRef.current = merged;
        setValuesOverlay({ ...valuesOverlayRef.current });
      }
    } catch (e) {
      const isNetworkError =
        e instanceof TypeError && e.message === "Failed to fetch" ||
        (e as Error)?.message?.includes("Connection") ||
        (e as Error)?.message?.includes("reset");
      if (isNetworkError && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return refetchThreadState(attempt + 1);
      }
      if (attempt > 0 || !isNetworkError) {
        console.warn("[Stream] refetchThreadState failed:", e);
      }
    }
  }, [effectiveThreadId, apiUrl, apiKey, orgContext, setThreadId]);

  // Broad refresh after a decision is applied (KG, Artifacts, Workflow may have changed).
  const [workbenchRefreshKey, setWorkbenchRefreshKey] = useState(0);
  const triggerWorkbenchRefresh = useCallback(() => {
    setWorkbenchRefreshKey((k) => k + 1);
  }, []);

  // Reconnect current project to a new LangGraph thread (e.g. after server restart). Same project = same KG/decisions from Redis/GitHub; only the conversation (thread) is new.
  // If no project is in the list (e.g. thread lost, projects.json reset), we still have the project selected (effectiveThreadId); backend re-registers that project_id → new thread so context is preserved.
  const reconnectProjectToNewThread = useCallback(async () => {
    if (!effectiveThreadId || !apiUrl) return;
    const base = apiUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Api-Key"] = apiKey;
    if (orgContext) headers["X-Organization-Context"] = orgContext;
    try {
      const listRes = await fetch(`${base}/kg/projects`, { headers });
      let project_id: string = effectiveThreadId;
      if (listRes.ok) {
        const list = (await listRes.json()) as Array<{ id?: string; thread_id?: string }>;
        const byThread = list?.find((p) => p.thread_id === effectiveThreadId);
        if (byThread?.id) project_id = byThread.id;
      }
      const newId = crypto.randomUUID();
      const createRes = await fetch(`${base}/threads`, {
        method: "POST",
        headers,
        body: JSON.stringify({ thread_id: newId }),
      });
      if (createRes.status !== 200 && createRes.status !== 201) {
        const fallback = await fetch(`${base}/threads`, { method: "POST", headers });
        if (!fallback.ok) {
          toast.error("Could not create new thread. Try “New Project” instead.");
          return;
        }
        const fallbackData = (await fallback.json()) as { thread_id?: string };
        if (fallbackData?.thread_id) {
          const reconnectRes = await fetch(`${base}/kg/projects/${encodeURIComponent(project_id)}/reconnect`, {
            method: "POST",
            headers,
            body: JSON.stringify({ thread_id: fallbackData.thread_id }),
          });
          if (reconnectRes.ok) {
            setThreadId(fallbackData.thread_id);
            triggerWorkbenchRefresh();
            toast.success("Project reconnected. You can continue in this project.");
            window.dispatchEvent(new CustomEvent("orgContextChanged"));
            return;
          }
        }
        toast.error("Could not reconnect project. Try “New Project” instead.");
        return;
      }
      const reconnectRes = await fetch(`${base}/kg/projects/${encodeURIComponent(project_id)}/reconnect`, {
        method: "POST",
        headers,
        body: JSON.stringify({ thread_id: newId }),
      });
      if (!reconnectRes.ok) {
        const err = await reconnectRes.json().catch(() => ({})) as { detail?: string };
        toast.error(err?.detail ?? "Failed to reconnect project. Try “New Project” instead.");
        return;
      }
      setThreadId(newId);
      triggerWorkbenchRefresh();
      toast.success("Project reconnected. You can continue in this project.");
      window.dispatchEvent(new CustomEvent("orgContextChanged"));
    } catch (e) {
      console.warn("[Stream] reconnectProjectToNewThread failed:", e);
      toast.error("Could not reconnect. Try “New Project” instead.");
    }
  }, [effectiveThreadId, apiUrl, apiKey, orgContext, setThreadId, triggerWorkbenchRefresh]);

  reconnectProjectToNewThreadRef.current = reconnectProjectToNewThread;

  // Create a new org/project branch (clone) + thread. Only for create flows (New Project, Create Organization). Selecting an existing org/project = work in that branch, no clone.
  const createNewThreadWithContext = useCallback(async (orgId?: string): Promise<string | null> => {
    const base = apiUrl?.replace(/\/+$/, "") ?? "";
    if (!base) return null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Api-Key"] = apiKey;
    const effectiveOrg = orgId ?? (typeof window !== "undefined" ? orgContext : null);
    if (effectiveOrg) headers["X-Organization-Context"] = effectiveOrg;
    try {
      const res = await fetch(`${base}/kg/threads/create-with-context`, { method: "POST", headers });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        toast.error(err?.detail ?? "Could not create new thread.");
        return null;
      }
      const data = (await res.json()) as { thread_id?: string; project_id?: string };
      const tid = data?.thread_id ?? null;
      if (tid) {
        setThreadId(tid);
        triggerWorkbenchRefresh();
        // When creating a thread for a specific org (e.g. after Create Organization), set that org as current without dispatching orgContextChanged (which would clear threadId).
        if (orgId && typeof window !== "undefined") {
          localStorage.setItem("reflexion_org_context", orgId);
          setOrgContext(orgId);
        }
      }
      return tid;
    } catch (e) {
      console.warn("[Stream] createNewThreadWithContext failed:", e);
      toast.error("Could not create new thread.");
      return null;
    }
  }, [apiUrl, apiKey, orgContext, setThreadId, triggerWorkbenchRefresh]);

  // Orphan proposals: from upload when proposals_injected=false; show in Decisions panel until approved/rejected.
  const [orphanProposals, setOrphanProposals] = useState<Array<{ id: string; raw: Record<string, unknown> }>>([]);
  const setOrphanProposalsFromUpload = useCallback(
    (response: { proposals?: unknown[]; proposals_injected?: boolean }) => {
      if (response.proposals_injected === false && Array.isArray(response.proposals) && response.proposals.length > 0) {
        const withIds = response.proposals.map((p: any, i: number) => ({
          id: `orphan-${p?.tool_call_id ?? `upload-${i}`}`,
          raw: p as Record<string, unknown>,
        }));
        setOrphanProposals((prev) => [...prev, ...withIds]);
      }
    },
    []
  );
  const removeOrphanProposal = useCallback((id: string) => {
    setOrphanProposals((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Dynamic Proxy Wrapper
  // This ensure ANY access to the context always gets the latest hook state 
  // but with forced null-safety for problematic fields.
  const streamValue = useMemo(() => {
    return new Proxy({} as any, {
      get(_, prop) {
        // Direct property overrides from Provider state
        if (prop === "setApiKey") return setApiKey;
        if (prop === "apiUrl") return apiUrl;
        if (prop === "setWorkbenchView") return setWorkbenchView;
        if (prop === "updateState") return updateState;
        if (prop === "refetchThreadState") return refetchThreadState;
        if (prop === "setActiveAgentDebug") return setActiveAgentDebug;
        if (prop === "workbenchRefreshKey") return workbenchRefreshKey;
        if (prop === "triggerWorkbenchRefresh") return triggerWorkbenchRefresh;
        if (prop === "createNewThreadWithContext") return createNewThreadWithContext;
        if (prop === "orphanProposals") return orphanProposals;
        if (prop === "setOrphanProposalsFromUpload") return setOrphanProposalsFromUpload;
        if (prop === "removeOrphanProposal") return removeOrphanProposal;
        if (prop === "threadId") return effectiveThreadId ?? (rawStream as any)?.[prop];

        // Safety check: if rawStream itself is null, provide safe defaults
        if (!rawStream) {
          if (prop === "messages") return [];
          if (prop === "values") return { messages: [], ui: [] };
          if (prop === "error") return null;
          if (prop === "isLoading") return false;
          if (prop === "stop" || prop === "submit") return () => { console.warn(`[Stream] Called ${String(prop)} while stream is null`); };
          return undefined;
        }

        // Dynamic property access from the raw hook state
        // We read from rawStream directly to ensure we have the absolute latest state
        let value = (rawStream as any)[prop];

        // Merge valuesOverlay so Mode and messages update. Prefer overlay when the user has set mode from the
        // dropdown recently (USER_MODE_PRIORITY_MS) so the selector doesn't revert on refetch or stream updates.
        if (prop === "values" && value && Object.keys(valuesOverlay).length > 0) {
          const merged = { ...value, ...valuesOverlay };
          const overlayHasMode =
            valuesOverlay.active_mode !== undefined || valuesOverlay.active_agent !== undefined;
          const userJustSetMode = Date.now() - userSetModeAtRef.current < USER_MODE_PRIORITY_MS;
          const useOverlayForMode = overlayHasMode && userJustSetMode;
          if (!useOverlayForMode) {
            const streamModeVal = (value as any).active_mode ?? (value as any).active_agent;
            if (streamModeVal != null) {
              merged.active_mode = streamModeVal;
              merged.active_agent = streamModeVal;
            }
          }
          value = merged;
        }
        // Prefer overlay messages only while stream hasn't caught up (e.g. after Apply we appended; once run adds more, use stream)
        if (prop === "messages") {
          const raw = (value ?? []) as any[];
          const overlay = valuesOverlay.messages as any[] | undefined;
          if (Array.isArray(overlay) && overlay.length > raw.length) return overlay;
          return value ?? [];
        }

        // Safety Fallbacks
        if (prop === "values") return value ?? { messages: [], ui: [] };
        if (prop === "error") return value ?? null;
        if (prop === "isLoading") return value ?? false;

        // Methods need to be bound or returned as-is
        if (typeof value === "function") return value.bind(rawStream);

        return value;
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setters/updateState stable, omitting avoids re-create
  }, [rawStream, apiKey, apiUrl, effectiveThreadId, orgContext, valuesOverlay, workbenchRefreshKey, triggerWorkbenchRefresh, createNewThreadWithContext, refetchThreadState, orphanProposals, setOrphanProposalsFromUpload, removeOrphanProposal]);

  useEffect(() => {
    // For relative paths (like /api), check via /api/info endpoint
    // For absolute URLs, check directly
    const checkUrl = apiUrl && !apiUrl.startsWith("/") ? apiUrl : "/api";
    checkGraphStatus(checkUrl, apiKey).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              {apiUrl && !apiUrl.startsWith("/") 
                ? `Unable to connect to ${apiUrl}. Please ensure the backend is running and LANGGRAPH_API_URL is correctly configured.`
                : "Unable to connect to the backend. Please check that the backend is running and that LANGGRAPH_API_URL is correctly configured in the Next.js API routes."}
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl]);

  return (
    <StreamContext.Provider value={streamValue}>
      {children}
    </StreamContext.Provider>
  );
};

// Default values for the form
// In production, NEXT_PUBLIC_API_URL should be set to the frontend's own API proxy URL
// (e.g., https://reflexion-ui-staging.up.railway.app/api)
// For local development, the LangGraph SDK connects through Next.js API proxy at /api
// which then forwards to the backend at localhost:8080
const DEFAULT_API_URL = typeof window !== "undefined" && window.location.origin 
  ? `${window.location.origin}/api` 
  : "/api";
const DEFAULT_ASSISTANT_ID = "reflexion";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;

  // Use URL params only for overrides (not defaults)
  // Don't sync defaults to URL - only use query params when explicitly set and different from env vars
  const [apiUrlParam, setApiUrlParam] = useQueryState("apiUrl");
  const [assistantIdParam, setAssistantIdParam] = useQueryState("assistantId");

  // Determine actual values: URL param > env var > default
  const apiUrl = apiUrlParam || envApiUrl || DEFAULT_API_URL;
  const assistantId = assistantIdParam || envAssistantId || DEFAULT_ASSISTANT_ID;

  // For API key, use localStorage with env var fallback
  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  // Clean up URL params if they match defaults/env vars (to keep URLs clean)
  useEffect(() => {
    // Remove query params that match defaults/env vars to keep URLs clean
    if (apiUrlParam) {
      if (apiUrlParam === DEFAULT_API_URL || apiUrlParam === envApiUrl) {
        setApiUrlParam(null, { history: 'replace', shallow: false });
      }
    }
    if (assistantIdParam) {
      if (assistantIdParam === DEFAULT_ASSISTANT_ID || assistantIdParam === envAssistantId) {
        setAssistantIdParam(null, { history: 'replace', shallow: false });
      }
    }
  }, [apiUrlParam, assistantIdParam, envApiUrl, envAssistantId, setApiUrlParam, setAssistantIdParam]);

  // Determine final values to use, prioritizing URL params then env vars, then defaults
  // Note: These are computed but not currently used - apiUrl and assistantId from context already have defaults
  const _finalApiUrl = apiUrl || envApiUrl || DEFAULT_API_URL;
  const _finalAssistantId = assistantId || envAssistantId || DEFAULT_ASSISTANT_ID;

  // Sync Session Token from NextAuth
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user?.idToken) {
      console.log("[StreamProvider] Syncing API Key from Google ID Token");
      // Use the ID token from Google Auth - MUST persist to localStorage via setApiKey wrapper
      setApiKey(session.user.idToken);
    }
  }, [session]);

  // Setup form has been removed - configuration is now handled via environment variables
  // or URL parameters. Defaults are automatically applied if neither is present.

  return (
    <StreamSession
      apiKey={apiKey}
      apiUrl={apiUrl}
      assistantId={assistantId}
      setApiKey={setApiKey}
    >
      {children}
    </StreamSession>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
