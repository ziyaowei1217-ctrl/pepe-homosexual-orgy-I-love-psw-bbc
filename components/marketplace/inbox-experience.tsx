"use client";

import { ArrowLeft, CalendarDays, FileText, Search, Send, UsersRound } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";

import { EmptyState } from "@/components/marketplace/empty-state";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Wowo } from "@/components/brand/wowo";
import { apiGet, apiPost, getDealMessages, getRoommateConversations, getRoommateMessages, markRoommateConversationRead, sendRoommateMessage } from "@/lib/api";
import type { ApiDealThread, ApiRoommateConversation, ApiRoommateMessage, ApiViewingRequest } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { useAssistantDraftHandoff } from "@/lib/assistant/client";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { sendDealMessage } from "@/lib/deal-message-commands";
import { usesNeonAuth } from "@/lib/neon-auth-client";
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
  olderCursor?: string | null;
  historyReady?: boolean;
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
  const [olderLoading, setOlderLoading] = useState<string[]>([]);
  const olderBusy = useRef(new Set<string>());
  const olderAnchor = useRef<{ id: string; top: number; height: number } | null>(null);
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
  // A draft the user picked in the AI assistant lands in the composer of the inbox opened for that listing
  // (not an inbox that is about to be replaced by the navigation); the user still edits and sends it.
  useAssistantDraftHandoff(token, selectedConversation?.listingId === initialListingId ? selectedConversation : null, setDraft);
  const activeId = selectedConversation?.id;
  const activeSource = selectedConversation?.source;
  const dealHistorySupported = activeSource === "deal" && selectedConversation?.olderCursor !== undefined;

  useEffect(() => {
    if (!token || !activeId || !activeSource || (activeSource === "deal" && !dealHistorySupported)) return;
    let cancelled = false;
    async function refreshHistory(accessToken: string, conversationId: string) {
      const hasHistory = roommateHistoryAnchors.current.has(conversationId);
      const anchor = roommateHistoryAnchors.current.get(conversationId);
      let cursor: string | undefined;
      let newestId: string | undefined;
      let latestPeerMessage: ApiRoommateMessage | undefined;
      do {
        const page = activeSource === "deal" ? await getDealMessages(accessToken, conversationId, cursor) : await getRoommateMessages(accessToken, conversationId, cursor);
        if (cancelled || readStoredAuthSession()?.accessToken !== token) return;
        newestId ??= activeSource === "deal" ? page.messages.at(-1)?.id : page.messages[0]?.id;
        if (activeSource === "roommate") latestPeerMessage ??= (page.messages as ApiRoommateMessage[]).find((message) => message.senderRole === "peer");
        // The API paginates newest first (createdAt DESC, id DESC).
        const messages = activeSource === "deal" ? page.messages.map(message => normalizeDealMessage(message as ApiDealThread["messages"][number])) : [...(page.messages as ApiRoommateMessage[])].reverse().map(normalizeRoommateMessage);
        setConversations((current) => current.map((item) => item.id === activeId ? withMessages({ ...item, unread: 0, historyReady: true, ...(!hasHistory ? { olderCursor: page.nextCursor } : {}) }, messages) : item));
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
  }, [activeId, activeSource, token, roommateRefreshVersion, dealHistorySupported]);

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
          return existing ? withMessages({ ...summary, olderCursor: existing.olderCursor, historyReady: existing.historyReady }, existing.messages) : summary;
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
        ...threads.map(thread => { const summary = normalizeDealThread(thread); const existing = current.find(item => item.id === thread.id); return existing ? withMessages({ ...summary, olderCursor: existing.olderCursor, historyReady: existing.historyReady }, existing.messages) : summary; }),
        ...current.filter((item) => item.source === "roommate")
      ].sort((left, right) => latestTime(right).localeCompare(latestTime(left))));
      setRoommateRefreshVersion(version => version + 1);
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
  // Open at the newest message, but leave readers in place while they browse history.
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const scrolledConversation = useRef<string | null>(null);
  const messageCount = active?.messages.length ?? 0;
  useEffect(() => {
    const list = messagesRef.current;
    if (!list) return;
    if (scrolledConversation.current !== active?.id) {
      scrolledConversation.current = active?.id ?? null;
      followLatest.current = true;
      olderAnchor.current = null;
      list.scrollTop = list.scrollHeight;
      return;
    }
    const anchor = olderAnchor.current;
    if (anchor && anchor.id === active?.id) {
      list.scrollTop = Math.max(0, anchor.top + list.scrollHeight - anchor.height);
      olderAnchor.current = null;
      followLatest.current = list.scrollHeight - list.clientHeight - list.scrollTop <= 64;
    } else if (followLatest.current) list.scrollTop = list.scrollHeight;
  }, [active?.id, active?.olderCursor, messageCount]);

  async function loadEarlierMessages() {
    if (!token || !active?.olderCursor || !active.historyReady || olderBusy.current.has(active.id)) return;
    const conversation = active;
    olderBusy.current.add(conversation.id);
    setOlderLoading(current => [...current, conversation.id]);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const page = conversation.source === "deal" ? await getDealMessages(token, conversation.id, conversation.olderCursor!) : await getRoommateMessages(token, conversation.id, conversation.olderCursor!);
      assertCurrentAuthSession(token);
      const viewport = messagesRef.current;
      if (viewport?.dataset.conversationId === conversation.id) olderAnchor.current = { id: conversation.id, top: viewport.scrollTop, height: viewport.scrollHeight };
      const messages = conversation.source === "deal" ? page.messages.map(message => normalizeDealMessage(message as ApiDealThread["messages"][number])) : [...(page.messages as ApiRoommateMessage[])].reverse().map(normalizeRoommateMessage);
      setConversations(current => current.map(item => item.id === conversation.id ? withMessages({ ...item, olderCursor: page.nextCursor }, messages) : item));
    } catch (caught) {
      if (readStoredAuthSession()?.accessToken === token && messagesRef.current?.dataset.conversationId === conversation.id) setError(caught instanceof Error ? caught.message : "较早消息暂时无法加载，请重试。");
    } finally {
      olderBusy.current.delete(conversation.id);
      setOlderLoading(current => current.filter(id => id !== conversation.id));
    }
  }

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
        setConversations((current) => current.map((item) => item.id === active.id ? withMessages({ ...normalized, olderCursor: item.olderCursor, historyReady: item.historyReady }, item.messages) : item));
      }
      if (messagesRef.current?.dataset.conversationId === active.id) {
        followLatest.current = true;
        setDraft((current) => current === draft ? "" : current);
      }
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
    setConversations((current) => current.map((item) => item.id === thread.id ? withMessages({ ...normalized, olderCursor: item.olderCursor, historyReady: item.historyReady }, item.messages) : item));
    setSelectedId(thread.id);
  }

  function updateMessages(id: string, messages: Message[]) {
    setConversations((current) => current.map((item) => item.id === id ? withMessages(item, messages) : item));
  }

  // No conversations yet: one state for the page instead of an empty list next to "choose a conversation".
  if (authenticated && !loading && !error && conversations.length === 0) {
    return <main className="min-h-[calc(100dvh-72px)] bg-background"><div className="page-container pb-16 pt-8 sm:pt-12">
      <h1 className="page-title">收件箱</h1>
      <EmptyState className="mt-7" mood="sleepy" title="还没有消息" body="在房源页联系转租人、预约看房，或者和喜欢的室友互相喜欢后，对话会出现在这里。" action={<Link href="/search" className="primary-action">去找房</Link>} />
    </div></main>;
  }

  // Signed out there is nothing to search, filter or open: one sign-in state instead of the two-pane inbox.
  if (!authenticated && !loading) {
    return <main className="min-h-[calc(100dvh-72px)] bg-background"><div className="page-container pb-16 pt-8 sm:pt-12">
      <h1 className="page-title">收件箱</h1>
      <EmptyState className="mt-7" mood="sleepy" title="登录后查看你的消息" body={usesNeonAuth() ? "和转租人、室友的消息都在这里。使用 Google 账户登录后查看。" : "和转租人、室友的消息都在这里。用邮箱验证码登录，不需要密码。"} action={<Link href={authRoute({ returnTo: inboxReturnTo({ initialConversationId, initialListingId, initialApplicantId, initialRoommateId, initialTour }) })} className="primary-action">登录</Link>} />
    </div></main>;
  }

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-background">
      <div className="mx-auto max-w-[1264px] px-0 sm:px-8 sm:py-6">
        <div className="overflow-hidden border-line-strong bg-surface sm:rounded-psw-xl sm:border lg:grid lg:h-[calc(100dvh-120px)] lg:min-h-0 lg:grid-cols-[370px_minmax(0,1fr)]">
          <section className={cn("min-w-0 border-r border-line-strong", showConversation && "hidden lg:block")} aria-label="会话列表">
            <div className="border-b border-line-strong p-5 sm:p-6">
              <h1 className="page-title">收件箱</h1>
              <label className="mt-5 flex min-h-12 items-center gap-2 rounded-full border border-control-border bg-surface px-4 focus-within:border-primary"><Search className="size-4 text-ink-secondary" aria-hidden="true" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" placeholder="搜索消息" aria-label="搜索消息" /></label>
              <div className="mt-4 flex gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none]">{(["all", "application", "tour", "roommate"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={cn("search-pill min-h-9 px-3.5", filter === value && "search-pill-active")}>{value === "all" ? "全部" : kindLabels[value]}</button>)}</div>
            </div>
            <div className="max-h-[calc(100dvh-300px)] overflow-y-auto p-3">
              {!authenticated && loading ? <p className="p-5 text-center text-d-subhead text-ink-secondary">正在检查登录状态…</p> : null}
              {authenticated && !loading && conversations.length === 0 && !error ? <EmptyInbox title="还没有消息" actionHref="/search" action="浏览房源" /> : null}
              {loading && authenticated ? <p className="p-5 text-center text-d-subhead text-ink-secondary">正在同步消息…</p> : null}
              {error && !active ? <p role="alert" className="m-2 rounded-psw-md bg-danger-soft p-4 text-d-subhead font-semibold text-danger-text">{error}</p> : null}
              {loadFailed && !loading ? <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="secondary-action m-2">重新加载消息</button> : null}
              {authenticated && !loading && conversations.length > 0 && filtered.length === 0 ? <p className="p-6 text-center text-d-subhead text-ink-secondary">没有匹配的消息</p> : null}
              {filtered.map((conversation) => <Link key={conversation.id} href={`/inbox/${conversation.id}`} onClick={() => { if (selectedId !== conversation.id) setDraft(""); setSelectedId(conversation.id); }} className={cn("grid grid-cols-[48px_minmax(0,1fr)_auto] gap-3 rounded-psw-lg p-3", active?.id === conversation.id ? "bg-surface-subtle" : "hover:bg-surface-subtle")}><Avatar name={conversation.person} src={conversation.avatar} /><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{conversation.person}</p><span className="shrink-0 whitespace-nowrap rounded-psw-sm bg-surface px-2 py-0.5 text-m-footnote font-bold text-ink-secondary">{kindLabels[conversation.kind]}</span></div><p className="mt-1 truncate text-m-footnote font-bold text-ink-secondary">{conversation.title}</p><p className="mt-1 truncate text-m-footnote text-ink-secondary">{conversation.detail || "暂无消息"}</p></div>{conversation.unread && active?.id !== conversation.id ? <span className="grid size-5 place-items-center rounded-full bg-badge text-m-footnote font-bold text-on-badge">{conversation.unread}</span> : null}</Link>)}
            </div>
          </section>

          <section className={cn("flex h-[calc(100dvh-136px)] min-w-0 flex-col lg:h-auto lg:min-h-0", !showConversation && "hidden lg:flex")} aria-label="对话内容">
            <h1 className="sr-only lg:hidden">收件箱</h1>
            {active ? <>
              <header className="flex items-center gap-3 border-b border-line-strong px-4 py-3 sm:px-6"><Link href="/inbox" onClick={() => setSelectedId(null)} className="grid size-11 place-items-center rounded-full lg:hidden" aria-label="返回会话列表"><ArrowLeft className="size-4" /></Link><Avatar name={active.person} src={active.avatar} small /><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{active.person}</h2><p className="truncate text-m-footnote text-ink-secondary">{active.title}</p></div><span className="rounded-full bg-surface-subtle px-3 py-1.5 text-m-footnote font-bold text-primary-text">{kindLabels[active.kind]}</span></header>
              {active.source === "deal" && active.listingId ? <div className="border-b border-line-strong bg-surface-muted px-4 py-2 sm:px-6"><Link href={`/listing/${encodeURIComponent(active.listingId)}`} className="flex min-h-11 items-center gap-3 text-m-footnote font-bold text-ink hover:text-primary-text"><KindIcon kind={active.kind} /><span className="min-w-0 truncate">房源 · {active.title}</span><span className="ml-auto shrink-0 text-primary-text">查看房源</span></Link></div> : null}
              {active.source === "deal" && active.viewingRequests?.length ? <ViewingRequestSummary request={active.viewingRequests.at(-1)!} viewerRole={active.viewerRole!} pending={tourPending} onDecision={decideViewingRequest} /> : null}
              {initialTour && active.source === "deal" && active.viewerRole === "renter" ? <form onSubmit={submitViewingRequest} className="border-b border-primary-soft bg-surface-subtle/60 px-4 py-4 sm:px-6"><div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end"><label className="grid gap-1.5 text-m-footnote font-bold text-ink-secondary">预约看房时间<input type="datetime-local" min={minimumTourDateTime()} value={tourAt} onChange={(event) => setTourAt(event.target.value)} className="application-input" /></label><label className="grid gap-1.5 text-m-footnote font-bold text-ink-secondary">方式<select value={tourMode} onChange={(event) => setTourMode(event.target.value as "in-person" | "video")} className="application-input"><option value="in-person">线下看房</option><option value="video">视频看房</option></select></label><button type="submit" disabled={tourPending} className="primary-action h-12 justify-center">{tourPending ? "发送中…" : "发送看房请求"}</button></div></form> : null}
              <div ref={messagesRef} role="region" aria-label="消息记录" tabIndex={0} data-conversation-id={active.id} onScroll={(event) => { const list = event.currentTarget; followLatest.current = list.scrollHeight - list.clientHeight - list.scrollTop <= 64; }} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"><div className="mx-auto max-w-3xl space-y-4">{active.olderCursor && active.historyReady ? <button type="button" disabled={olderLoading.includes(active.id)} onClick={() => void loadEarlierMessages()} className="secondary-action">{olderLoading.includes(active.id) ? "正在加载…" : "加载较早消息"}</button> : null}{active.messages.length ? active.messages.map((message) => <MessageBubble key={message.id} message={message} />) : <p className="py-16 text-center text-d-subhead text-ink-secondary">发送第一条消息开始对话</p>}</div></div>
              {error ? <p role="alert" className="mx-4 mb-3 shrink-0 rounded-psw-md bg-danger-soft p-4 text-d-subhead font-semibold text-danger-text">{error}</p> : null}
              <form onSubmit={sendMessage} className="shrink-0 border-t border-line-strong p-4"><div className="field-shell mx-auto flex max-w-3xl items-end gap-2 rounded-psw-xl border border-line-strong bg-surface-muted p-2 pl-4"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} placeholder="输入消息…" className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-base outline-none [field-sizing:content] sm:text-sm" aria-label="消息内容" /><button type="submit" disabled={sending || !draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-40" aria-label="发送消息"><Send className="size-4" /></button></div></form>
            </> : loading ? <p role="status" className="p-8 text-center text-sm text-ink-secondary">正在同步消息…</p> : <div className="grid flex-1 place-items-center p-8 text-center"><div><h2 className="text-m-headline sm:text-d-headline">选择一条对话</h2><p className="mt-2 text-d-subhead text-ink-secondary">和转租人、室友的消息都会显示在这里。</p></div></div>}
          </section>
        </div>
      </div>
    </main>
  );
}

