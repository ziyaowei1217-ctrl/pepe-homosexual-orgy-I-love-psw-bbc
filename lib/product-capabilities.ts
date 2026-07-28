import type { ApiProfile } from "./api";

export type ProductCapability =
  | "browse-listings"
  | "favorite-listing"
  | "message-host"
  | "request-viewing"
  | "roommate-action"
  | "publish-listing"
  | "date-filter"
  | "application"
  | "payment"
  | "escrow"
  | "roommate-message";

export type ProductCapabilityStatus =
  | "allowed"
  | "requires-auth"
  | "unavailable"
  | "api-offline";

export type ProductCapabilityContext = {
  authenticated: boolean;
  apiOnline: boolean;
  profileRole?: ApiProfile["role"];
  datesAvailable?: boolean;
};

export type ProductCapabilityResult = {
  status: ProductCapabilityStatus;
  message: string;
};

const protectedCapabilities = new Set<ProductCapability>([
  "favorite-listing",
  "message-host",
  "request-viewing",
  "roommate-action",
  "publish-listing"
]);

const unavailableCapabilities = new Set<ProductCapability>([
  "application",
  "payment",
  "escrow",
  "roommate-message"
]);

export function checkProductCapability(
  capability: ProductCapability,
  context: ProductCapabilityContext
): ProductCapabilityResult {
  if (unavailableCapabilities.has(capability)) {
    return { status: "unavailable", message: "此功能暂未开放。" };
  }

  if (capability === "date-filter") {
    return context.datesAvailable
      ? { status: "allowed", message: "" }
      : { status: "unavailable", message: "日期筛选暂未开放。" };
  }

  if (protectedCapabilities.has(capability) && !context.authenticated) {
    return { status: "requires-auth", message: "请先登录后继续。" };
  }

  if (
    capability === "publish-listing" &&
    context.profileRole !== "lister" &&
    context.profileRole !== "both"
  ) {
    return {
      status: "unavailable",
      message: "请先在个人资料中将身份设为房东或租客兼房东。"
    };
  }

  if (capability !== "browse-listings" && !context.apiOnline) {
    return {
      status: "api-offline",
      message: "服务暂时不可用，请稍后重试。"
    };
  }

  if (capability === "browse-listings" && !context.apiOnline) {
    return {
      status: "api-offline",
      message: "房源服务暂时不可用，请稍后重试。"
    };
  }

  return { status: "allowed", message: "" };
}
