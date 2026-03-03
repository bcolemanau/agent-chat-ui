"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChromeRewriter, type RewriterPreset } from "@/hooks/use-chrome-rewriter";
import { Loader2, PenLine, ChevronDown } from "lucide-react";

const PRESETS: { id: RewriterPreset; label: string }[] = [
  { id: "improve", label: "Improve" },
  { id: "more-formal", label: "More formal" },
  { id: "more-casual", label: "More casual" },
  { id: "shorter", label: "Shorter" },
  { id: "longer", label: "Longer" },
];

interface ChromeRewriterToolbarProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Toolbar that rewrites the given value with Chrome Rewriter API and calls onChange with the result. Shown only when API is available. */
export function ChromeRewriterToolbar({
  value,
  onChange,
  disabled,
  className,
}: ChromeRewriterToolbarProps) {
  const { isSupported, availability, rewrite, isRewriting, checkAvailability } =
    useChromeRewriter();

  if (!isSupported || availability === "unavailable") return null;

  const handleRewrite = async (preset: RewriterPreset) => {
    const result = await rewrite(value, preset);
    if (result != null) onChange(result);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={className}
          disabled={disabled || isRewriting || !value.trim()}
          onClick={() => availability === "unknown" && checkAvailability()}
        >
          {isRewriting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PenLine className="size-4" />
          )}
          <span className="sr-only sm:not-sr-only sm:ml-1.5">
            {isRewriting ? "Rewriting…" : "Rewrite"}
          </span>
          <ChevronDown className="size-3.5 ml-0.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PRESETS.map(({ id, label }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => handleRewrite(id)}
            disabled={isRewriting || !value.trim()}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Button that rewrites the currently focused input/textarea (e.g. CopilotKit chat input). Use when you don't control value/onChange. */
export function RewriteFocusedFieldButton({ className }: { className?: string }) {
  const { isSupported, availability, rewrite, isRewriting, checkAvailability } =
    useChromeRewriter();

  if (!isSupported || availability === "unavailable") return null;

  const handleRewriteFocused = async (preset: RewriterPreset = "improve") => {
    const el = document.activeElement;
    if (!el) return;
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    if (input.tagName !== "INPUT" && input.tagName !== "TEXTAREA") return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const hasSelection =
      "selectionStart" in input && start !== end;
    const text = hasSelection ? input.value.slice(start, end) : input.value;
    if (!text.trim()) return;
    const result = await rewrite(text, preset);
    if (result == null) return;
    if (hasSelection && "setSelectionRange" in input) {
      const before = input.value.slice(0, start);
      const after = input.value.slice(end);
      input.value = before + result + after;
      input.setSelectionRange(before.length, before.length + result.length);
    } else {
      input.value = result;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={className}
          disabled={isRewriting}
          onClick={() => availability === "unknown" && checkAvailability()}
        >
          {isRewriting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PenLine className="size-4" />
          )}
          <span className="sr-only sm:not-sr-only sm:ml-1.5">
            {isRewriting ? "Rewriting…" : "Rewrite input"}
          </span>
          <ChevronDown className="size-3.5 ml-0.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PRESETS.map(({ id, label }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => handleRewriteFocused(id)}
            disabled={isRewriting}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