function normalizeDealMessage(message: ApiDealThread["messages"][number]): Message { return { id: message.id, body: message.body, align: message.align, createdAt: message.createdAt }; }

function normalizeDealThread(thread: ApiDealThread): InboxConversation {
  const messages = thread.messages.map((message) => ({ id: message.id, body: message.body, align: message.align, createdAt: message.createdAt }));
  return { id: thread.id, source: "deal", kind: thread.viewingRequests.length ? "tour" : "application", person: thread.contactName, title: thread.listingTitle, detail: messages.at(-1)?.body ?? "", unread: 0, messages, olderCursor: thread.messagePageInfo?.nextCursor, historyReady: !thread.messagePageInfo, listingId: thread.listingId, applicantId: thread.ownerId, viewerRole: thread.viewerRole, participantNames: thread.participantNames, viewingRequests: thread.viewingRequests };
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
function EmptyInbox({ title, actionHref, action }: { title: string; actionHref: string; action: string }) { return <div className="m-2 flex flex-col items-center rounded-psw-lg bg-surface-muted p-6 text-center"><Wowo mood="sleepy" size={64} /><p className="mt-3 text-d-label">{title}</p><Link href={actionHref} className="primary-action mt-4">{action}</Link></div>; }
function Avatar({ name, src, small = false }: { name: string; src?: string | null; small?: boolean }) { return <div className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-subtle font-bold text-primary-text", small ? "size-10" : "size-12")}>{src ? <SmartImage src={src} alt="" fill sizes={small ? "40px" : "48px"} className="object-cover" /> : name.slice(0, 1).toUpperCase()}</div>; }
function KindIcon({ kind }: { kind: ConversationKind }) { return <span className="grid size-8 place-items-center rounded-psw-md bg-surface text-primary-text">{kind === "application" ? <FileText className="size-4" /> : kind === "tour" ? <CalendarDays className="size-4" /> : <UsersRound className="size-4" />}</span>; }
function MessageBubble({ message }: { message: Message }) { return <div className={cn("flex", message.align === "right" && "justify-end")}><div className={cn("min-w-0 max-w-[78%] rounded-psw-xl px-4 py-3 text-sm leading-6", message.align === "right" ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-tag-neutral text-ink")}><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p><p className={cn("mt-1 text-m-footnote", message.align === "right" ? "text-on-primary" : "text-ink-secondary")}>{formatTime(message.createdAt)}</p></div></div>; }
let timeFormat: Intl.DateTimeFormat | undefined;
let dayFormat: Intl.DateTimeFormat | undefined;
/** 「13:00」 today, 「10月20日 13:00」 on other days, so a thread over several days reads in order. */
function formatTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  timeFormat ??= new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  dayFormat ??= new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
  const time = timeFormat.format(date);
  return date.toDateString() === now.toDateString() ? time : `${dayFormat.format(date)} ${time}`;
}

function ViewingRequestSummary({ request, viewerRole, pending, onDecision }: { request: ApiViewingRequest; viewerRole: "renter" | "host"; pending: boolean; onDecision: (request: ApiViewingRequest, decision: "confirm" | "decline") => Promise<void> }) {
  return <div className="border-b border-primary-soft bg-surface-subtle/60 px-4 py-4 sm:px-6"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-psw-lg bg-surface p-4"><div><p className="text-m-footnote font-bold text-primary-text">看房预约 · {viewingStatusLabel(request.status)}</p><p className="mt-1 text-sm font-bold text-ink">{request.timeLabel}</p><p className="mt-1 text-m-footnote text-ink-secondary">{request.mode === "video" ? "视频看房" : "线下看房"} · {request.participantNames.join("、")}</p></div>{viewerRole === "host" && request.status === "REQUESTED" ? <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => void onDecision(request, "confirm")} className="primary-action">确认预约</button><button type="button" disabled={pending} onClick={() => void onDecision(request, "decline")} className="secondary-action">拒绝</button></div> : null}</div></div>;
}

function viewingStatusLabel(status: ApiViewingRequest["status"]) {
  return { REQUESTED: "等待转租人确认", CONFIRMED: "已确认", COMPLETED: "已完成", CANCELLED: "已取消" }[status];
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
