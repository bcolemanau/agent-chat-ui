import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { getApiKey } from "@/lib/api-key";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import { useBranding } from "./Branding";
import { useSession } from "next-auth/react";

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
  active_agent?: "supervisor" | "hydrator";
  visualization_html?: string;
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
  apiUrl: string;
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
    const res = await fetch(`${apiUrl}/info`, {
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
  const { getThreads, setThreads } = useThreads();
  const rawStream = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId: assistantId || "reflexion",
    threadId: threadId || undefined,
    fetchStateHistory: !!threadId,
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
    },
    onThreadId: (id) => {
      console.log("[Stream] Thread ID changed to:", id);
      setThreadId(id);
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
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

  // Dynamic Proxy Wrapper
  // This ensure ANY access to the context always gets the latest hook state 
  // but with forced null-safety for problematic fields.
  const streamValue = useMemo(() => {
    return new Proxy({} as any, {
      get(_, prop) {
        // Direct property overrides from Provider state
        if (prop === "setApiKey") return setApiKey;
        if (prop === "apiUrl") return apiUrl;

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
        const value = (rawStream as any)[prop];

        // Safety Fallbacks
        if (prop === "messages") return value ?? [];
        if (prop === "values") return value ?? { messages: [], ui: [] };
        if (prop === "error") return value ?? null;
        if (prop === "isLoading") return value ?? false;

        // Methods need to be bound or returned as-is
        if (typeof value === "function") return value.bind(rawStream);

        return value;
      }
    });
  }, [rawStream, apiKey, apiUrl]);

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
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
// Default values for the local stack (Proxy at 8080)
const DEFAULT_API_URL = "http://localhost:8080";
const DEFAULT_ASSISTANT_ID = "reflexion";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });

  // For API key, use localStorage with env var fallback
  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  // Determine final values to use, prioritizing URL params then env vars
  const finalApiUrl = apiUrl || envApiUrl;
  const finalAssistantId = assistantId || envAssistantId;
  const { branding } = useBranding();

  // Sync Session Token from NextAuth
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user?.idToken) {
      console.log("[StreamProvider] Syncing API Key from Google ID Token");
      // Use the ID token from Google Auth
      _setApiKey(session.user.idToken);
    }
  }, [session]);

  // Show the form if we: don't have an API URL, or don't have an assistant ID
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <LangGraphLogoSVG className="h-7 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">
                {branding.brand_title}
              </h1>
            </div>
            <p className="text-muted-foreground">
              Welcome to {branding.brand_title}! Before you get started, you need to enter
              the URL of the deployment and the assistant / graph ID.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;
              const apiKey = formData.get("apiKey") as string;

              setApiUrl(apiUrl);
              setApiKey(apiKey);
              setAssistantId(assistantId);

              form.reset();
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assistantId">
                Assistant / Graph ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the ID of the graph (can be the graph name), or
                assistant to fetch threads from, and invoke when actions are
                taken.
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={assistantId || DEFAULT_ASSISTANT_ID}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">LangSmith API Key</Label>
              <p className="text-muted-foreground text-sm">
                This is <strong>NOT</strong> required if using a local LangGraph
                server. This value is stored in your browser's local storage and
                is only used to authenticate requests sent to your LangGraph
                server.
              </p>
              <PasswordInput
                id="apiKey"
                name="apiKey"
                defaultValue={apiKey ?? ""}
                className="bg-background"
                placeholder="lsv2_pt_..."
              />
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="lg"
              >
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

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
