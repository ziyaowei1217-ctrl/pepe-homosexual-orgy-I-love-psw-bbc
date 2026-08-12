import { productErrorForStatus, toProductApiError } from "./product-errors";
import { getBrowserDeviceId } from "./device-id";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export type ApiListing = {
  id: string;
  title: string;
  area: string;
  image: string;
  price: number;
  originalPrice: number;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  trust: string;
  tags: string[];
  score: number;
  ownerId?: string;
  status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  updatedAt?: string;
  media?: Array<{
    id: string;
    url: string;
    kind: string;
    sortOrder: number;
  }>;
  availableFrom?: string;
  availableTo?: string;
};

export type ApiRoommateCompatibilityDimensions = {
  budget: number;
  lifestyle: number;
  school: number;
  area: number;
  reliability: number;
  profile: number;
};

export type ApiRoommateMatchType = "top-pick" | "strong-fit" | "explore" | "wildcard";

export type ApiRoommateDeckStrategy = "precision" | "balanced" | "discovery";

export type ApiRoommateRecommendation = {
  action: "like" | "later" | "pass";
  confidence: "high" | "medium" | "low";
  headline: string;
  primarySignals: string[];
  watchouts: string[];
  nextQuestions: string[];
};

export type ApiRoommateRankingSignals = {
  finalScore: number;
  compatibilityScore: number;
  confidenceScore: number;
  profileQualityScore: number;
  diversityBoost: number;
  explorationBoost: number;
  recommendationPriority: number;
  percentile: number;
  strategy: ApiRoommateDeckStrategy;
};

export type ApiRoommate = {
  id?: string;
  actionTargetId?: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
  status?: "active" | "hidden";
  archivedAt?: string | null;
  compatibilityScore?: number;
  ranking?: ApiRoommateRankingSignals;
  dimensions?: ApiRoommateCompatibilityDimensions;
  matchType?: ApiRoommateMatchType;
  recommendation?: ApiRoommateRecommendation;
  decisionHint?: string;
  rank?: number;
  deckBatch?: string;
  spark?: string;
  reasons?: string[];
  tradeoffs?: string[];
  icebreaker?: string;
  badges?: string[];
};

export type ApiRoommateDeckResponse = {
  items: ApiRoommate[];
  pageInfo: {
    cursor: number;
    nextCursor: number | null;
    limit: number;
    returned: number;
    totalCandidates: number;
  };
  discovery: {
    headline: string;
    sampleSize: number;
    topScore: number;
    filters: {
      budgetMin: number;
      budgetMax: number;
      school: string;
      schools?: string[];
      hobby: string;
      hobbies?: string[];
      city: string;
      gender?: string;
      strategy?: ApiRoommateDeckStrategy;
    };
    weights?: Partial<Record<keyof ApiRoommateCompatibilityDimensions, number>>;
    rankingWeights?: {
      compatibility: number;
      confidence: number;
      profileQuality: number;
      diversity: number;
      exploration: number;
    };
    tips: string[];
  };
};

export type ApiGroup = {
  id: string;
  name: string;
  budget: string;
  members: ApiRoommate[];
};

export type ApiTrip = {
  id: string;
  listingId: string;
  title: string;
  amount: number;
  status: string;
};

export type ApiTrustQueue = {
  id: string;
  label: string;
  value: number;
  variant: "trust" | "warning" | "danger" | "success";
};

export type SessionUser = {
  id: string;
  email: string;
  role: string;
};

export type ApiProfile = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  school: string | null;
  city: string | null;
  role: "renter" | "lister" | "both";
  eduEmailVerified: boolean;
  phoneVerified: boolean;
  wechat: string | null;
  instagram: string | null;
  bio: string | null;
};

export type UpdateProfileInput = {
  displayName?: string;
  avatarUrl?: string;
  school?: string;
  city?: string;
  role?: "renter" | "lister" | "both";
  wechat?: string;
  instagram?: string;
  bio?: string;
};

export type EmailCodeResponse = {
  email: string;
  expiresAt: string;
  devCode?: string;
};

export type VerifyEmailResponse = {
  accessToken: string;
  user: SessionUser;
  isNewUser: boolean;
};

export type ApiDealRoom = {
  id: string;
  roommateProfileId: string;
  status: string;
  members?: Array<{
    snapshot?: ApiRoommate;
  }>;
  tourRequest?: {
    status: string;
  } | null;
};

export type ApiRoommateActionResponse = {
  action: {
    action: "LIKE" | "PASS" | "LATER";
  };
  match: {
    id: string;
    status?: string;
  } | null;
  conversation: {
    id: string;
    matchId: string;
  } | null;
  dealRoom?: ApiDealRoom | null;
};

export type ApiRoommateMessage = {
  id: string;
  conversationId: string;
  senderRole: "self" | "peer";
  clientMessageId: string;
  body: string;
  createdAt: string;
};

export type ApiRoommateConversation = {
  id: string;
  matchId: string;
  peer: {
    id: string | null;
    name: string | null;
    age: number | null;
    role: string | null;
    image: string | null;
    match: number | null;
    budget: string | null;
    commute: string | null;
    tags: string[];
  };
  latestMessage: ApiRoommateMessage | null;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  peerLastReadMessageId: string | null;
  peerLastReadAt: string | null;
  writable: boolean;
  lastMessageAt: string | null;
  updatedAt: string;
};

