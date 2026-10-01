import type { ApiListing, ApiRoommate, ApiRoommateDeckResponse } from "./api";
import { createPreviewListings } from "./preview-data";
import { ProductApiError } from "./product-errors";

export type WebsiteDemoData = ApiListing[] | ApiListing | ApiRoommate | ApiRoommateDeckResponse;

const listingQueryKeys = new Set(["moveIn", "moveOut"]);
const deckQueryKeys = new Set([
  "limit", "cursor", "budgetMin", "budgetMax", "school", "schools",
  "hobby", "hobbies", "city", "gender", "strategy"
]);

/** Public synthetic reads only. This dispatcher never performs a network request. */
export function getWebsiteDemoData(path: string): WebsiteDemoData {
  const { pathname, query } = parseDemoPath(path);
  if (isPrivatePath(pathname)) {
    throw demoError(403, "WEBSITE_DEMO_READ_ONLY", "网站演示仅供浏览，不提供账户、消息、申请或付款服务。");
  }

  if (pathname === "/listings") {
    validateQuery(query, listingQueryKeys);
    const moveIn = query.get("moveIn");
    const moveOut = query.get("moveOut");
    if (moveIn === null && moveOut === null) return demoListings();
    if (!isCalendarDate(moveIn) || !isCalendarDate(moveOut) || moveOut <= moveIn) {
      throw invalidFilter("请提供完整且有效的演示入住和退租日期，退租日期须晚于入住日期。");
    }
    return demoListings().filter((listing) =>
      listing.availableFrom! <= moveIn && listing.availableTo! >= moveOut
    );
  }

  const listingMatch = /^\/listings\/([^/]+)$/.exec(pathname);
  if (listingMatch) {
    validateQuery(query, new Set());
    const listing = demoListings().find((item) => item.id === listingMatch[1]);
    if (listing) return listing;
    throw notFound();
  }

  if (pathname === "/roommates/deck") return demoRoommateDeck(query);
  const roommateMatch = /^\/roommates\/deck\/([^/]+)$/.exec(pathname);
  if (roommateMatch) {
    validateQuery(query, new Set());
    const profile = demoRoommateProfiles().find((item) => item.id === roommateMatch[1]);
    if (profile) return publicDemoRoommate(profile);
  }
  throw notFound();
}

function demoListings(): ApiListing[] {
  return createPreviewListings().map((listing) => ({
    ...listing,
    title: `演示房源 · ${listing.title}`,
    trust: "虚构演示房源 · 非真实房源 · 未经平台审核",
    tags: [...listing.tags],
    ...(listing.images ? { images: [...listing.images] } : {})
  }));
}

type DemoRoommate = ApiRoommate & { demoBudget: number; demoCity: string; demoSchool: string };

function demoRoommateProfiles(): DemoRoommate[] {
  const interiorPhotos = createPreviewListings().slice(0, 6).map((listing) => listing.image);
  const scenarios = [
    { city: "Los Angeles", school: "UCLA", budget: 1200, tags: ["早睡", "安静", "学习友好"] },
    { city: "Los Angeles", school: "USC", budget: 1600, tags: ["会做饭", "爱干净", "健身"] },
    { city: "Boston", school: "Boston University", budget: 1800, tags: ["早睡", "安静", "爱干净"] },
    { city: "Boston", school: "Northeastern University", budget: 2200, tags: ["会做饭", "轻社交", "学习友好"] },
    { city: "Seattle", school: "University of Washington", budget: 2000, tags: ["健身", "安静", "宠物友好"] },
    { city: "New York", school: "New York University", budget: 2400, tags: ["轻社交", "爱干净", "早睡"] }
  ];
  return scenarios.map((scenario, index) => ({
    id: `demo-roommate-${index + 1}`,
    actionTargetId: `demo-roommate-${index + 1}`,
    name: `虚构演示室友 ${String.fromCharCode(65 + index)}`,
    age: 22 + index,
    role: `虚构学生情景 · ${scenario.school}（非实际身份）`,
    image: interiorPhotos[index],
    match: 0,
    budget: `USD $${scenario.budget.toLocaleString("en-US")}/月 · 演示预算`,
    commute: `${scenario.city} · 演示城市，无实际住址`,
    tags: [...scenario.tags],
    reasons: ["此资料完全虚构；图片是室内示意图，未展示真实室友。"],
    demoBudget: scenario.budget,
    demoCity: scenario.city,
    demoSchool: scenario.school
  }));
}

