"use client";

import { ArrowLeft, CalendarDays, FileText, Search, Send, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { apiGet, apiPost, getRoommateConversations, getRoommateMessages, markRoommateConversationRead, sendRoommateMessage } from "@/lib/api";
import type { ApiDealThread, ApiRoommateConversation, ApiRoommateMessage, ApiViewingRequest } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { sendDealMessage } from "@/lib/deal-message-commands";
import { createRoommateRealtimeClient } from "@/lib/roommate-realtime";
import { cn } from "@/lib/utils";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";

type ConversationKind = "application" | "tour" | "roommate";
type Message = { id: string; body: string; align: "left" | "right"; createdAt: string };
type InboxConversation = {
  id: string;
  source: "deal" | "roommate";
  kind: ConversationKind;
  person: string;
  title: string;
  detail: string;
  unread: number;
  avatar?: string | null;
  messages: Message[];
  listingId?: string;
  applicantId?: string;
  peerId?: string | null;
  viewerRole?: "renter" | "host";
  participantNames?: string[];
  viewingRequests?: ApiViewingRequest[];
};

const kindLabels: Record<ConversationKind, string> = {
  application: "房源申请",
  tour: "预约看房",
  roommate: "室友匹配"
};

type InboxExperienceProps = {
  initialConversationId: string | null;
  initialListingId?: string | null;
  initialApplicantId?: string | null;
  initialRoommateId?: string | null;
  initialTour?: boolean;
};

export function InboxExperience(props: InboxExperienceProps) {
  const token = useAuthSessionToken();
  const sessionKey = JSON.stringify([token, props.initialConversationId, props.initialListingId, props.initialApplicantId, props.initialRoommateId, props.initialTour]);
  return <InboxSessionExperience key={sessionKey} {...props} token={token} />;
}

function InboxSessionExperience({ initialConversationId, initialListingId, initialApplicantId, initialRoommateId, initialTour = false, token }: InboxExperienceProps & { token: string | null }) {
  const [filter, setFilter] = useState<"all" | ConversationKind>("all");
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [tourPending, setTourPending] = useState(false);
  const [tourAt, setTourAt] = useState(defaultTourDateTime);
  const [tourMode, setTourMode] = useState<"in-person" | "video">("in-person");
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [roommateRefreshVersion, setRoommateRefreshVersion] = useState(0);
  const roommateHistoryAnchors = useRef(new Map<string, string | null>());
  const pendingRoommateSend = useRef<{ conversationId: string; body: string; clientMessageId: string } | null>(null);

  useEffect(() => {
    const accessToken = token;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setAuthenticated(true);
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    let cancelled = false;
    Promise.all([apiGet<ApiDealThread[]>("/deal-threads", accessToken), getRoommateConversations(accessToken)])
      .then(async ([dealThreads, roommateThreads]) => {
        if (cancelled || readStoredAuthSession()?.accessToken !== accessToken) return;
        let nextDealThreads = dealThreads;
        if (initialListingId && !initialApplicantId && !initialConversationId && !initialRoommateId && !dealThreads.some((thread) => thread.listingId === initialListingId)) {
          assertCurrentAuthSession(accessToken);
          const created = await apiPost<ApiDealThread>("/deal-threads", { listingId: initialListingId }, accessToken);
          nextDealThreads = [created, ...dealThreads];
        }
        if (cancelled || readStoredAuthSession()?.accessToken !== accessToken) return;
        const loaded = [...nextDealThreads.map(normalizeDealThread), ...roommateThreads.map(normalizeRoommateConversation)]
          .sort((left, right) => latestTime(right).localeCompare(latestTime(left)));
        setConversations(loaded);
        const hasTarget = Boolean(initialConversationId || initialListingId || initialApplicantId || initialRoommateId);
        const candidates = loaded.filter((item) =>
          (!initialConversationId || item.id === initialConversationId)
          && (!initialListingId || item.listingId === initialListingId)
          && (!initialApplicantId || (Boolean(initialListingId) && item.viewerRole === "host" && item.applicantId === initialApplicantId))
          && (!initialRoommateId || (item.source === "roommate" && item.peerId === initialRoommateId))
        );
        const target = hasTarget ? (candidates.length === 1 ? candidates[0] : null) : loaded[0];
        setSelectedId(target?.id ?? null);
        if (hasTarget && !target) setError("未找到指定对话，请返回原页面重新打开。");
      })
      .catch((caught) => { if (!cancelled) { setLoadFailed(true); setError(caught instanceof Error ? caught.message : "消息暂时无法加载。"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialConversationId, initialListingId, initialApplicantId, initialRoommateId, token, loadAttempt]);

  const selectedConversation = conversations.find((item) => item.id === selectedId) ?? null;
  const activeId = selectedConversation?.id;
  const activeSource = selectedConversation?.source;

  useEffect(() => {
    if (!token || !activeId || activeSource !== "roommate") return;
    let cancelled = false;
    async function refreshHistory(accessToken: string, conversationId: string) {
      const hasHistory = roommateHistoryAnchors.current.has(conversationId);
      const anchor = roommateHistoryAnchors.current.get(conversationId);
      let cursor: string | undefined;
      let newestId: string | undefined;
      let latestPeerMessage: ApiRoommateMessage | undefined;
      do {
        const page = await getRoommateMessages(accessToken, conversationId, cursor);
        if (cancelled || readStoredAuthSession()?.accessToken !== token) return;
        newestId ??= page.messages[0]?.id;
        latestPeerMessage ??= page.messages.find((message) => message.senderRole === "peer");
        // The API paginates newest first (createdAt DESC, id DESC).
        const messages = [...page.messages].reverse().map(normalizeRoommateMessage);
        setConversations((current) => current.map((item) => item.id === activeId ? withMessages({ ...item, unread: 0 }, messages) : item));
        // Summary hints and live events are not history anchors: they can jump
        // past messages missed offline. Page back to the last completed fetch.
        if (!hasHistory || (anchor && page.messages.some((message) => message.id === anchor))) break;
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      roommateHistoryAnchors.current.set(conversationId, newestId ?? null);
      if (latestPeerMessage) void markRoommateConversationRead(accessToken, conversationId, latestPeerMessage.id).catch(() => undefined);
    }
    void refreshHistory(token, activeId)
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "对话暂时无法加载。"); });
    return () => { cancelled = true; };
  }, [activeId, activeSource, token, roommateRefreshVersion]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const refreshRoommateThreads = () => {
      if (cancelled || readStoredAuthSession()?.accessToken !== token) return Promise.resolve();
      return getRoommateConversations(token).then((threads) => {
      if (cancelled || readStoredAuthSession()?.accessToken !== token) return;
      setConversations((current) => [
        ...current.filter((item) => item.source === "deal"),
        ...threads.map((thread) => {
          const summary = normalizeRoommateConversation(thread);
          const existing = current.find((item) => item.source === "roommate" && item.id === thread.id);
          return existing ? withMessages(summary, existing.messages) : summary;
        })
      ].sort((left, right) => latestTime(right).localeCompare(latestTime(left))));
    }).catch(() => undefined);
    };
    const client = createRoommateRealtimeClient({
      token,
      onReconnect: () => {
        if (cancelled || readStoredAuthSession()?.accessToken !== token) return;
        void refreshRoommateThreads();
        setRoommateRefreshVersion((version) => version + 1);
      },
      onEvent: (event) => {
        if (cancelled || readStoredAuthSession()?.accessToken !== token) return;
        if (event.name === "roommate.message.created") {
          const { conversationId, message } = event.payload;
          setConversations((current) => current.map((item) => {
            if (item.id !== conversationId) return item;
            return withMessages(item, [normalizeRoommateMessage(message)]);
          }));
          return;
        }
        if (event.name === "roommate.conversation.created" || event.name === "roommate.conversation.updated") {
          void refreshRoommateThreads();
        }
      }
    });
    client.connect();
    return () => { cancelled = true; client.disconnect(); };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const refreshDealThreads = () => {
      if (cancelled || readStoredAuthSession()?.accessToken !== token) return Promise.resolve();
      return apiGet<ApiDealThread[]>("/deal-threads", token).then((threads) => {
      if (cancelled || readStoredAuthSession()?.accessToken !== token) return;
      setConversations((current) => [
        ...threads.map(normalizeDealThread),
        ...current.filter((item) => item.source === "roommate")
      ].sort((left, right) => latestTime(right).localeCompare(latestTime(left))));
    }).catch(() => undefined);
    };
    const interval = window.setInterval(() => void refreshDealThreads(), 15_000);
    const onFocus = () => void refreshDealThreads();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [token]);

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return conversations.filter((conversation) => {
      if (filter !== "all" && conversation.kind !== filter) return false;
      if (!normalizedQuery) return true;
      return [conversation.person, conversation.title, conversation.detail]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [conversations, filter, searchQuery]);
  const active = filtered.find((item) => item.id === selectedId) ?? null;
  const showConversation = Boolean(selectedId && (active || loading));

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !token || !active || sending) return;
    setSending(true);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      if (active.source === "roommate") {
        const previous = pendingRoommateSend.current;
        const command = previous?.conversationId === active.id && previous.body === body
          ? previous
          : { conversationId: active.id, body, clientMessageId: globalThis.crypto.randomUUID() };
        pendingRoommateSend.current = command;
        const message = await sendRoommateMessage(token, active.id, { clientMessageId: command.clientMessageId, body });
        assertCurrentAuthSession(token);
        updateMessages(active.id, [normalizeRoommateMessage(message)]);
        if (pendingRoommateSend.current === command) pendingRoommateSend.current = null;
      } else {
        const updated = await sendDealMessage(token, active.id, body);
        assertCurrentAuthSession(token);
        const normalized = normalizeDealThread(updated);
        setConversations((current) => current.map((item) => item.id === active.id ? normalized : item));
      }
      setDraft((current) => current === draft ? "" : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "消息发送失败，请重试。");
    } finally {
      setSending(false);
    }
  }

  async function submitViewingRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !active || active.source !== "deal" || active.viewerRole !== "renter" || tourPending) return;
    const selectedTime = new Date(tourAt);
    if (!tourAt || Number.isNaN(selectedTime.getTime()) || selectedTime.getTime() <= Date.now()) {
      setError("请选择未来的看房时间。");
      return;
    }
    setTourPending(true);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const updated = await apiPost<ApiDealThread>(
        `/deal-threads/${encodeURIComponent(active.id)}/viewing-requests`,
        {
          iso: selectedTime.toISOString(),
          timeLabel: new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(selectedTime),
          mode: tourMode,
          participantNames: active.participantNames?.length ? active.participantNames : ["租客"]
        },
        token
      );
      assertCurrentAuthSession(token);
      applyDealThread(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "看房请求发送失败，请重试。");
    } finally {
      setTourPending(false);
    }
  }

  async function decideViewingRequest(request: ApiViewingRequest, decision: "confirm" | "decline") {
    if (!token || !active || active.source !== "deal" || active.viewerRole !== "host" || tourPending) return;
    setTourPending(true);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const updated = await apiPost<ApiDealThread>(
        `/deal-threads/${encodeURIComponent(active.id)}/viewing-requests/${encodeURIComponent(request.id)}/${decision}`,
        { expectedRevision: request.revision },
        token
      );
      assertCurrentAuthSession(token);
      applyDealThread(updated);
    } catch (caught) {
      if (caught instanceof Error && "status" in caught && caught.status === 409) {
        setError("看房请求已更新，请核对最新时间、方式和参与人后再决定。");
        if (readStoredAuthSession()?.accessToken === token) {
          try {
            const threads = await apiGet<ApiDealThread[]>("/deal-threads", token);
            assertCurrentAuthSession(token);
            const refreshed = threads.find((thread) => thread.id === active.id);
            if (refreshed) applyDealThread(refreshed);
          } catch { /* Keep the conflict visible if refreshing also fails. */ }
        }
      } else {
        setError(caught instanceof Error ? caught.message : "看房请求处理失败，请重试。");
      }
    } finally {
      setTourPending(false);
    }
  }

  function applyDealThread(thread: ApiDealThread) {
    const normalized = normalizeDealThread(thread);
    setConversations((current) => current.map((item) => item.id === thread.id ? normalized : item));
    setSelectedId(thread.id);
  }

  function updateMessages(id: string, messages: Message[]) {
    setConversations((current) => current.map((item) => item.id === id ? withMessages(item, messages) : item));
  }

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb]">
      <div className="mx-auto max-w-[1520px] px-0 sm:px-6 sm:py-6 lg:px-8">
        <div className="overflow-hidden border-slate-200 bg-white sm:rounded-[28px] sm:border sm:shadow-[0_18px_60px_rgba(15,23,42,0.08)] lg:grid lg:h-[calc(100dvh-120px)] lg:min-h-0 lg:grid-cols-[370px_minmax(0,1fr)]">
          <section className={cn("min-w-0 border-r border-slate-200", showConversation && "hidden lg:block")} aria-label="会话列表">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0668e1]">Messages</p>
              <h1 className="mt-1 text-3xl font-black tracking-[-0.045em]">收件箱</h1>
              <label className="mt-5 flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3"><Search className="size-4 text-slate-400" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索消息" aria-label="搜索消息" /></label>
              <div className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none]">{(["all", "application", "tour", "roommate"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={cn("shrink-0 rounded-full px-3 py-2 text-xs font-bold", filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600")}>{value === "all" ? "全部" : kindLabels[value]}</button>)}</div>
            </div>
            <div className="max-h-[calc(100dvh-300px)] overflow-y-auto p-3">
              {!authenticated && !loading ? <EmptyInbox title="登录后查看真实消息" actionHref={authRoute({ returnTo: inboxReturnTo({ initialConversationId, initialListingId, initialApplicantId, initialRoommateId, initialTour }) })} action="登录" /> : null}
              {!authenticated && loading ? <p className="p-5 text-center text-sm font-bold text-slate-500">正在检查登录状态…</p> : null}
              {authenticated && !loading && conversations.length === 0 && !error ? <EmptyInbox title="还没有消息" actionHref="/search" action="浏览房源" /> : null}
              {loading && authenticated ? <p className="p-5 text-center text-sm text-slate-400">正在同步消息…</p> : null}
              {error && !active ? <p role="alert" className="m-2 rounded-[14px] bg-red-50 p-4 text-xs font-bold text-red-700">{error}</p> : null}
              {loadFailed && !loading ? <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="secondary-action m-2">重新加载消息</button> : null}
              {authenticated && !loading && conversations.length > 0 && filtered.length === 0 ? <p className="p-6 text-center text-sm font-bold text-slate-400">没有匹配的消息</p> : null}
              {filtered.map((conversation) => <Link key={conversation.id} href={`/inbox/${conversation.id}`} onClick={() => { if (selectedId !== conversation.id) setDraft(""); setSelectedId(conversation.id); }} className={cn("grid grid-cols-[48px_minmax(0,1fr)_auto] gap-3 rounded-[18px] p-3", active?.id === conversation.id ? "bg-blue-50" : "hover:bg-slate-50")}><Avatar name={conversation.person} src={conversation.avatar} /><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-black">{conversation.person}</p><span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-slate-500">{kindLabels[conversation.kind]}</span></div><p className="mt-1 truncate text-xs font-bold text-slate-700">{conversation.title}</p><p className="mt-1 truncate text-xs text-slate-500">{conversation.detail || "暂无消息"}</p></div>{conversation.unread ? <span className="grid size-5 place-items-center rounded-full bg-[#0668e1] text-[10px] font-black text-white">{conversation.unread}</span> : null}</Link>)}
            </div>
          </section>

          <section className={cn("flex h-[calc(100dvh-136px)] min-w-0 flex-col lg:h-auto lg:min-h-0", !showConversation && "hidden lg:flex")} aria-label="对话内容">
            {active ? <>
              <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6"><Link href="/inbox" onClick={() => setSelectedId(null)} className="grid size-10 place-items-center rounded-full lg:hidden" aria-label="返回会话列表"><ArrowLeft className="size-4" /></Link><Avatar name={active.person} src={active.avatar} small /><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black">{active.person}</h2><p className="truncate text-xs text-slate-500">{active.title}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{kindLabels[active.kind]}</span></header>
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-3"><div className="flex items-center gap-3 text-xs font-black"><KindIcon kind={active.kind} />关联事项 · {active.title}</div></div>
              {active.source === "deal" && active.viewingRequests?.length ? <ViewingRequestSummary request={active.viewingRequests.at(-1)!} viewerRole={active.viewerRole!} pending={tourPending} onDecision={decideViewingRequest} /> : null}
              {initialTour && active.source === "deal" && active.viewerRole === "renter" ? <form onSubmit={submitViewingRequest} className="border-b border-blue-100 bg-blue-50/60 px-4 py-4 sm:px-6"><div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end"><label className="grid gap-1.5 text-xs font-black text-slate-700">预约看房时间<input type="datetime-local" min={minimumTourDateTime()} value={tourAt} onChange={(event) => setTourAt(event.target.value)} className="application-input" /></label><label className="grid gap-1.5 text-xs font-black text-slate-700">方式<select value={tourMode} onChange={(event) => setTourMode(event.target.value as "in-person" | "video")} className="application-input"><option value="in-person">线下看房</option><option value="video">视频看房</option></select></label><button type="submit" disabled={tourPending} className="primary-action h-12 justify-center">{tourPending ? "发送中…" : "发送看房请求"}</button></div></form> : null}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"><div className="mx-auto max-w-3xl space-y-4">{active.messages.length ? active.messages.map((message) => <MessageBubble key={message.id} message={message} />) : <p className="py-16 text-center text-sm text-slate-400">发送第一条消息开始对话</p>}</div></div>
              {error ? <p role="alert" className="mx-4 mb-3 shrink-0 rounded-[14px] bg-red-50 p-4 text-xs font-bold leading-5 text-red-700">{error}</p> : null}
              <form onSubmit={sendMessage} className="shrink-0 border-t border-slate-200 p-4"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-2 pl-4"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} placeholder="输入消息…" className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-sm outline-none" aria-label="消息内容" /><button type="submit" disabled={sending || !draft.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#0668e1] text-white disabled:opacity-40" aria-label="发送消息"><Send className="size-4" /></button></div></form>
            </> : loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">正在同步消息…</p> : <div className="grid flex-1 place-items-center p-8 text-center"><div><h2 className="text-xl font-black">选择一条对话</h2><p className="mt-2 text-sm text-slate-500">你的真实房源沟通和室友消息会显示在这里。</p></div></div>}
          </section>
        </div>
      </div>
    </main>
  );
}

function normalizeDealThread(thread: ApiDealThread): InboxConversation {
  const messages = thread.messages.map((message) => ({ id: message.id, body: message.body, align: message.align, createdAt: message.createdAt }));
  return { id: thread.id, source: "deal", kind: thread.viewingRequests.length ? "tour" : "application", person: thread.contactName, title: thread.listingTitle, detail: messages.at(-1)?.body ?? "", unread: 0, messages, listingId: thread.listingId, applicantId: thread.ownerId, viewerRole: thread.viewerRole, participantNames: thread.participantNames, viewingRequests: thread.viewingRequests };
}

function normalizeRoommateConversation(thread: ApiRoommateConversation): InboxConversation {
  const messages = thread.latestMessage ? [normalizeRoommateMessage(thread.latestMessage)] : [];
  return { id: thread.id, source: "roommate", kind: "roommate", person: thread.peer.name ?? "室友", title: thread.peer.role ?? "室友匹配", detail: thread.latestMessage?.body ?? "", unread: thread.unreadCount, avatar: thread.peer.image, messages, peerId: thread.peer.id };
}

function normalizeRoommateMessage(message: ApiRoommateMessage): Message { return { id: message.id, body: message.body, align: message.senderRole === "self" ? "right" : "left", createdAt: message.createdAt }; }
function withMessages(conversation: InboxConversation, incoming: Message[]): InboxConversation {
  const byId = new Map(conversation.messages.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  const messages = [...byId.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
  return { ...conversation, messages, detail: messages.at(-1)?.body ?? conversation.detail };
}
function latestTime(conversation: InboxConversation) { return conversation.messages.at(-1)?.createdAt ?? ""; }
function EmptyInbox({ title, actionHref, action }: { title: string; actionHref: string; action: string }) { return <div className="m-2 rounded-[18px] border border-dashed border-slate-300 p-6 text-center"><p className="text-sm font-black">{title}</p><Link href={actionHref} className="mt-4 inline-flex rounded-full bg-[#0668e1] px-4 py-2 text-xs font-black text-white">{action}</Link></div>; }
function Avatar({ name, src, small = false }: { name: string; src?: string | null; small?: boolean }) { return <div className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-blue-50 font-black text-[#0668e1]", small ? "size-10" : "size-12")}>{src ? <Image src={src} alt="" fill sizes={small ? "40px" : "48px"} className="object-cover" /> : name.slice(0, 1).toUpperCase()}</div>; }
function KindIcon({ kind }: { kind: ConversationKind }) { return <span className="grid size-8 place-items-center rounded-[11px] bg-white text-[#0668e1]">{kind === "application" ? <FileText className="size-4" /> : kind === "tour" ? <CalendarDays className="size-4" /> : <UsersRound className="size-4" />}</span>; }
function MessageBubble({ message }: { message: Message }) { return <div className={cn("flex", message.align === "right" && "justify-end")}><div className={cn("min-w-0 max-w-[78%] rounded-[20px] px-4 py-3 text-sm leading-6", message.align === "right" ? "rounded-br-md bg-[#0668e1] text-white" : "rounded-bl-md bg-slate-100 text-slate-800")}><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p><p className={cn("mt-1 text-[10px]", message.align === "right" ? "text-blue-100" : "text-slate-400")}>{formatTime(message.createdAt)}</p></div></div>; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date); }

function ViewingRequestSummary({ request, viewerRole, pending, onDecision }: { request: ApiViewingRequest; viewerRole: "renter" | "host"; pending: boolean; onDecision: (request: ApiViewingRequest, decision: "confirm" | "decline") => Promise<void> }) {
  return <div className="border-b border-blue-100 bg-blue-50/60 px-4 py-4 sm:px-6"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white p-4 shadow-sm"><div><p className="text-xs font-black text-blue-700">看房预约 · {viewingStatusLabel(request.status)}</p><p className="mt-1 text-sm font-black text-slate-900">{request.timeLabel}</p><p className="mt-1 text-xs text-slate-500">{request.mode === "video" ? "视频看房" : "线下看房"} · {request.participantNames.join("、")}</p></div>{viewerRole === "host" && request.status === "REQUESTED" ? <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => void onDecision(request, "confirm")} className="primary-action">确认预约</button><button type="button" disabled={pending} onClick={() => void onDecision(request, "decline")} className="secondary-action">拒绝</button></div> : null}</div></div>;
}

function viewingStatusLabel(status: ApiViewingRequest["status"]) {
  return { REQUESTED: "等待房东确认", CONFIRMED: "已确认", COMPLETED: "已完成", CANCELLED: "已取消" }[status];
}

function defaultTourDateTime() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setHours(10, 0, 0, 0);
  return toLocalDateTimeValue(date);
}

function minimumTourDateTime() {
  return toLocalDateTimeValue(new Date());
}

function toLocalDateTimeValue(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function inboxReturnTo({ initialConversationId, initialListingId, initialApplicantId, initialRoommateId, initialTour }: InboxExperienceProps) {
  const params = new URLSearchParams();
  if (initialConversationId) params.set("conversationId", initialConversationId);
  if (initialListingId) params.set("listingId", initialListingId);
  if (initialApplicantId) params.set("applicantId", initialApplicantId);
  if (initialRoommateId) params.set("roommateId", initialRoommateId);
  if (initialTour) params.set("tour", "1");
  return params.size ? `/inbox?${params.toString()}` : "/inbox";
}
