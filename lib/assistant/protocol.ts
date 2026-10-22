import type { PreviewListing } from "../preview-data";

// Shared by the assistant route handlers (server) and the assistant panel (browser).

export const assistantLimits = {
  messages: 20,
  messageChars: 4000,
  savedListings: 30,
  shownListings: 12,
  draftChars: 300,
  notesChars: 1500
} as const;

export type AssistantTurn = { role: "user" | "assistant"; content: string };

export type AssistantContext = {
  /** The listing page the user is on. */
  listingId?: string;
  savedListingIds?: string[];
  /** Listings shown with the previous answer, in order, so "the second one" resolves. */
  shownListingIds?: string[];
  /** Dates from the page the user is on (search or listing). */
  moveIn?: string;
  moveOut?: string;
};

export type AssistantChatRequest = { messages: AssistantTurn[]; context?: AssistantContext };

export type AssistantListingsEvent = {
  type: "listings";
  listings: PreviewListing[];
  total?: number;
  searchUrl?: string;
  moveIn?: string;
  moveOut?: string;
};

export type AssistantDraftEvent = { type: "draft"; listingId: string; listingTitle: string; body: string };

export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "status"; label: string }
  | AssistantListingsEvent
  | AssistantDraftEvent
  | { type: "done" }
  | { type: "error"; code: string };

export type ListingCopyRequest = {
  notes: string;
  draft: {
    title: string;
    area: string;
    availableFrom: string;
    availableTo: string;
    beds: number;
    baths: number;
    price: number;
    commute: string;
    transit: string;
    tags: string[];
  };
};

export type ListingCopy = { title: string; commute: string; transit: string; tags: string[] };