export type ApiRoommateMessagePage = {
  messages: ApiRoommateMessage[];
  nextCursor: string | null;
};

export type ApiRoommateConversationReadState = {
  conversationId: string;
  self: { lastReadMessageId: string | null; lastReadAt: string | null };
  peer: { lastReadMessageId: string | null; lastReadAt: string | null };
};

export type UpsertAdminRoommateInput = {
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
};

export type UpdateAdminRoommateInput = Partial<UpsertAdminRoommateInput> & {
  status?: "active" | "hidden";
};

export type ApiDealMessage = {
  id: string;
  threadId: string;
  senderId?: string | null;
  senderName: string;
  body: string;
  align: "left" | "right";
  status: "received" | "sent";
  createdAt: string;
};

export type ApiViewingRequest = {
  id: string;
  threadId: string;
  requesterId: string;
  listingId: string;
  listingTitle: string;
  area: string;
  timeLabel: string;
  iso: string;
  mode: "in-person" | "video";
  participantNames: string[];
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
};

export type ApiDealThread = {
  id: string;
  ownerId: string;
  listingOwnerId: string;
  viewerRole: "renter" | "host";
  dealRoomId?: string | null;
  listingId: string;
  listingTitle: string;
  area: string;
  contactName: string;
  participantNames: string[];
  messages: ApiDealMessage[];
  viewingRequests: ApiViewingRequest[];
  createdAt: string;
  updatedAt: string;
};

export type CreateDealThreadInput = {
  listingId: string;
  dealRoomId?: string;
};

export type CreateViewingRequestInput = {
  timeLabel: string;
  iso: string;
  mode: "in-person" | "video";
  participantNames: string[];
};

export async function apiGet<T>(path: string, token?: string) {
  return apiRequest<T>(path, { method: "GET" }, token);
}

export async function apiPost<T>(path: string, body: unknown, token?: string) {
  return apiRequest<T>(
    path,
    {
      method: "POST",
      body: JSON.stringify(body)
    },
    token
  );
}

export async function apiPatch<T>(path: string, body: unknown, token?: string) {
  return apiRequest<T>(
    path,
    {
      method: "PATCH",
      body: JSON.stringify(body)
    },
    token
  );
}

export function requestEmailCode(email: string) {
  return apiPost<EmailCodeResponse>("/auth/email-code", { email });
}

export function verifyEmailCode(email: string, code: string) {
  return apiPost<VerifyEmailResponse>("/auth/verify-email", { email, code });
}

export function getSessionUser(token: string) {
  return apiGet<SessionUser>("/auth/me", token);
}

export function getMyProfile(token: string) {
  return apiGet<ApiProfile>("/profiles/me", token);
}

export function updateMyProfile(token: string, profile: UpdateProfileInput) {
  return apiPatch<ApiProfile>("/profiles/me", profile, token);
}

export function getAdminRoommates(token: string) {
  return apiGet<ApiRoommate[]>("/admin/roommates", token);
}

export function createAdminRoommate(token: string, roommate: UpsertAdminRoommateInput) {
  return apiPost<ApiRoommate>("/admin/roommates", roommate, token);
}

export function updateAdminRoommate(token: string, id: string, roommate: UpdateAdminRoommateInput) {
  return apiPatch<ApiRoommate>(`/admin/roommates/${encodeURIComponent(id)}`, roommate, token);
}

export function getRoommateConversations(token: string) {
  return apiGet<ApiRoommateConversation[]>("/roommate-conversations", token);
}

export function getRoommateMessages(token: string, conversationId: string, cursor?: string) {
  const encodedConversationId = encodeURIComponent(conversationId);
  const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
  return apiGet<ApiRoommateMessagePage>(`/roommate-conversations/${encodedConversationId}/messages${query}`, token);
}

export function sendRoommateMessage(
  token: string,
  conversationId: string,
  input: { clientMessageId: string; body: string }
) {
  return apiPost<ApiRoommateMessage>(
    `/roommate-conversations/${encodeURIComponent(conversationId)}/messages`,
    input,
    token
  );
}

export function markRoommateConversationRead(token: string, conversationId: string, lastReadMessageId: string) {
  return apiPost<ApiRoommateConversationReadState>(
    `/roommate-conversations/${encodeURIComponent(conversationId)}/read`,
    { lastReadMessageId },
    token
  );
}

export function archiveAdminRoommate(token: string, id: string) {
  return apiPost<ApiRoommate>(`/admin/roommates/${encodeURIComponent(id)}/archive`, {}, token);
}

async function apiRequest<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  let response: Response;
  const deviceId = getBrowserDeviceId();
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(deviceId ? { "X-Device-ID": deviceId } : {}),
        ...init.headers
      }
    });
  } catch (error) {
    throw toProductApiError(error);
  }

  if (!response.ok) {
    throw productErrorForStatus(response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw productErrorForStatus(502);
  }
}
