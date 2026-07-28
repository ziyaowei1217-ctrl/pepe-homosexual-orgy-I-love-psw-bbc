import { productErrorForStatus, toProductApiError } from "./product-errors";

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

export type ApiRoommate = {
  id?: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
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
  dealRoom: ApiDealRoom | null;
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

async function apiRequest<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
