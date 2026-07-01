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

async function apiRequest<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
