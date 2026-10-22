"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { readSafeErrorCode } from "../api";
import { productErrorForStatus, toProductApiError } from "../product-errors";
import {
  assistantLimits,
  type AssistantChatRequest,
  type AssistantContext,
  type AssistantDraftEvent,
  type AssistantEvent,
  type AssistantListingsEvent,
  type AssistantTurn,
  type ListingCopy,
  type ListingCopyRequest
} from "./protocol";

// Browser side of the assistant. Conversations and drafts stay in memory only (never in browser storage):
// they survive client-side navigation and are dropped on reload, like the inbox's pending messages.

let statusRequest: Promise<boolean> | undefined;

function fetchAssistantEnabled() {
  statusRequest ??= fetch("/api/assistant", { cache: "no-store" })
    .then(async (response) => response.ok && (await response.json())?.enabled === true)
    .catch(() => {
      statusRequest = undefined;
      return false;
    });
  return statusRequest;
}

/** False until the server confirms the assistant is configured, so nothing renders without a key. */
export function useAssistantEnabled(wanted = true) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void fetchAssistantEnabled().then((value) => { if (live) setEnabled(value); });
    return () => { live = false; };
  }, [wanted]);
  return wanted && enabled;
}

type Store<T> = { get: () => T; set: (value: T) => void; subscribe: (listener: () => void) => () => void };

function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export type AssistantAnswer = {
  id: string;
  role: "assistant";
  text: string;
  status: string | null;
  listings: AssistantListingsEvent[];
  drafts: AssistantDraftEvent[];
  error: string | null;
  pending: boolean;
};
export type AssistantItem = { id: string; role: "user"; text: string } | AssistantAnswer;

type Conversation = { token: string | null; items: AssistantItem[]; running: AbortController | null };

const conversation = createStore<Conversation>({ token: null, items: [], running: null });
let nextId = 0;

/** The conversation of this signed-in session; another account sees an empty one. */
export function useAssistantConversation(token: string | null) {
  const snapshot = useSyncExternalStore(conversation.subscribe, conversation.get, conversation.get);
  return snapshot.token === token ? { items: snapshot.items, running: Boolean(snapshot.running) } : { items: [], running: false };
}

export function stopAssistant() {
  conversation.get().running?.abort();
}

export function clearAssistantConversation() {
  stopAssistant();
  conversation.set({ token: null, items: [], running: null });
}

export async function askAssistant(token: string, text: string, context: Omit<AssistantContext, "shownListingIds">) {
  stopAssistant();
  const current = conversation.get();
  const previous = current.token === token ? current.items : [];
  const answerId = `a${nextId++}`;
  const running = new AbortController();
  const user: AssistantItem = { id: `u${nextId++}`, role: "user", text };
  const answer: AssistantAnswer = { id: answerId, role: "assistant", text: "", status: null, listings: [], drafts: [], error: null, pending: true };
  conversation.set({ token, items: [...previous, user, answer], running });

  const patch = (change: (item: AssistantAnswer) => Partial<AssistantAnswer>) => {
    const state = conversation.get();
    if (state.token !== token) return;
    conversation.set({ ...state, items: state.items.map((item) => (item.id === answerId && item.role === "assistant" ? { ...item, ...change(item) } : item)) });
  };
  // A declined or broken answer is dropped whole: partial text is not a reliable answer.
  const fail = (message: string) => patch(() => ({ text: "", listings: [], drafts: [], error: message }));

  const body: AssistantChatRequest = {
    messages: chatHistory(previous, text),
    context: { ...context, shownListingIds: lastShownListingIds(previous) }
  };
  try {
    await streamAssistantChat(token, body, running.signal, (event) => {
      if (event.type === "text") patch((item) => ({ text: item.text + event.text, status: null }));
      else if (event.type === "status") patch(() => ({ status: event.label }));
      else if (event.type === "listings") patch((item) => ({ listings: [...item.listings, event], status: null }));
      else if (event.type === "draft") patch((item) => ({ drafts: [...item.drafts, event], status: null }));
      else if (event.type === "error") fail(productErrorForStatus(500, event.code).message);
    });
  } catch (error) {
    if (!running.signal.aborted) fail(toProductApiError(error).message);
  } finally {
    patch(() => ({ pending: false, status: null }));
    const state = conversation.get();
    if (state.running === running) conversation.set({ ...state, running: null });
  }
}

/** Completed question-and-answer pairs plus the new question, newest last. */
function chatHistory(items: AssistantItem[], question: string): AssistantTurn[] {
  const turns: AssistantTurn[] = [];
  items.forEach((item, index) => {
    const answer = items[index + 1];
    if (item.role !== "user" || answer?.role !== "assistant" || answer.pending || answer.error || !answer.text.trim()) return;
    turns.push({ role: "user", content: item.text }, { role: "assistant", content: answer.text.trim().slice(0, assistantLimits.messageChars) });
  });
  return [...turns.slice(-(assistantLimits.messages - 1)), { role: "user", content: question }];
}

function lastShownListingIds(items: AssistantItem[]) {
  const answer = items.findLast((item): item is AssistantAnswer => item.role === "assistant" && !item.error);
  const ids = answer?.listings.flatMap((event) => event.listings.map((listing) => listing.id)) ?? [];
  return [...new Set(ids)].slice(0, assistantLimits.shownListings);
}

async function streamAssistantChat(token: string, body: AssistantChatRequest, signal: AbortSignal, onEvent: (event: AssistantEvent) => void) {
  const response = await postAssistant("/api/assistant/chat", token, body, signal);
  if (!response.body) throw productErrorForStatus(502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const data = buffer.slice(0, boundary).split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
      buffer = buffer.slice(boundary + 2);
      if (data) onEvent(JSON.parse(data) as AssistantEvent);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) return;
  }
}

export async function requestListingCopy(token: string, body: ListingCopyRequest, signal?: AbortSignal): Promise<ListingCopy> {
  return (await postAssistant("/api/assistant/listing-copy", token, body, signal)).json() as Promise<ListingCopy>;
}

async function postAssistant(path: string, token: string, body: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    throw toProductApiError(error);
  }
  if (!response.ok) throw productErrorForStatus(response.status, await readSafeErrorCode(response));
  return response;
}

// A draft the user chose to send. The inbox puts it in the composer of the renter's thread for that listing
// once; the user still edits and presses send.
type PendingDraft = { token: string; listingId: string; body: string };

const pendingDraft = createStore<PendingDraft | null>(null);

export function setPendingDraft(draft: PendingDraft) {
  pendingDraft.set(draft);
}

export function useAssistantDraftHandoff(
  token: string | null,
  conversation: { listingId?: string; viewerRole?: string } | null,
  apply: (body: string) => void
) {
  const draft = useSyncExternalStore(pendingDraft.subscribe, pendingDraft.get, () => null);
  const listingId = conversation?.viewerRole === "renter" ? conversation.listingId : undefined;
  useEffect(() => {
    if (!draft || draft.token !== token || draft.listingId !== listingId) return;
    pendingDraft.set(null);
    apply(draft.body);
  }, [draft, token, listingId, apply]);
}

/** Signing out, or into another account, drops the old conversation and stops its request. */
export function forgetOtherAccounts(token: string | null) {
  if (conversation.get().token !== token && conversation.get().items.length) clearAssistantConversation();
}