function demoRoommateDeck(query: URLSearchParams): ApiRoommateDeckResponse {
  validateQuery(query, deckQueryKeys);
  const cursor = integerFilter(query, "cursor", 0, 0, 10_000);
  const limit = integerFilter(query, "limit", 24, 1, 24);
  const budgetMin = integerFilter(query, "budgetMin", 0, 0, 100_000);
  const budgetMax = integerFilter(query, "budgetMax", 100_000, 0, 100_000);
  if (budgetMax < budgetMin) throw invalidFilter("演示预算上限须大于或等于下限。");
  const schools = listFilter(query, "school", "schools");
  const hobbies = listFilter(query, "hobby", "hobbies");
  const city = textFilter(query, "city");
  const gender = textFilter(query, "gender");
  const strategy = textFilter(query, "strategy");
  if (gender && gender !== "Open") throw invalidFilter("此演示未提供性别筛选数据。");
  if (strategy && strategy !== "balanced") throw invalidFilter("此演示仅提供公开情景筛选，不提供真实匹配策略。");

  const profiles = demoRoommateProfiles().filter((profile) =>
    profile.demoBudget >= budgetMin && profile.demoBudget <= budgetMax &&
    (!city || normalized(profile.demoCity) === normalized(city)) &&
    (!schools.length || schools.some((school) => normalized(profile.demoSchool) === normalized(school))) &&
    (!hobbies.length || hobbies.every((hobby) => profile.tags.some((tag) => normalized(tag) === normalized(hobby))))
  );
  const items = profiles.slice(cursor, cursor + limit).map(publicDemoRoommate);
  return {
    items,
    pageInfo: {
      cursor,
      nextCursor: cursor + items.length < profiles.length ? cursor + items.length : null,
      limit,
      returned: items.length,
      totalCandidates: profiles.length
    },
    discovery: {
      headline: "虚构室友情景演示；按演示预算、城市、学校与生活标签筛选，未计算真实匹配。",
      sampleSize: profiles.length,
      topScore: 0,
      filters: {
        budgetMin, budgetMax, school: schools.join(","), schools,
        hobby: hobbies.join(","), hobbies, city, gender: "Open", strategy: "balanced"
      },
      tips: ["所有资料均为虚构；学校和城市只用于演示筛选，图片不代表真实室友。"]
    }
  };
}

function publicDemoRoommate(profile: DemoRoommate): ApiRoommate {
  const { demoBudget: _budget, demoCity: _city, demoSchool: _school, ...publicProfile } = profile;
  return publicProfile;
}

function parseDemoPath(path: string) {
  if (typeof path !== "string" || path.length > 2048 || !path.startsWith("/") ||
      path.startsWith("//") || /[\u0000-\u0020\u007f\\#]/.test(path)) throw notFound();
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { throw notFound(); }
  if (/[\u0000-\u001f\u007f\\#]/.test(decoded)) throw notFound();

  const separator = path.indexOf("?");
  const rawPathname = separator < 0 ? path : path.slice(0, separator);
  const segments = rawPathname.split("/").slice(1).map((segment) => {
    const value = decodeURIComponent(segment);
    if (!value || value === "." || value === ".." || /[/\\?#%]/.test(value)) throw notFound();
    return value;
  });
  return {
    pathname: `/${segments.join("/")}`,
    query: new URLSearchParams(separator < 0 ? "" : path.slice(separator + 1))
  };
}

function isPrivatePath(pathname: string) {
  return /^\/(?:auth|profiles|admin|trust|payments|demo-payments|demo-held-funds|applications|deal-threads|deal-rooms|roommate-conversations|roommate-teams|trips|groups)(?:\/|$)/.test(pathname) ||
    pathname === "/listings/mine" || pathname === "/roommates/activity" ||
    /^\/listings\/[^/]+\/(?:media|submit)(?:\/|$)/.test(pathname) ||
    /^\/roommates\/[^/]+\/actions(?:\/|$)/.test(pathname);
}

function validateQuery(query: URLSearchParams, allowed: Set<string>) {
  for (const key of query.keys()) {
    if (!allowed.has(key) || query.getAll(key).length !== 1) {
      throw invalidFilter("演示请求包含不支持或重复的筛选参数。");
    }
  }
}

function integerFilter(query: URLSearchParams, key: string, fallback: number, min: number, max: number) {
  const value = query.get(key);
  if (value === null) return fallback;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw invalidFilter("演示分页和预算须使用有效的非负整数。");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw invalidFilter("演示分页或预算超出支持范围。");
  return result;
}

function textFilter(query: URLSearchParams, key: string) {
  const value = (query.get(key) ?? "").trim();
  if (value.length > 220) throw invalidFilter("演示筛选内容过长。");
  return value;
}

function listFilter(query: URLSearchParams, single: string, plural: string) {
  if (query.has(single) && query.has(plural)) throw invalidFilter("请只提供一种演示学校或标签筛选参数。");
  const values = textFilter(query, query.has(plural) ? plural : single).split(",").map((value) => value.trim()).filter(Boolean);
  if (values.length > 8) throw invalidFilter("演示筛选最多支持八个学校或标签。");
  return Array.from(new Set(values));
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalized(value: string) { return value.trim().toLowerCase(); }
function invalidFilter(message: string) { return demoError(400, "WEBSITE_DEMO_FILTER_INVALID", message); }
function notFound() { return demoError(404, "WEBSITE_DEMO_NOT_FOUND", "未找到该演示内容。"); }
function demoError(status: number, code: string, message: string) {
  return new ProductApiError({
    category: status === 403 ? "permission" : "validation",
    code, message, status, retryable: false
  });
}
