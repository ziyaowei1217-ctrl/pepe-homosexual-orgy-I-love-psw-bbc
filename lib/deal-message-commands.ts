import { apiPost, type ApiDealThread } from "@/lib/api";
import { assertCurrentAuthSession } from "@/lib/auth-session";

// Keep unresolved operations through Inbox route remounts, without persisting
// message content or credentials to browser storage. A new session replaces them.
let pendingSession: { token: string; commands: Map<string, string> } | undefined;

export async function sendDealMessage(token: string, threadId: string, text: string) {
  assertCurrentAuthSession(token);
  if (pendingSession?.token !== token) pendingSession = { token, commands: new Map() };
  const session = pendingSession;
  const body = text.trim();
  const operation = JSON.stringify([threadId, body]);
  const clientMessageId = session.commands.get(operation) ?? globalThis.crypto.randomUUID();
  session.commands.set(operation, clientMessageId);
  const updated = await apiPost<ApiDealThread>(`/deal-threads/${encodeURIComponent(threadId)}/messages`, { body, clientMessageId }, token);
  assertCurrentAuthSession(token);
  if (session.commands.get(operation) === clientMessageId) session.commands.delete(operation);
  return updated;
}
