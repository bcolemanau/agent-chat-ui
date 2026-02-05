"use client";

import { v4 as uuidv4 } from "uuid";
import { ReactNode, useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useBranding } from "@/providers/Branding";
import { withThreadSpan } from "@/lib/otel-client";
import { Button } from "../ui/button";
import { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import { LangGraphLogoSVG } from "../icons/langgraph";
import { TooltipIconButton } from "./tooltip-icon-button";
import {
  ArrowDown,
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  XIcon,
  Plus,
  SquarePen,
  LayoutDashboard,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import ThreadHistory from "./history";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { useFileUpload } from "@/hooks/use-file-upload";
import { ContentBlocksPreview } from "./ContentBlocksPreview";
import {
  useArtifactOpen,
  ArtifactContent,
  ArtifactTitle,
  useArtifactContext,
} from "./artifact";
import { ThemeToggle } from "../theme-toggle";
import { FolderOpen } from "lucide-react";

import { UserMenu } from "./user-menu";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%", maxHeight: "100%", overflow: "hidden", display: "flex", flexDirection: "column", ...props.style }}
      className={props.className}
    >
      <div
        ref={context.contentRef}
        className={props.contentClassName}
        style={{ flex: "1 1 auto", overflowY: "auto", minHeight: 0 }}
      >
        {props.content}
      </div>

      <div style={{ flexShrink: 0 }}>
        {props.footer}
      </div>
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="h-4 w-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

interface ThreadProps {
  embedded?: boolean;
  className?: string;
  hideArtifacts?: boolean;
}

export function Thread({ embedded, className, hideArtifacts }: ThreadProps = {}) {
  const { branding } = useBranding();
  const [artifactContext, setArtifactContext] = useArtifactContext();
  const [artifactOpen, closeArtifact] = useArtifactOpen();

  const [threadId, _setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [hideToolCalls, setHideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );
  const [input, setInput] = useState("");
  const stream = useStreamContext();
  const {
    messages = [],
    isLoading,
    setApiKey: _setApiKey,
    apiUrl = "http://localhost:8080",
  } = stream;
  // Use stream's threadId when URL hasn't updated yet (avoids enrichment going to "default" on new threads)
  const effectiveThreadIdForUpload = (stream as { threadId?: string | null })?.threadId ?? threadId;
  const {
    contentBlocks,
    setContentBlocks,
    uploadedDocuments,
    uploading,
    folderUploading,
    folderUploadProgress,
    handleFileUpload,
    uploadFolder,
    dropRef,
    removeBlock,
    removeDocument: _removeDocument,
    resetBlocks: _resetBlocks,
    dragOver,
    handlePaste,
  } = useFileUpload({ apiUrl, threadId: effectiveThreadIdForUpload });
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [processedArtifactIds, setProcessedArtifactIds] = useState<Set<string>>(new Set());
  
  // Use URL query params for pending artifacts (shared with workbench)
  const [_pendingArtifactIds, _setPendingArtifactIds] = useQueryState<string[]>("pendingArtifacts", {
    parse: (value) => value ? value.split(",").filter(Boolean) : [],
    serialize: (value) => value && value.length > 0 ? value.join(",") : "",
    defaultValue: []
  });

  // Trigger enrichment approval when new documents are uploaded (Issue #12)
  // Backend injects proposals into thread state; refetch so Decisions panel sees them without a full page refresh.
  // When new uploads are detected, also submit a message so the project configurator is signaled that the file(s) are there.
  useEffect(() => {
    if (uploadedDocuments.length === 0) return;

    const newArtifactIds = uploadedDocuments
      .map((d) => d.artifact_id || d.document_id)
      .filter((id): id is string => !!id && !processedArtifactIds.has(id));

    if (newArtifactIds.length > 0) {
      // Mark as processed
      setProcessedArtifactIds((prev) => {
        const updated = new Set(prev);
        newArtifactIds.forEach((id) => updated.add(id));
        return updated;
      });

      // Switch to decisions view so user sees new proposals after refetch
      stream.setWorkbenchView("decisions").catch(console.error);

      // Signal to project configurator that documents are there: submit a minimal message with pending_document_ids
      const n = uploadedDocuments.length;
      const uploadMessage: Message = {
        id: uuidv4(),
        type: "human",
        content: [
          {
            type: "text",
            text: n === 1
              ? "I've uploaded a document."
              : `I've uploaded ${n} documents.`,
          },
        ],
      };
      const orgContext = typeof window !== "undefined" ? localStorage.getItem("reflexion_org_context") : null;
      const context: Record<string, unknown> = {
        ...(orgContext ? { user_id: orgContext } : {}),
        pending_document_ids: uploadedDocuments.map((d) => d.document_id),
      };
      (stream as any).submit(
        { messages: [uploadMessage], context },
        {
          streamMode: ["values"],
          streamSubgraphs: true,
          streamResumable: true,
        }
      );

      // Refetch thread state so stream messages include backend-injected proposals (enrichment, link)
      const refetch = (stream as any).refetchThreadState;
      const triggerRefresh = (stream as any).triggerWorkbenchRefresh;
      if (typeof refetch === "function") {
        const t = setTimeout(() => {
          refetch().catch((e: unknown) => console.warn("[Thread] refetch after upload failed:", e));
          if (typeof triggerRefresh === "function") triggerRefresh();
        }, 600);
        return () => clearTimeout(t);
      }
    }
  }, [uploadedDocuments, processedArtifactIds, stream]);

  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const safeMessages = useMemo(() => messages ?? [], [messages]);

  const lastError = useRef<string | undefined>(undefined);

  const setThreadId = (id: string | null) => {
    _setThreadId(id);

    // close artifact and reset artifact context
    closeArtifact();
    setArtifactContext({});
  };

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    try {
      const message = (stream?.error as any)?.message;
      if (!message || lastError.current === message) {
        // Message has already been logged. do not modify ref, return early.
        return;
      }

      // Message is defined, and it has not been logged yet. Save it, and send the error
      lastError.current = message;
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  const prevMessageLength = useRef(0);
  // safeMessages is stable via useMemo; exhaustive-deps prefers listing it
  useEffect(() => {
    if (
      safeMessages.length !== prevMessageLength.current &&
      safeMessages?.length &&
      safeMessages[safeMessages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = safeMessages.length;
  }, [safeMessages]);

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("[Thread] handleFolderUpload called");
    const files = e.target.files;
    if (!files || files.length === 0) {
      console.log("[Thread] No files selected");
      return;
    }

    console.log("[Thread] Files selected:", files.length, Array.from(files).map(f => `${f.name} (${f.type})`));
    const fileArray = Array.from(files);
    const zipFile = fileArray.find((f) => f.name.endsWith(".zip"));
    const otherFiles = fileArray.filter((f) => !f.name.endsWith(".zip"));

    console.log("[Thread] Calling uploadFolder - zipFile:", zipFile?.name, "otherFiles:", otherFiles.length);
    const result = await uploadFolder(
      otherFiles.length > 0 ? otherFiles : null,
      zipFile || null
    );
    console.log("[Thread] uploadFolder result:", result);

    if (result && result.successful > 0) {
      // Refetch thread state so Decisions panel sees backend-injected proposals without full page refresh
      const refetch = (stream as any).refetchThreadState;
      if (typeof refetch === "function") {
        setTimeout(() => refetch().catch((e: unknown) => console.warn("[Thread] refetch after folder upload failed:", e)), 600);
      }
      (stream as any).triggerWorkbenchRefresh?.();
      stream.setWorkbenchView("decisions").catch(console.error);
    }

    e.target.value = "";
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((input.trim().length === 0 && contentBlocks.length === 0 && uploadedDocuments.length === 0) || isLoading || uploading || folderUploading)
      return;
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(input.trim().length > 0 ? [{ type: "text", text: input }] : []),
        ...contentBlocks,
      ] as Message["content"],
    };

    const toolMessages = ensureToolCallsHaveResponses(safeMessages);

    const orgContext = typeof window !== 'undefined' ? localStorage.getItem('reflexion_org_context') : null;
    const context = {
      ...(Object.keys(artifactContext).length > 0 ? artifactContext : {}),
      ...(orgContext ? { user_id: orgContext } : {}),
      // Include uploaded document IDs for Hydration agent to process
      ...(uploadedDocuments.length > 0 ? { 
        pending_document_ids: uploadedDocuments.map(d => d.document_id) 
      } : {})
    };

    // Do NOT send active_agent/active_mode with message submit. The graph must use the checkpoint state
    // so that after "Begin Enriching" the approval run can set active_mode to project_configurator; if we sent
    // the current overlay (still "supervisor" from Apply response until refetch), we would overwrite
    // the checkpoint and the next run would route to supervisor instead of project_configurator.
    console.log("[Thread] Submitting new human message:", {
      content: newHumanMessage.content,
      context,
      toolMessagesCount: toolMessages.length,
      uploadedDocuments: uploadedDocuments.length
    });

    // Trace message submission, especially for new threads
    const isNewThread = !threadId;
    withThreadSpan(
      "message.submit",
      {
        "thread.id": threadId || "new",
        "thread.is_new": isNewThread,
        "message.has_text": input.trim().length > 0,
        "message.content_blocks": contentBlocks.length,
        "message.uploaded_documents": uploadedDocuments.length,
        "message.tool_messages": toolMessages.length,
        "api.url": stream.apiUrl || "unknown",
      },
      async () => {
        (stream as any).submit(
          { messages: [...toolMessages, newHumanMessage], context },
          {
            streamMode: ["values"],
            streamSubgraphs: true,
            streamResumable: true,
            optimisticValues: (prev: any) => ({
              ...(prev || {}),
              context,
              messages: [
                ...((prev?.messages || [])),
                ...toolMessages,
                newHumanMessage,
              ],
            }),
          },
        );
      }
    ).catch((err) => {
      console.error("[OTEL] Failed to trace message submission:", err);
    });

    setInput("");
    setContentBlocks([]);
    // Note: uploadedDocuments are kept in state so they can be referenced by the agent
    // They will be cleared when the thread is reset or when explicitly removed
  };



  const handleRegenerate = (
    parentCheckpoint: Checkpoint | null | undefined,
  ) => {
    prevMessageLength.current = prevMessageLength.current - 1;
    setFirstTokenReceived(false);
    (stream as any).submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ["values"],
      streamSubgraphs: true,
      streamResumable: true,
    });
  };

  const chatStarted = !!threadId || !!safeMessages.length;
  const hasNoAIOrToolMessages = !safeMessages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  return (
    <div className={cn(
      "flex w-full overflow-hidden",
      embedded ? "h-full max-h-full" : "h-screen",
      className
    )} style={embedded ? { height: '100%', maxHeight: '100%' } : undefined}>
      <div className="relative hidden lg:flex">
        <motion.div
          className="absolute z-20 h-full overflow-hidden border-r bg-background"
          style={{ width: 300 }}
          animate={
            isLargeScreen
              ? { x: chatHistoryOpen ? 0 : -300 }
              : { x: chatHistoryOpen ? 0 : -300 }
          }
          initial={{ x: -300 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div
            className="relative h-full"
            style={{ width: 300 }}
          >
            <ThreadHistory />
          </div>
        </motion.div>
      </div>

      <div
        className={cn(
          "grid w-full grid-cols-[1fr_0fr] transition-all duration-500",
          artifactOpen && "grid-cols-[3fr_2fr]",
        )}
      >
        <motion.div
            className={cn(
            "relative flex min-w-0 flex-1 flex-col overflow-hidden min-h-0",
            !chatStarted && "grid-rows-[1fr]",
          )}
          layout={isLargeScreen}
          animate={{
            marginLeft: chatHistoryOpen ? (isLargeScreen ? 300 : 0) : 0,
            width: chatHistoryOpen
              ? isLargeScreen
                ? "calc(100% - 300px)"
                : "100%"
              : "100%",
          }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          {!chatStarted && (
            <div className="absolute top-0 left-0 z-10 flex w-full items-center justify-between gap-3 p-2 pl-4">
              <div>
                {(!chatHistoryOpen || !isLargeScreen) && (
                  <Button
                    className="hover:bg-gray-100"
                    variant="ghost"
                    onClick={() => setChatHistoryOpen((p) => !p)}
                  >
                    {chatHistoryOpen ? (
                      <PanelRightOpen className="size-5" />
                    ) : (
                      <PanelRightClose className="size-5" />
                    )}
                  </Button>
                )}
              </div>
              <div className="absolute top-2 right-4 flex items-center gap-4">
                {!embedded && (
                  <>
                    <ThemeToggle />
                    <UserMenu />
                    <TooltipIconButton
                      size="lg"
                      className="p-4"
                      tooltip="Open Workbench"
                      variant="ghost"
                      onClick={() => window.location.href = "/workbench/map"}
                    >
                      <LayoutDashboard className="size-5" />
                    </TooltipIconButton>
                  </>
                )}

              </div>
            </div>
          )}
          {chatStarted && (
            <div className="relative z-10 flex items-center justify-between gap-3 p-2">
              <div className="relative flex items-center justify-start gap-2">
                <div className="absolute left-0 z-10">
                  {(!chatHistoryOpen || !isLargeScreen) && (
                    <Button
                      className="hover:bg-gray-100"
                      variant="ghost"
                      onClick={() => setChatHistoryOpen((p) => !p)}
                    >
                      {chatHistoryOpen ? (
                        <PanelRightOpen className="size-5" />
                      ) : (
                        <PanelRightClose className="size-5" />
                      )}
                    </Button>
                  )}
                </div>
                <motion.button
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => setThreadId(null)}
                  animate={{
                    marginLeft: !chatHistoryOpen ? 48 : 0,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  <LangGraphLogoSVG
                    width={32}
                    height={32}
                    className="text-primary"
                  />
                  <span className="text-xl font-semibold tracking-tight">
                    {branding.brand_title}
                  </span>
                </motion.button>
              </div>

              <div className="flex items-center gap-4">
                {!embedded && (
                  <div className="flex items-center gap-4">
                    <ThemeToggle />
                    <UserMenu />
                    <TooltipIconButton
                      size="lg"
                      className="p-4"
                      tooltip="Open Workbench"
                      variant="ghost"
                      onClick={() => window.location.href = "/workbench/map"}
                    >
                      <LayoutDashboard className="size-5" />
                    </TooltipIconButton>
                  </div>
                )}

                <TooltipIconButton
                  size="lg"
                  className="p-4"
                  tooltip="New thread"
                  variant="ghost"
                  onClick={() => setThreadId(null)}
                >
                  <SquarePen className="size-5" />
                </TooltipIconButton>
              </div>

              <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
            </div>
          )}

          <StickToBottom className="relative flex-1 overflow-hidden min-h-0" style={{ maxHeight: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <StickyToBottomContent
              className={cn(
                "px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
                !chatStarted && "mt-[25vh]",
              )}
              contentClassName="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full"
              style={{ maxHeight: '100%', height: '100%', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}
              content={
                <>
                  {safeMessages
                    .filter((m) => {
                      const hasContentString = typeof m.content === 'string' && m.content.length > 0;
                      const hasContentArray = Array.isArray(m.content) && m.content.length > 0;
                      const hasStandardToolCalls = "tool_calls" in m && Array.isArray(m.tool_calls) && (m.tool_calls as any[]).length > 0;
                      const hasAnthropicToolCalls = Array.isArray(m.content) && m.content.some(c => (c as any).type === "tool_use");

                      return (
                        m?.id && !m.id.startsWith(DO_NOT_RENDER_ID_PREFIX) &&
                        (m as any).type !== "ui" &&
                        m.type !== "tool" &&
                        (m.type !== "ai" || hasContentString || hasContentArray || hasStandardToolCalls || hasAnthropicToolCalls)
                      );
                    })
                    .map((message, index) =>
                      message.type === "human" ? (
                        <HumanMessage
                          key={message.id || `${message.type}-${index}`}
                          message={message}
                          isLoading={isLoading}
                        />
                      ) : (
                        <AssistantMessage
                          key={message.id || `${message.type}-${index}`}
                          message={message}
                          isLoading={isLoading}
                          handleRegenerate={handleRegenerate}
                        />
                      ),
                    )}
                  {hasNoAIOrToolMessages && !!stream.interrupt && (
                    <AssistantMessage
                      key="interrupt-msg"
                      message={undefined}
                      isLoading={isLoading}
                      handleRegenerate={handleRegenerate}
                    />
                  )}
                  {isLoading && !firstTokenReceived && (
                    <AssistantMessageLoading />
                  )}
                </>
              }
              footer={
                <div className="flex flex-col items-center gap-8 bg-background z-10 shrink-0 w-full" style={{ flexShrink: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
                  {!chatStarted && (
                    <div className="flex items-center gap-3">
                      <LangGraphLogoSVG className="h-8 flex-shrink-0 text-primary" />
                      <h1 className="text-2xl font-semibold tracking-tight">
                        {branding.brand_title}
                      </h1>
                    </div>
                  )}

                  <ScrollToBottom className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2" />

                  <div
                    ref={dropRef}
                    className={cn(
                      "bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs transition-all",
                      dragOver
                        ? "border-primary border-2 border-dotted"
                        : "border border-solid",
                    )}
                    style={{ maxWidth: 'calc(100% - 2rem)', boxSizing: 'border-box' }}
                  >
                    <form
                      onSubmit={handleSubmit}
                      className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2"
                    >
                      <ContentBlocksPreview
                        blocks={contentBlocks}
                        onRemove={removeBlock}
                      />
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.metaKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            const el = e.target as HTMLElement | undefined;
                            const form = el?.closest("form");
                            form?.requestSubmit();
                          }
                        }}
                        placeholder="Type your message..."
                        className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                      />

                      <div className="flex items-center gap-6 p-2 pt-4">
                        <div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="render-tool-calls"
                              checked={hideToolCalls ?? false}
                              onCheckedChange={setHideToolCalls}
                            />
                            <Label
                              htmlFor="render-tool-calls"
                              className="text-sm text-gray-600"
                            >
                              Hide Tool Calls
                            </Label>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Label
                            htmlFor="file-input"
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Plus className="size-5 text-gray-600" />
                            <span className="text-sm text-gray-600">
                              Upload File
                            </span>
                          </Label>
                          <input
                            id="file-input"
                            type="file"
                            onChange={handleFileUpload}
                            multiple
                            accept="*/*"
                            className="hidden"
                          />
                          <Label
                            htmlFor="folder-input"
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <FolderOpen className="size-5 text-gray-600" />
                            <span className="text-sm text-gray-600">
                              Upload Folder (ZIP)
                            </span>
                          </Label>
                          <input
                            id="folder-input"
                            type="file"
                            onChange={handleFolderUpload}
                            accept=".zip,application/zip"
                            className="hidden"
                          />
                        </div>
                        {folderUploading && folderUploadProgress && (
                          <div className="text-xs text-muted-foreground">
                            Uploading: {folderUploadProgress.completed} / {folderUploadProgress.total}
                            {folderUploadProgress.failed > 0 && ` (${folderUploadProgress.failed} failed)`}
                          </div>
                        )}
                        {isLoading ? (
                          <Button
                            key="stop"
                            onClick={() => stream.stop()}
                            className="ml-auto"
                          >
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            className="ml-auto shadow-md transition-all"
                            disabled={
                              isLoading ||
                              uploading ||
                              folderUploading ||
                              (!input.trim() && contentBlocks.length === 0 && uploadedDocuments.length === 0)
                            }
                          >
                            Send
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              }
            />
          </StickToBottom>
        </motion.div>
        {(!embedded && !hideArtifacts) && (
          <div className="relative flex flex-col border-l">
            <div className="absolute inset-0 flex min-w-[30vw] flex-col">
              <div className="grid grid-cols-[1fr_auto] border-b p-4">
                <ArtifactTitle className="truncate overflow-hidden" />
                <button
                  onClick={closeArtifact}
                  className="cursor-pointer"
                >
                  <XIcon className="size-5" />
                </button>
              </div>
              <ArtifactContent className="relative flex-grow" />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
