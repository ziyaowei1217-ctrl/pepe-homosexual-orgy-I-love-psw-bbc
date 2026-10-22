"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { forgetOtherAccounts, useAssistantEnabled } from "@/lib/assistant/client";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";

/** Header button for the AI assistant. Renders nothing unless the server has an Anthropic key. */
export function AssistantLauncher() {
  const token = useAuthSessionToken();
  const enabled = useAssistantEnabled();
  const [open, setOpen] = useState(false);
  useEffect(() => forgetOtherAccounts(token), [token]);
  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开 AI 助手"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink md:px-4"
      >
        <Sparkles className="size-[18px]" aria-hidden="true" />
        <span className="hidden md:inline">AI 助手</span>
      </button>
      {/* In the body, not the header: the sticky header's stacking context would put the panel under the tab bar. */}
      {open ? createPortal(<AssistantPanel token={token} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}
