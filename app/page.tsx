"use client";

import {
  ArrowRight,
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coffee,
  DollarSign,
  DoorOpen,
  Heart,
  Home,
  LocateFixed,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  PawPrint,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrainFront,
  UserCheck,
  Users,
  WalletCards,
  Wifi,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RoommateFirstWorkspace } from "@/components/roommate-first-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  apiGet,
  apiPost,
  type ApiDealRoom,
  type ApiGroup,
  type ApiListing,
  type ApiRoommate,
  type ApiRoommateActionResponse,
  type ApiTrip,
  type ApiTrustQueue,
  type SessionUser
} from "@/lib/api";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  applyFlexibleStay,
  buildCalendarMonths,
  compareIsoDates,
  countNights,
  formatDateRangeLabel,
  formatShortDate,
  selectDateRange,
  type DateRange
} from "@/lib/date-range";
import { getVisibleSelectedListing } from "@/lib/listing-selection";
import {
  buildListingDetail,
  buildListingGallery,
  getGalleryIndex,
  getListingFlowStatus
} from "@/lib/listing-detail";
import { getListingStatusMeta, sortOwnerListings, type ListingStatus } from "@/lib/landlord-listings";
import { buildSearchInsight } from "@/lib/search-insights";
import {
  getListingCoordinates,
  getMapCenterForListings,
  getMapMarkers,
  getMapTiles,
  type MapSize,
  type MapPoint
} from "@/lib/listing-map";

type Listing = {
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
};

type Roommate = {
  id?: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  origin?: string;
  tags: string[];
};

type AppSection = "Discover" | "ListingDetail" | "Roommates" | "Groups" | "Publish" | "Trips" | "Trust";

type ViewMode = "map" | "list";

type SearchFilters = {
  query: string;
  checkIn: string;
  checkOut: string;
  budget: number;
  amenity: string;
};

type PublishDraft = {
  title: string;
  area: string;
  price: number;
  beds: number;
  baths: number;
};

type QueueItem = {
  id?: string;
  label: string;
  value: number;
  icon: LucideIcon;
  variant: "trust" | "warning" | "danger" | "success";
};

const seedListings: Listing[] = [];

const listingImages = [
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448075-bb485b067938?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448205-4d9b3e6bb6db?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1200&q=80"
];

const listingAreas = [
  "Los Angeles · Westwood",
  "Los Angeles · Koreatown",
  "Los Angeles · Culver City",
  "Los Angeles · Santa Monica",
  "Los Angeles · Silver Lake",
  "Los Angeles · Pasadena",
  "Los Angeles · DTLA",
  "Los Angeles · USC North",
  "Los Angeles · Hollywood",
  "Los Angeles · Burbank",
  "Los Angeles · Sawtelle",
  "Los Angeles · Glendale",
  "Los Angeles · Mar Vista",
  "Los Angeles · Echo Park",
  "Los Angeles · Playa Vista",
  "Los Angeles · North Hollywood",
  "Los Angeles · Los Feliz",
  "Los Angeles · Brentwood",
  "Los Angeles · Arts District",
  "Los Angeles · El Segundo"
];

const listingTitles = [
  "UCLA 步行圈阳光主卧",
  "地铁口 2B2B 合租",
  "实习通勤友好 1B1B",
  "海边 Studio 转租",
  "安静次卧短租",
  "Caltech 附近主卧",
  "高层 Loft",
  "3B2B Group 优选",
  "景观 1B",
  "影视实习友好次卧",
  "日系街区主卧",
  "安全小区 2B1B",
  "采光 Studio",
  "湖边合租房",
  "科技园 1B1B",
  "地铁旁 2B",
  "复古公寓主卧",
  "明亮 1B 转租",
  "工业风 Loft",
  "海边通勤 2B2B"
];

const listingTagSets = [
  ["独卫", "电梯", "可 8/20 入住"],
  ["整租", "宠物友好", "Group 推荐"],
  ["健身房", "门卫", "可短租"],
  ["近地铁", "洗烘", "视频验房"],
  ["无烟", "采光好", "房东知情"],
  ["带家具", "可做饭", "首日保障"]
];

const trustLabels = [
  ".edu 已认证 · 房东知情",
  "三方协议模板 · 视频验房",
  "企业邮箱认证 · 首日保障",
  "原租客高分 · 合同存证",
  "金牌转租人 · 低纠纷记录"
];

const commuteTargets = [
  "UCLA",
  "USC",
  "Santa Monica",
  "Culver City",
  "Caltech",
  "DTLA",
  "Burbank Studios",
  "Silicon Beach",
  "Hollywood",
  "LAX"
];

function createListings(): Listing[] {
  const generated = Array.from({ length: 20 }, (_, index) => {
    if (seedListings[index]) return seedListings[index];

    const area = listingAreas[index % listingAreas.length];
    const neighborhood = area.split(" · ")[1];
    const title = `${neighborhood} ${listingTitles[index % listingTitles.length]}`;
    const beds = (index % 4) + 1;
    const baths = Math.min(3, Math.max(1, beds - (index % 2)));
    const price = 980 + ((index * 137) % 3100);
    const originalPrice = price + 180 + ((index * 41) % 420);
    const commuteMinutes = 8 + ((index * 5) % 28);
    const transitMinutes = commuteMinutes + 6 + (index % 12);
    const target = commuteTargets[index % commuteTargets.length];

    return {
      id: String(index + 1),
      title,
      area,
      image: listingImages[index % listingImages.length],
      price,
      originalPrice,
      beds,
      baths,
      commute: `${index % 3 === 0 ? "步行" : index % 3 === 1 ? "轻轨" : "骑行"} ${commuteMinutes} 分钟到 ${target}`,
      transit: `公共交通 ${transitMinutes} 分钟 · ${neighborhood}`,
      trust: trustLabels[index % trustLabels.length],
      tags: listingTagSets[index % listingTagSets.length],
      score: Number((4.62 + ((index * 7) % 37) / 100).toFixed(2))
    };
  });

  return generated;
}

const seedRoommates: Roommate[] = [];

const roommateImages = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?auto=format&fit=crop&w=900&q=80"
];

const roommateNames = [
  "Mia Chen",
  "Ethan Liu",
  "Ava Zhang",
  "Leo Wang",
  "Sophie Lin",
  "Kevin Zhou",
  "Grace Xu",
  "Ryan Wu",
  "Ivy Huang",
  "Daniel Kim",
  "Nora Li",
  "Jason Yu",
  "Emily Zhao",
  "Aaron Sun",
  "Claire Guo",
  "Victor Tan",
  "Olivia Park",
  "Mark Chen",
  "Selina Ho",
  "Brian Ma"
];

const roommateRoles = [
  "UCLA MSBA · 秋季入学",
  "Culver City Product Intern",
  "USC Viterbi · CS",
  "Caltech Research Assistant",
  "Otis Design · Junior",
  "Burbank Studio Intern",
  "UCLA Extension · Film",
  "DTLA Finance Analyst",
  "USC Marshall · Fall",
  "Santa Monica SWE",
  "LMU MBA · Evening",
  "Glendale Animation Intern",
  "Pasadena ArtCenter",
  "El Segundo Aerospace PM",
  "Koreatown Healthcare Admin",
  "North Hollywood Editor",
  "UCLA Public Health",
  "Arts District Designer",
  "USC Annenberg",
  "Silver Lake Startup Ops"
];

const roommateTagSets = [
  ["早睡", "少做饭", "无宠物", "安静"],
  ["可合租", "周末社交", "爱干净", "健身"],
  ["会做饭", "猫友好", "不抽烟", "稳定"],
  ["通勤优先", "轻社交", "预算稳定", "长租可谈"],
  ["咖啡党", "不熬夜", "整洁", "接受访客"],
  ["宠物友好", "做饭频繁", "安静学习", "AA 清楚"]
];

function createRoommates(): Roommate[] {
  const commuteZones = [
    "Westwood / Sawtelle",
    "Culver City / Santa Monica",
    "USC North / DTLA",
    "Pasadena / Glendale",
    "Playa Vista / Culver City",
    "Burbank / Hollywood",
    "DTLA / Arts District",
    "Koreatown / USC"
  ];

  return Array.from({ length: 20 }, (_, index) => {
    if (seedRoommates[index]) return seedRoommates[index];

    const budget = 1150 + ((index * 73) % 950);

    return {
      name: roommateNames[index % roommateNames.length],
      age: 20 + (index % 9),
      role: roommateRoles[index % roommateRoles.length],
      image: roommateImages[index % roommateImages.length],
      match: 82 + ((index * 3) % 17),
      budget: `$${budget.toLocaleString()}/月`,
      commute: commuteZones[index % commuteZones.length],
      tags: roommateTagSets[index % roommateTagSets.length]
    };
  });
}

const listings = createListings();
const roommates = createRoommates();

const navItems: Array<{ label: string; section: AppSection }> = [
  { label: "Discover", section: "Discover" },
  { label: "Match", section: "Roommates" },
  { label: "Deal Room", section: "Groups" },
  { label: "Publish", section: "Publish" },
  { label: "Trips", section: "Trips" },
  { label: "Trust", section: "Trust" }
];
const amenities = [
  { label: "Wi-Fi", icon: Wifi },
  { label: "独卫", icon: Bath },
  { label: "宠物", icon: PawPrint },
  { label: "近地铁", icon: TrainFront }
];

const defaultSearchFilters: SearchFilters = {
  query: "Los Angeles",
  checkIn: "2026-08-20",
  checkOut: "2026-11-30",
  budget: 4200,
  amenity: "Wi-Fi"
};

const defaultMapViewportSize = {
  width: 420,
  height: 360
};

function normalizeListing(listing: ApiListing): Listing {
  return {
    id: String(listing.id),
    title: listing.title,
    area: listing.area,
    image: listing.image,
    price: listing.price,
    originalPrice: listing.originalPrice,
    beds: listing.beds,
    baths: listing.baths,
    commute: listing.commute,
    transit: listing.transit,
    trust: listing.trust,
    tags: listing.tags,
    score: listing.score
  };
}

function normalizeRoommate(roommate: ApiRoommate): Roommate {
  return {
    id: roommate.id,
    name: roommate.name,
    age: roommate.age,
    role: roommate.role,
    image: roommate.image,
    match: roommate.match,
    budget: roommate.budget,
    commute: roommate.commute,
    tags: roommate.tags
  };
}

function getRoommatesFromDealRooms(dealRooms: ApiDealRoom[]): Roommate[] {
  const seen = new Set<string>();
  const members = dealRooms.flatMap((room) => room.members ?? []);

  return members.flatMap((member) => {
    if (!member.snapshot) return [];
    const roommate = normalizeRoommate(member.snapshot);
    const key = roommate.id ?? roommate.name;
    if (seen.has(key)) return [];
    seen.add(key);

    return [roommate];
  });
}

export default function HomePage() {
  const [allListings, setAllListings] = useState(listings);
  const [selectedListing, setSelectedListing] = useState(listings[0]);
  const [apiRoommates, setApiRoommates] = useState<Roommate[]>(roommates);
  const [apiGroups, setApiGroups] = useState<ApiGroup[]>([]);
  const [apiTrips, setApiTrips] = useState<ApiTrip[]>([]);
  const [apiTrustQueues, setApiTrustQueues] = useState<ApiTrustQueue[]>([]);
  const [roommateIndex, setRoommateIndex] = useState(0);
  const [activeSection, setActiveSection] = useState<AppSection>("Roommates");
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [filters, setFilters] = useState<SearchFilters>(defaultSearchFilters);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set(["1"]));
  const [contactedListingIds, setContactedListingIds] = useState<Set<string>>(new Set());
  const [tourRequestedListingIds, setTourRequestedListingIds] = useState<Set<string>>(new Set());
  const [appliedListingId, setAppliedListingId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Roommate[]>([]);
  const [likedRoommateIds, setLikedRoommateIds] = useState<Set<string>>(new Set());
  const [skippedCount, setSkippedCount] = useState(0);
  const [tourRequested, setTourRequested] = useState(false);
  const [escrowStep, setEscrowStep] = useState(2);
  const [toast, setToast] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeDealRoomId, setActiveDealRoomId] = useState<string | null>(null);
  const [myListings, setMyListings] = useState<ApiListing[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("sublet_token");
    if (storedToken) setToken(storedToken);
  }, []);

  useEffect(() => {
    async function loadApiData() {
      try {
        const [apiListings, apiRoommateData, apiGroupData, apiTripData, apiQueueData] =
          await Promise.all([
            apiGet<ApiListing[]>("/listings"),
            apiGet<ApiRoommate[]>("/roommates"),
            apiGet<ApiGroup[]>("/groups"),
            apiGet<ApiTrip[]>("/trips"),
            apiGet<ApiTrustQueue[]>("/trust/queues")
          ]);

        const normalizedListings = apiListings.map(normalizeListing);
        const normalizedRoommates = apiRoommateData.map(normalizeRoommate);
        setAllListings(normalizedListings);
        setSelectedListing((current) => normalizedListings.find((listing) => listing.id === current.id) ?? normalizedListings[0] ?? current);
        setApiRoommates(normalizedRoommates);
        setGroupMembers([]);
        setApiGroups(apiGroupData);
        setApiTrips(apiTripData);
        setApiTrustQueues(apiQueueData);
        setApiError(null);
        setToast("已从后端 API 加载数据");
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "后端 API 不可用");
      }
    }

    void loadApiData();
  }, []);

  useEffect(() => {
    async function loadMe() {
      if (!token) return;
      try {
        const currentUser = await apiGet<SessionUser>("/auth/me", token);
        setUser(currentUser);
      } catch {
        window.localStorage.removeItem("sublet_token");
        setToken(null);
        setUser(null);
      }
    }

    void loadMe();
  }, [token]);

  useEffect(() => {
    async function loadAuthenticatedWorkspace() {
      if (!token) {
        setMyListings([]);
        setActiveDealRoomId(null);
        return;
      }

      try {
        const [ownedListings, dealRooms] = await Promise.all([
          apiGet<ApiListing[]>("/listings/mine", token),
          apiGet<ApiDealRoom[]>("/deal-rooms/active", token)
        ]);
        const sortedListings = sortOwnerListings(
          ownedListings.filter((listing): listing is ApiListing & { status: ListingStatus } => Boolean(listing.status))
        );
        const dealRoomMembers = getRoommatesFromDealRooms(dealRooms);

        setMyListings(sortedListings);
        setActiveDealRoomId(dealRooms[0]?.id ?? null);
        setLikedRoommateIds(new Set(dealRooms.map((room) => room.roommateProfileId)));
        if (dealRoomMembers.length > 0) setGroupMembers(dealRoomMembers.slice(-4));
        setTourRequested(dealRooms.some((room) => room.tourRequest?.status === "REQUESTED"));
      } catch (error) {
        setToast(error instanceof Error ? error.message : "登录工作台加载失败");
      }
    }

    void loadAuthenticatedWorkspace();
  }, [token]);

  const roommate = apiRoommates[roommateIndex] ?? apiRoommates[0] ?? roommates[0];
  const roommateKey = roommate.id ?? roommate.name;
  const canRequestTour = likedRoommateIds.has(roommateKey);
  const filteredListings = useMemo(
    () =>
      allListings.filter((listing) => {
        const query = filters.query.trim().toLowerCase();
        const haystack = [
          listing.title,
          listing.area,
          listing.commute,
          listing.transit,
          listing.trust,
          ...listing.tags
        ]
          .join(" ")
          .toLowerCase();
        const matchesQuery = !query || haystack.includes(query) || query === "la";
        const matchesBudget = listing.price <= filters.budget || listing.tags.includes("Group 推荐");
        const matchesAmenity =
          filters.amenity === "Wi-Fi" ||
          haystack.includes(filters.amenity.toLowerCase()) ||
          (filters.amenity === "独卫" && (listing.baths > 1 || listing.tags.includes("独卫"))) ||
          (filters.amenity === "宠物" && listing.tags.some((tag) => tag.includes("宠物"))) ||
          (filters.amenity === "近地铁" && (listing.transit.includes("地铁") || listing.tags.includes("近地铁")));

        return matchesQuery && matchesBudget && matchesAmenity;
      }),
    [allListings, filters]
  );
  const visibleListings = filteredListings;
  const visibleSelectedListing = getVisibleSelectedListing(selectedListing, visibleListings);
  const groupBudget = useMemo(() => {
    const total = groupMembers.reduce((sum, member) => {
      const amount = Number(member.budget.replace(/[^0-9]/g, ""));
      return sum + amount;
    }, 0);

    return `$${total.toLocaleString()}/月`;
  }, [groupMembers]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, [activeSection]);

  function cycleRoommate(direction: 1 | -1) {
    setRoommateIndex((current) => {
      const next = current + direction;
      if (next < 0) return apiRoommates.length - 1;
      if (next >= apiRoommates.length) return 0;
      return next;
    });
  }

  function handleAmenityChange(amenity: string) {
    setFilters((current) => ({ ...current, amenity }));
    setToast(`已筛选设施：${amenity}`);
  }

  function handleFavorite(listingId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(listingId)) {
        next.delete(listingId);
        setToast("已取消收藏");
      } else {
        next.add(listingId);
        setToast("已加入收藏");
      }
      return next;
    });
  }

  function openListingDetail(listing: Listing) {
    setSelectedListing(listing);
    setActiveSection("ListingDetail");
    setToast(`正在查看房源详情：${listing.title}`);
  }

  function handleContactListing(listing: Listing) {
    setContactedListingIds((current) => new Set(current).add(listing.id));
    setToast(`已联系房东：${listing.title}`);
  }

  function handleRequestListingTour(listing: Listing) {
    setTourRequestedListingIds((current) => new Set(current).add(listing.id));
    setToast(`已预约看房：${listing.title}`);
  }

  function handleStartApplication(listing: Listing) {
    setAppliedListingId(listing.id);
    setSelectedListing(listing);
    setEscrowStep(0);
    setActiveSection("Trips");
    setToast(`已为 ${listing.title} 开始申请流程`);
  }

  async function handleAcceptRoommate() {
    setLikedRoommateIds((current) => new Set(current).add(roommateKey));
    setGroupMembers((current) => {
      if (current.some((member) => member.name === roommate.name)) return current;
      return [...current, roommate].slice(-4);
    });
    setTourRequested(false);
    if (!token || !roommate.id) {
      setToast(`${roommate.name} 已匹配，Deal Room 已更新`);
      return;
    }

    try {
      const response = await apiPost<ApiRoommateActionResponse>(
        `/roommates/${roommate.id}/actions`,
        { action: "LIKE" },
        token
      );
      setActiveDealRoomId(response.dealRoom?.id ?? null);
      setToast(`${roommate.name} 已匹配，Deal Room 已同步`);
    } catch (error) {
      setToast(error instanceof Error ? `本地已匹配，后端同步失败：${error.message}` : "本地已匹配，后端同步失败");
    }
  }

  async function handleRejectRoommate() {
    const rejectedRoommate = roommate;
    setSkippedCount((current) => current + 1);
    setTourRequested(false);
    setToast(`已跳过 ${rejectedRoommate.name}`);
    cycleRoommate(1);

    if (!token || !rejectedRoommate.id) return;

    try {
      await apiPost(`/roommates/${rejectedRoommate.id}/actions`, { action: "PASS" }, token);
    } catch (error) {
      setToast(error instanceof Error ? `跳过已保留，本地同步成功；后端失败：${error.message}` : "跳过已保留，本地同步成功；后端失败");
    }
  }

  async function handleLaterRoommate() {
    const laterRoommate = roommate;
    setTourRequested(false);
    setToast(`${laterRoommate.name} 已放入稍后查看`);
    cycleRoommate(1);

    if (!token || !laterRoommate.id) return;

    try {
      await apiPost(`/roommates/${laterRoommate.id}/actions`, { action: "LATER" }, token);
    } catch (error) {
      setToast(error instanceof Error ? `稍后查看已保留，本地同步成功；后端失败：${error.message}` : "稍后查看已保留，本地同步成功；后端失败");
    }
  }

  async function handleRequestGroupTour() {
    if (!canRequestTour) {
      setToast("先 Like 室友，再发起 Group Tour");
      return;
    }

    if (token) {
      if (!activeDealRoomId) {
        setToast("Deal Room 还在同步，请稍后再发起 Group Tour");
        return;
      }

      try {
        await apiPost(`/deal-rooms/${activeDealRoomId}/tour-requests`, {}, token);
        setTourRequested(true);
        setToast("已发送 Group Tour 请求");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Group Tour 请求失败");
      }
      return;
    }

    setTourRequested(true);
    setToast("已发送 Group Tour 请求");
  }

  async function handleCreateListing(draft: PublishDraft) {
    if (!token) {
      setToast("请先用邮箱验证码登录，再发布房源");
      setActiveSection("Discover");
      return;
    }

    setIsPublishing(true);
    const payload = {
      title: draft.title,
      area: draft.area,
      image: listingImages[allListings.length % listingImages.length],
      price: draft.price,
      originalPrice: draft.price + 320,
      beds: draft.beds,
      baths: draft.baths,
      commute: "步行 15 分钟到 UCLA",
      transit: "地铁 22 分钟 · 新发布房源",
      trust: "房东知情 · 待审核",
      tags: ["新发布", "视频验房", "房东知情"],
      score: 4.8
    };

    try {
      const createdListing = await apiPost<ApiListing>("/listings", payload, token);

      try {
        await apiPost<ApiListing>(`/listings/${createdListing.id}/submit`, {}, token);
        setToast(`${draft.title} 已创建并提交审核`);
      } catch (error) {
        setToast(error instanceof Error ? `${draft.title} 已创建为草稿，提交审核失败：${error.message}` : `${draft.title} 已创建为草稿，提交审核失败`);
      }

      const ownedListings = await apiGet<ApiListing[]>("/listings/mine", token);
      setMyListings(
        sortOwnerListings(
          ownedListings.filter((listing): listing is ApiListing & { status: ListingStatus } => Boolean(listing.status))
        )
      );
      setActiveSection("Publish");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "房源创建失败");
    } finally {
      setIsPublishing(false);
    }
  }

  function advanceEscrow() {
    setEscrowStep((current) => Math.min(current + 1, 4));
    setToast("交易托管状态已更新");
  }

  const showAuthStrip = activeSection === "Publish";

  return (
    <main className="min-h-screen bg-background">
      <AppHeader
        favoriteCount={favoriteIds.size}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        user={user}
      />
      {showAuthStrip ? (
        <AuthStrip
          token={token}
          user={user}
          apiError={apiError}
          onToken={(nextToken) => {
            window.localStorage.setItem("sublet_token", nextToken);
            setToken(nextToken);
          }}
          onLogout={() => {
            window.localStorage.removeItem("sublet_token");
            setToken(null);
            setUser(null);
            setToast("已退出登录");
          }}
          onToast={setToast}
        />
      ) : null}
      {activeSection === "Discover" ? (
        <DiscoverScreen
          filters={filters}
          listings={visibleListings}
          selectedListing={visibleSelectedListing}
          favoriteIds={favoriteIds}
          viewMode={viewMode}
          onFiltersChange={setFilters}
          onAmenityChange={handleAmenityChange}
          onClear={() => {
            setFilters({ ...defaultSearchFilters, query: "" });
            setToast("筛选条件已重置");
          }}
          onSelect={(listing) => {
            openListingDetail(listing);
          }}
          onFavorite={handleFavorite}
          onViewModeChange={setViewMode}
          onOpenRoommates={() => setActiveSection("Roommates")}
        />
      ) : null}
      {activeSection === "ListingDetail" ? (
        <ListingDetailScreen
          listing={selectedListing}
          filters={filters}
          favoriteIds={favoriteIds}
          contactedIds={contactedListingIds}
          tourRequestedIds={tourRequestedListingIds}
          appliedListingId={appliedListingId}
          groupMembers={groupMembers}
          roommate={roommate}
          onBack={() => setActiveSection("Discover")}
          onFavorite={handleFavorite}
          onContact={handleContactListing}
          onRequestTour={handleRequestListingTour}
          onApply={handleStartApplication}
          onOpenRoommates={() => setActiveSection("Roommates")}
        />
      ) : null}
      {activeSection === "Roommates" ? (
        <RoommateFirstWorkspace
          roommate={roommate}
          roommates={apiRoommates}
          listings={allListings}
          groupMembers={groupMembers}
          activeIndex={roommateIndex}
          skippedCount={skippedCount}
          likedCount={likedRoommateIds.size}
          favoriteIds={favoriteIds}
          canRequestTour={canRequestTour}
          tourRequested={tourRequested}
          onReject={handleRejectRoommate}
          onLater={handleLaterRoommate}
          onLike={handleAcceptRoommate}
          onFavoriteListing={handleFavorite}
          onSelectListing={(listing) => {
            openListingDetail(listing);
          }}
          onRequestTour={handleRequestGroupTour}
          onOpenDiscover={() => setActiveSection("Discover")}
        />
      ) : null}
      {activeSection === "Groups" ? (
        <GroupsScreen
          groupBudget={groupBudget}
          members={groupMembers}
          listings={allListings.slice(0, 6)}
          groups={apiGroups}
          onRemoveMember={(name) => {
            setGroupMembers((current) => current.filter((member) => member.name !== name));
            setToast(`${name} 已移出 Group`);
          }}
          onSelectListing={(listing) => {
            openListingDetail(listing);
          }}
        />
      ) : null}
      {activeSection === "Publish" ? (
        <PublishScreen
          isPublishing={isPublishing}
          listings={myListings}
          user={user}
          onCreate={handleCreateListing}
        />
      ) : null}
      {activeSection === "Trips" ? (
        <TripsScreen
          listing={selectedListing}
          trips={apiTrips}
          currentStep={escrowStep}
          onAdvance={advanceEscrow}
        />
      ) : null}
      {activeSection === "Trust" ? (
        <TrustScreen queues={apiTrustQueues} onToast={setToast} />
      ) : null}
      <StatusToast message={toast} />
    </main>
  );
}

function AppHeader({
  favoriteCount,
  activeSection,
  onSectionChange,
  user
}: {
  favoriteCount: number;
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  user: SessionUser | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 xl:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Home className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-base font-bold text-primary">Sublet Pipeline</div>
            <div className="text-xs font-semibold text-muted-foreground">
              Marketplace & Co-living
            </div>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Button
              key={item.section}
              variant={activeSection === item.section ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onSectionChange(item.section)}
            >
              {item.label}
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <Heart data-icon="inline-start" />
            {favoriteCount} 收藏
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <ShieldCheck data-icon="inline-start" />
            {user ? user.email : ".edu Verified"}
          </Button>
          <Button
            variant="trust"
            size="sm"
            className="max-sm:size-10 max-sm:px-0"
            onClick={() => onSectionChange("Publish")}
          >
            <DoorOpen data-icon="inline-start" />
            <span className="max-sm:sr-only">发布房源</span>
          </Button>
        </div>
      </div>
      <div className="border-t bg-white md:hidden">
        <div className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4 py-2">
          {navItems.map((item) => (
            <Button
              key={item.section}
              variant={activeSection === item.section ? "secondary" : "ghost"}
              size="sm"
              className="shrink-0"
              onClick={() => onSectionChange(item.section)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}

function AuthStrip({
  token,
  user,
  apiError,
  onToken,
  onLogout,
  onToast
}: {
  token: string | null;
  user: SessionUser | null;
  apiError: string | null;
  onToken: (token: string) => void;
  onLogout: () => void;
  onToast: (message: string) => void;
}) {
  const [email, setEmail] = useState("student@ucla.edu");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function requestCode() {
    setPending(true);
    try {
      const response = await apiPost<{ devCode?: string }>("/auth/email-code", { email });
      if (response.devCode) setCode(response.devCode);
      onToast(response.devCode ? `开发验证码：${response.devCode}` : "验证码已发送");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    setPending(true);
    try {
      const response = await apiPost<{ accessToken: string; user: SessionUser }>(
        "/auth/verify-email",
        { email, code }
      );
      onToken(response.accessToken);
      onToast(`已登录：${response.user.email}`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border-b bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between xl:px-6">
        <div className="min-w-0">
          <div className="text-sm font-bold text-primary">
            {user ? `已登录 ${user.email}` : "邮箱验证码登录"}
          </div>
          <div className="text-xs font-semibold text-muted-foreground">
            {apiError ? `API 状态：${apiError}` : "API 已连接时，房源与发布会写入后端"}
          </div>
        </div>
        {token && user ? (
          <Button variant="outline" size="sm" onClick={onLogout}>
            退出登录
          </Button>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_110px_auto_auto]">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="student@ucla.edu"
            />
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="验证码"
            />
            <Button variant="outline" size="sm" onClick={requestCode} disabled={pending}>
              发送验证码
            </Button>
            <Button variant="trust" size="sm" onClick={verifyCode} disabled={pending || code.length !== 6}>
              登录
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function DiscoverScreen({
  filters,
  listings,
  selectedListing,
  favoriteIds,
  viewMode,
  onFiltersChange,
  onAmenityChange,
  onClear,
  onSelect,
  onFavorite,
  onViewModeChange,
  onOpenRoommates
}: {
  filters: SearchFilters;
  listings: Listing[];
  selectedListing: Listing;
  favoriteIds: Set<string>;
  viewMode: ViewMode;
  onFiltersChange: (filters: SearchFilters) => void;
  onAmenityChange: (value: string) => void;
  onClear: () => void;
  onSelect: (listing: Listing) => void;
  onFavorite: (id: string) => void;
  onViewModeChange: (value: ViewMode) => void;
  onOpenRoommates: () => void;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 xl:px-6">
      <SearchHero
        filters={filters}
        resultCount={listings.length}
        onFiltersChange={onFiltersChange}
        onAmenityChange={onAmenityChange}
        onClear={onClear}
      />

      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          viewMode === "map" && "lg:grid-cols-[minmax(0,760px)_minmax(420px,1fr)]"
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <MarketToolbar
            listingCount={listings.length}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            favoriteCount={favoriteIds.size}
            dateRangeLabel={formatDateRangeLabel(filters)}
            onOpenRoommates={onOpenRoommates}
          />
          {listings.length === 0 ? (
            <EmptyResults filters={filters} onClear={onClear} />
          ) : (
            <ListingGrid
              listings={listings.slice(0, 24)}
              selectedId={selectedListing.id}
              favoriteIds={favoriteIds}
              onSelect={onSelect}
              onFavorite={onFavorite}
            />
          )}
        </div>

        {viewMode === "map" ? (
          <aside className="hidden min-w-0 lg:block">
            <MapCanvas
              className="sticky top-24"
              listings={listings.slice(0, 6)}
              selectedListing={selectedListing}
              onSelect={onSelect}
            />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function SearchHero({
  filters,
  resultCount,
  onFiltersChange,
  onAmenityChange,
  onClear
}: {
  filters: SearchFilters;
  resultCount: number;
  onFiltersChange: (filters: SearchFilters) => void;
  onAmenityChange: (value: string) => void;
  onClear: () => void;
}) {
  const insight = buildSearchInsight(filters, resultCount);

  return (
    <Card className="shadow-panel">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1.2fr)_minmax(320px,0.9fr)_minmax(220px,0.8fr)_auto] lg:items-end">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            目的地
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                value={filters.query}
                onChange={(event) =>
                  onFiltersChange({ ...filters, query: event.target.value })
                }
                placeholder="学校、公司、街区"
              />
            </div>
          </label>
          <DateRangePicker
            range={filters}
            onChange={(range) => onFiltersChange({ ...filters, ...range })}
          />
          <label className="flex flex-col gap-2 text-sm font-semibold">
            预算上限 ${filters.budget.toLocaleString()}
            <input
              aria-label="预算上限"
              className="h-11 w-full accent-trust-sky"
              type="range"
              min="900"
              max="4500"
              step="50"
              value={filters.budget}
              onChange={(event) =>
                onFiltersChange({ ...filters, budget: Number(event.target.value) })
              }
            />
          </label>
          <Button variant="trust" className="h-11" onClick={onClear}>
            重置
          </Button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {amenities.map((amenity) => {
              const Icon = amenity.icon;
              const active = amenity.label === filters.amenity;

              return (
                <button
                  key={amenity.label}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-white text-muted-foreground hover:bg-secondary"
                  )}
                  type="button"
                  onClick={() => onAmenityChange(amenity.label)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {amenity.label}
                </button>
              );
            })}
          </div>
          <div className="text-sm font-semibold text-muted-foreground">
            当前命中 <span className="text-primary">{resultCount}</span> 套房源
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-1 gap-3 rounded-md border p-3 lg:grid-cols-[180px_minmax(0,1fr)_minmax(240px,0.8fr)] lg:items-center",
            insight.status === "healthy" && "border-trust-green/20 bg-trust-green/5",
            insight.status === "tight" && "border-trust-amber/25 bg-trust-amber/5",
            insight.status === "empty" && "border-trust-red/20 bg-trust-red/5"
          )}
        >
          <div className="flex items-center gap-2">
            <Sparkles
              className={cn(
                "size-4",
                insight.status === "healthy" && "text-trust-green",
                insight.status === "tight" && "text-trust-amber",
                insight.status === "empty" && "text-trust-red"
              )}
              aria-hidden="true"
            />
            <span className="text-sm font-extrabold text-primary">{insight.headline}</span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {insight.chips.map((chip) => (
              <Badge key={chip} variant="secondary" className="max-w-full truncate">
                {chip}
              </Badge>
            ))}
          </div>
          <p className="text-sm font-semibold text-muted-foreground">{insight.suggestion}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DateRangePicker({
  range,
  onChange
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeField, setActiveField] = useState<"checkIn" | "checkOut">("checkIn");
  const months = useMemo(() => buildCalendarMonths(range.checkIn || defaultSearchFilters.checkIn, 4), [range.checkIn]);
  const nights = countNights(range);
  const flexibleStays = [
    { label: "周末", nights: 2 },
    { label: "一周", nights: 7 },
    { label: "一个月", nights: 30 }
  ];

  function handleDateClick(isoDate: string) {
    const nextRange =
      activeField === "checkOut" && range.checkIn && compareIsoDates(isoDate, range.checkIn) > 0
        ? { ...range, checkOut: isoDate }
        : selectDateRange(range, isoDate);

    onChange(nextRange);
    setActiveField(nextRange.checkOut ? "checkIn" : "checkOut");
  }

  return (
    <div className="relative flex flex-col gap-2 text-sm font-semibold">
      日期
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={activeField === "checkIn" && open ? "secondary" : "outline"}
          className="h-11 justify-start"
          onClick={() => {
            setActiveField("checkIn");
            setOpen((current) => !current || activeField !== "checkIn");
          }}
        >
          <CalendarDays data-icon="inline-start" />
          {range.checkIn ? formatShortDate(range.checkIn) : "入住"}
        </Button>
        <Button
          variant={activeField === "checkOut" && open ? "secondary" : "outline"}
          className="h-11 justify-start"
          onClick={() => {
            setActiveField("checkOut");
            setOpen((current) => !current || activeField !== "checkOut");
          }}
        >
          <CalendarDays data-icon="inline-start" />
          {range.checkOut ? formatShortDate(range.checkOut) : "搬出"}
        </Button>
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 rounded-lg border bg-white p-4 shadow-panel lg:right-auto lg:w-[720px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-base font-extrabold text-primary">{formatDateRangeLabel(range)}</div>
              <div className="text-xs font-semibold text-muted-foreground">
                {nights > 0 ? "先选入住，再选搬出；结果会自动更新。" : "请选择入住和搬出日期。"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {flexibleStays.map((stay) => (
                <Button
                  key={stay.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onChange(applyFlexibleStay(range, stay.nights));
                    setActiveField("checkIn");
                  }}
                >
                  {stay.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid max-h-[420px] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            {months.map((month) => (
              <div key={month.key} className="min-w-0">
                <div className="text-sm font-extrabold text-primary">{month.label}</div>
                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
                  {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {month.days.map((day) => {
                    const isStart = day.iso === range.checkIn;
                    const isEnd = day.iso === range.checkOut;
                    const inRange =
                      range.checkIn &&
                      range.checkOut &&
                      compareIsoDates(day.iso, range.checkIn) > 0 &&
                      compareIsoDates(day.iso, range.checkOut) < 0;

                    return (
                      <button
                        key={day.iso}
                        className={cn(
                          "flex aspect-square min-h-9 items-center justify-center rounded-md text-sm font-bold transition-colors",
                          !day.inCurrentMonth && "text-muted-foreground/45",
                          inRange && "bg-trust-sky/10 text-primary",
                          (isStart || isEnd) && "bg-primary text-white",
                          day.inCurrentMonth && !isStart && !isEnd && "hover:bg-secondary"
                        )}
                        type="button"
                        onClick={() => handleDateClick(day.iso)}
                        aria-label={`${day.iso}${isStart ? " 入住" : isEnd ? " 搬出" : ""}`}
                      >
                        {day.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="trust" size="sm" onClick={() => setOpen(false)}>
              完成
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoommatesScreen({
  roommate,
  roommates,
  groupMembers,
  activeIndex,
  skippedCount,
  onReject,
  onLater,
  onAccept
}: {
  roommate: Roommate;
  roommates: Roommate[];
  groupMembers: Roommate[];
  activeIndex: number;
  skippedCount: number;
  onReject: () => void;
  onLater: () => void;
  onAccept: () => void;
}) {
  return (
    <section className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[380px_minmax(0,1fr)] xl:px-6">
      <RoommateDeck
        roommate={roommate}
        total={roommates.length}
        activeIndex={activeIndex}
        skippedCount={skippedCount}
        onReject={onReject}
        onLater={onLater}
        onAccept={onAccept}
      />
      <RoommateDirectory roommates={roommates} groupMembers={groupMembers} />
    </section>
  );
}

function GroupsScreen({
  groupBudget,
  members,
  listings,
  groups,
  onRemoveMember,
  onSelectListing
}: {
  groupBudget: string;
  members: Roommate[];
  listings: Listing[];
  groups: ApiGroup[];
  onRemoveMember: (name: string) => void;
  onSelectListing: (listing: Listing) => void;
}) {
  return (
    <section className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:px-6">
      <GroupPanel
        groupBudget={groupBudget}
        members={members}
        onRemoveMember={onRemoveMember}
      />
      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>Group 推荐房源</CardTitle>
          <CardDescription>
            后端已返回 {groups.length} 个 Group；点击房源后回到找房页查看详情
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {listings.map((listing) => (
            <button
              key={listing.id}
              className="overflow-hidden rounded-lg border bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-card"
              type="button"
              onClick={() => onSelectListing(listing)}
            >
              <div
                className="h-40 bg-cover bg-center"
                style={{ backgroundImage: `url(${listing.image})` }}
              />
              <div className="p-4">
                <div className="font-bold text-primary">{listing.title}</div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">
                  {listing.area}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-extrabold text-primary">
                    ${listing.price}/月
                  </span>
                  <Badge variant="success">Group Fit</Badge>
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function PublishScreen({
  isPublishing,
  listings,
  user,
  onCreate
}: {
  isPublishing: boolean;
  listings: ApiListing[];
  user: SessionUser | null;
  onCreate: (draft: PublishDraft) => void;
}) {
  return (
    <section className="mx-auto w-full max-w-[1100px] px-4 py-4 xl:px-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <PublishingFlow isPublishing={isPublishing} onCreate={onCreate} />
        <LandlordListingsPanel listings={listings} user={user} />
      </div>
    </section>
  );
}

function LandlordListingsPanel({
  listings,
  user
}: {
  listings: ApiListing[];
  user: SessionUser | null;
}) {
  return (
    <Card className="h-fit shadow-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>我的房源</CardTitle>
            <CardDescription>
              {user ? `${user.email} · ${listings.length} 套房源` : "登录后显示发布状态"}
            </CardDescription>
          </div>
          <Badge variant={user ? "trust" : "secondary"}>{user ? "Owner" : "Guest"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!user ? (
          <div className="rounded-md border bg-secondary p-4 text-sm font-semibold text-primary">
            先用邮箱验证码登录，再创建房源并查看审核状态。
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-md border bg-white p-4 text-sm font-semibold text-muted-foreground">
            还没有发布记录。创建后会先进入审核中，审核通过才会出现在租客 Discover。
          </div>
        ) : (
          listings.map((listing) => {
            const status = normalizeListingStatus(listing.status);
            const meta = getListingStatusMeta(status);

            return (
              <div key={listing.id} className="rounded-md border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-primary">{listing.title}</div>
                    <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                      {listing.area}
                    </div>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm font-bold text-primary">
                  <span>${listing.price.toLocaleString()}/月</span>
                  <span>{listing.media?.length ?? 0} media</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">{meta.description}</p>
                {status === "REJECTED" && listing.rejectionReason ? (
                  <p className="mt-2 rounded-md bg-secondary p-2 text-xs font-semibold text-primary">
                    {listing.rejectionReason}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function normalizeListingStatus(status: ApiListing["status"]): ListingStatus {
  if (status === "SUBMITTED" || status === "APPROVED" || status === "REJECTED") return status;
  return "DRAFT";
}

function TripsScreen({
  listing,
  trips,
  currentStep,
  onAdvance
}: {
  listing: Listing;
  trips: ApiTrip[];
  currentStep: number;
  onAdvance: () => void;
}) {
  return (
    <section className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:px-6">
      <EscrowPanel listing={listing} currentStep={currentStep} onAdvance={onAdvance} />
      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>订单与入住</CardTitle>
          <CardDescription>后端返回 {trips.length} 个订单/入住记录</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["定金", `$${listing.price.toLocaleString()}`, "Stripe Connect 托管"],
            ["入住", "8/20", "首日缺陷可介入"],
            ["评价", "待完成", "入住后开放"]
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-md border bg-white p-4">
              <div className="text-xs font-bold text-muted-foreground">{label}</div>
              <div className="mt-2 text-xl font-extrabold text-primary">{value}</div>
              <div className="mt-1 text-sm font-semibold text-muted-foreground">{detail}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ListingDetailScreen({
  listing,
  filters,
  favoriteIds,
  contactedIds,
  tourRequestedIds,
  appliedListingId,
  groupMembers,
  roommate,
  onBack,
  onFavorite,
  onContact,
  onRequestTour,
  onApply,
  onOpenRoommates
}: {
  listing: Listing;
  filters: SearchFilters;
  favoriteIds: Set<string>;
  contactedIds: Set<string>;
  tourRequestedIds: Set<string>;
  appliedListingId: string | null;
  groupMembers: Roommate[];
  roommate: Roommate;
  onBack: () => void;
  onFavorite: (id: string) => void;
  onContact: (listing: Listing) => void;
  onRequestTour: (listing: Listing) => void;
  onApply: (listing: Listing) => void;
  onOpenRoommates: () => void;
}) {
  const detail = buildListingDetail(listing, filters);
  const flow = getListingFlowStatus(listing.id, {
    favoriteIds,
    contactedIds,
    tourRequestedIds,
    appliedListingId
  });
  const roommateCount = Math.max(1, groupMembers.length || 1);
  const perPersonPrice = Math.round(listing.price / roommateCount);

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-4 xl:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" className="w-fit" onClick={onBack}>
          <ArrowRight className="rotate-180" data-icon="inline-start" />
          返回房源
        </Button>
        <div className="flex flex-wrap gap-2">
          {flow.isContacted ? <Badge variant="success">已联系</Badge> : null}
          {flow.isTourRequested ? <Badge variant="trust">已预约看房</Badge> : null}
          {flow.isApplied ? <Badge variant="warning">申请中</Badge> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="overflow-hidden shadow-panel">
            <div className="grid grid-cols-1 gap-1 md:grid-cols-[1.5fr_1fr]">
              <div
                className="min-h-[320px] bg-cover bg-center md:min-h-[440px]"
                style={{ backgroundImage: `url(${detail.gallery[0]})` }}
              />
              <div className="grid grid-cols-3 gap-1 md:grid-cols-1">
                {detail.gallery.slice(1).map((image, index) => (
                  <div
                    key={image}
                    className="min-h-28 bg-cover bg-center md:min-h-0"
                    style={{ backgroundImage: `url(${image})` }}
                    aria-label={`房源照片 ${index + 2}`}
                  />
                ))}
              </div>
            </div>
            <CardContent className="flex flex-col gap-5 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="trust">{detail.neighborhood}</Badge>
                    <Badge variant="success">{listing.score} 分</Badge>
                    <Badge variant="secondary">{detail.stayLabel}</Badge>
                  </div>
                  <h1 className="mt-3 text-3xl font-extrabold text-primary">{listing.title}</h1>
                  <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <MapPin className="size-4" aria-hidden="true" />
                    {listing.area}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="text-3xl font-extrabold text-primary">${listing.price.toLocaleString()}</div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    <span className="line-through">${listing.originalPrice.toLocaleString()}</span>
                    <span> / 月</span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-trust-green">
                    省 ${detail.monthlySavings.toLocaleString()}/月
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric icon={BedDouble} label="卧室" value={`${listing.beds} Bed`} />
                <Metric icon={Bath} label="卫浴" value={`${listing.baths} Bath`} />
                <Metric icon={Clock3} label="通勤" value={listing.commute} />
                <Metric icon={ShieldCheck} label="信任" value={listing.trust} />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <DetailList title="房源亮点" items={detail.sections.highlights} />
                <DetailList title="入住规则" items={detail.sections.houseRules} />
                <DetailList title="下一步" items={detail.sections.moveIn} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-panel">
            <CardHeader>
              <CardTitle>动态匹配</CardTitle>
              <CardDescription>根据当前室友、收藏和日期实时更新</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">当前室友</div>
                <div className="mt-2 text-lg font-extrabold text-primary">{roommate.name}</div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">{roommate.match}% Match</div>
              </div>
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">Group 人均</div>
                <div className="mt-2 text-lg font-extrabold text-primary">${perPersonPrice.toLocaleString()}/月</div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">{roommateCount} 人预算估算</div>
              </div>
              <div className="rounded-md border bg-white p-4">
                <div className="text-xs font-bold text-muted-foreground">流程状态</div>
                <div className="mt-2 text-lg font-extrabold text-primary">
                  {flow.isApplied ? "申请中" : flow.isTourRequested ? "待看房" : flow.isContacted ? "沟通中" : "可立即推进"}
                </div>
                <div className="mt-1 text-sm font-semibold text-muted-foreground">操作会即时同步到本页</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="sticky top-24 shadow-panel">
            <CardHeader>
              <CardTitle>申请流程</CardTitle>
              <CardDescription>{detail.stayLabel}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                variant={flow.isFavorite ? "accept" : "outline"}
                className="w-full justify-between"
                onClick={() => onFavorite(listing.id)}
              >
                {flow.isFavorite ? "已收藏" : "收藏房源"}
                <Heart className={cn(flow.isFavorite && "fill-current")} data-icon="inline-end" />
              </Button>
              <Button
                variant={flow.isContacted ? "secondary" : "outline"}
                className="w-full justify-between"
                onClick={() => onContact(listing)}
              >
                {flow.isContacted ? "继续沟通" : "联系房东"}
                <MessageCircle data-icon="inline-end" />
              </Button>
              <Button
                variant={flow.isTourRequested ? "secondary" : "trust"}
                className="w-full justify-between"
                onClick={() => onRequestTour(listing)}
              >
                {flow.isTourRequested ? "看房已预约" : "预约看房"}
                <CalendarDays data-icon="inline-end" />
              </Button>
              <Button
                variant="trust"
                className="w-full justify-between"
                onClick={() => onApply(listing)}
              >
                {flow.primaryCta}
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Separator />
              <Button variant="outline" className="w-full justify-between" onClick={onOpenRoommates}>
                找室友一起租
                <Users data-icon="inline-end" />
              </Button>
              <div className="rounded-md bg-secondary p-3 text-sm font-semibold text-primary">
                <div className="flex justify-between">
                  <span>月租</span>
                  <span>${listing.price.toLocaleString()}</span>
                </div>
                <div className="mt-2 flex justify-between text-muted-foreground">
                  <span>预计押金</span>
                  <span>${Math.round(listing.price * 0.5).toLocaleString()}</span>
                </div>
                <div className="mt-2 flex justify-between text-muted-foreground">
                  <span>服务费</span>
                  <span>${Math.round(listing.price * 0.035).toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-white p-4">
      <h2 className="text-sm font-extrabold text-primary">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <div key={item} className="flex gap-2 text-sm font-semibold text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-trust-green" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrustScreen({
  queues,
  onToast
}: {
  queues: ApiTrustQueue[];
  onToast: (message: string) => void;
}) {
  return (
    <section className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_420px] xl:px-6">
      <TrustAndRoadmap />
      <OperationsPanel initialQueues={queues} onToast={onToast} />
    </section>
  );
}

function SearchPanel({
  filters,
  resultCount,
  onFiltersChange,
  onAmenityChange,
  onClear
}: {
  filters: SearchFilters;
  resultCount: number;
  onFiltersChange: (filters: SearchFilters) => void;
  onAmenityChange: (value: string) => void;
  onClear: () => void;
}) {
  const progress = Math.min(100, Math.max(0, ((filters.budget - 900) / 3600) * 100));

  return (
    <Card className="h-fit shadow-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>找房筛选</CardTitle>
            <CardDescription>租期、预算、通勤和生活偏好</CardDescription>
          </div>
          <Button variant="outline" size="icon" aria-label="筛选设置">
            <SlidersHorizontal />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          地标 / 学校 / 公司
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={filters.query}
              onChange={(event) =>
                onFiltersChange({ ...filters, query: event.target.value })
              }
              placeholder="Los Angeles / UCLA / USC"
            />
          </div>
        </label>

        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            入住
              <Button variant="outline" className="w-full min-w-0 justify-start">
                <CalendarDays data-icon="inline-start" />
              8/20
            </Button>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            搬出
              <Button variant="outline" className="w-full min-w-0 justify-start">
                <CalendarDays data-icon="inline-start" />
              11/30
            </Button>
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">预算上限</span>
            <span className="text-sm font-bold text-primary">
              ${filters.budget.toLocaleString()}/月
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary">
            <div
              className="h-2 rounded-full bg-trust-sky transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="降低预算"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  budget: Math.max(900, filters.budget - 150)
                })
              }
            >
              <Minus />
            </Button>
            <input
              aria-label="预算上限"
              className="w-full accent-trust-sky"
              type="range"
              min="900"
              max="4500"
              step="50"
              value={filters.budget}
              onChange={(event) =>
                onFiltersChange({ ...filters, budget: Number(event.target.value) })
              }
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="提高预算"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  budget: Math.min(4500, filters.budget + 150)
                })
              }
            >
              <ArrowRight />
            </Button>
          </div>
          <div className="flex justify-between text-xs font-semibold text-muted-foreground">
            <span>$900</span>
            <span>$4,500</span>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold">设施偏好</span>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            {amenities.map((amenity) => {
              const Icon = amenity.icon;
              const active = amenity.label === filters.amenity;

              return (
                <button
                  key={amenity.label}
                  className={cn(
                    "flex h-12 min-w-0 items-center gap-2 rounded-md border px-3 text-left text-sm font-semibold transition-colors",
                    active
                      ? "border-trust-sky bg-trust-sky/10 text-trust-blue"
                      : "border-border bg-white text-muted-foreground hover:bg-secondary"
                  )}
                  onClick={() => onAmenityChange(amenity.label)}
                  type="button"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {amenity.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-md bg-primary p-4 text-primary-foreground">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="size-4" aria-hidden="true" />
            Group 交集
          </div>
          <p className="mt-2 text-sm text-white/82">
            当前命中 {resultCount} 套房源。Group 推荐会优先保留整租和预算交集较高的结果。
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full justify-between"
            onClick={onClear}
          >
            重置筛选
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MarketToolbar({
  listingCount,
  viewMode,
  onViewModeChange,
  favoriteCount,
  dateRangeLabel,
  onOpenRoommates
}: {
  listingCount: number;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  favoriteCount: number;
  dateRangeLabel: string;
  onOpenRoommates: () => void;
}) {
  return (
    <Card className="shadow-panel">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Los Angeles 短租发现</h1>
          <p className="text-sm font-medium text-muted-foreground">
            {listingCount} 套可匹配房源 · {favoriteCount} 个收藏 · 主页专注找房
          </p>
          <p className="mt-1 text-xs font-bold text-trust-blue">{dateRangeLabel}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={onOpenRoommates}>
            <Users data-icon="inline-start" />
            找室友
          </Button>
          <Tabs
            value={viewMode}
            onValueChange={(value) => onViewModeChange(value as ViewMode)}
            className="w-full lg:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 lg:w-[220px]">
              <TabsTrigger value="map" className="px-2">地图</TabsTrigger>
              <TabsTrigger value="list" className="px-2">列表</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}

function MapCanvas({
  className,
  listings,
  selectedListing,
  onSelect
}: {
  className?: string;
  listings: Listing[];
  selectedListing: Listing;
  onSelect: (listing: Listing) => void;
}) {
  const mapListings = useMemo(() => listings.slice(0, 12), [listings]);
  const defaultCenter = useMemo(() => getMapCenterForListings(mapListings), [mapListings]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState<MapSize>(defaultMapViewportSize);
  const [mapCenter, setMapCenter] = useState<MapPoint>(defaultCenter);
  const [zoom, setZoom] = useState(11);
  const tiles = useMemo(() => getMapTiles(mapCenter, zoom, mapSize), [mapCenter, mapSize, zoom]);
  const markers = useMemo(() => getMapMarkers(mapListings, mapCenter, zoom, mapSize), [mapCenter, mapListings, mapSize, zoom]);

  useEffect(() => {
    setMapCenter(defaultCenter);
  }, [defaultCenter]);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const measuredElement = element;

    function updateMapSize() {
      const rect = measuredElement.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (width <= 0 || height <= 0) return;

      setMapSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      );
    }

    updateMapSize();
    const observer = new ResizeObserver(updateMapSize);
    observer.observe(measuredElement);

    return () => observer.disconnect();
  }, []);

  function resetMap() {
    setMapCenter(defaultCenter);
    setZoom(11);
  }

  return (
    <Card className={cn("overflow-hidden shadow-panel", className)}>
      <div className="grid min-h-[520px] grid-cols-1">
        <div ref={mapRef} className="relative min-h-[360px] overflow-hidden bg-[#DCE7EA]">
          <div className="absolute inset-0">
            {tiles.map((tile) => (
              <div
                key={tile.id}
                className="absolute size-64 select-none bg-cover bg-center"
                style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }}
              />
            ))}
          </div>
          <div className="absolute left-3 top-3 flex flex-col gap-2">
            <Button
              variant="outline"
              size="icon"
              className="bg-white/95"
              aria-label="放大地图"
              onClick={() => setZoom((current) => Math.min(13, current + 1))}
            >
              <Plus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-white/95"
              aria-label="缩小地图"
              onClick={() => setZoom((current) => Math.max(9, current - 1))}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-white/95"
              aria-label="重置地图"
              onClick={resetMap}
            >
              <LocateFixed />
            </Button>
          </div>
          {markers.map((marker) => (
            <MapMarker
              key={marker.id}
              label={marker.label}
              active={marker.id === selectedListing.id}
              left={marker.x}
              top={marker.y}
              onClick={() => {
                const listing = mapListings.find((item) => item.id === marker.id);
                if (!listing) return;

                setMapCenter({ lat: marker.lat, lng: marker.lng });
                onSelect(listing);
              }}
            />
          ))}
          {mapListings.length === 0 ? (
            <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-md border bg-white/95 p-4 text-center shadow-card">
              <div className="text-sm font-extrabold text-primary">当前地图没有可显示房源</div>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                放宽预算、设施或地点后，地图会重新显示价格标记。
              </p>
            </div>
          ) : null}
          <div className="absolute bottom-2 right-3 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
            © OpenStreetMap contributors
          </div>
          {mapListings.length > 0 ? (
            <div className="absolute bottom-5 left-5 rounded-md border bg-white/94 p-3 shadow-card">
              <div className="flex items-center gap-2 text-sm font-bold text-primary">
                <Navigation className="size-4 text-trust-sky" aria-hidden="true" />
                {selectedListing.commute}
              </div>
              <div className="mt-1 text-xs font-semibold text-muted-foreground">
                {selectedListing.transit}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col justify-between gap-4 border-t bg-white p-5">
          {mapListings.length > 0 ? (
            <>
              <div>
                <Badge variant="trust">地标通勤</Badge>
                <h2 className="mt-3 text-xl font-bold text-primary">
                  {selectedListing.title}
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {selectedListing.area}
                </p>
              </div>
              <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
                <Metric icon={Clock3} label="通勤" value={selectedListing.commute} />
                <Metric icon={DollarSign} label="净租金" value={`$${selectedListing.price}/月`} />
                <Metric icon={BedDouble} label="卧室" value={`${selectedListing.beds} Bed`} />
                <Metric icon={ShieldCheck} label="信任" value={selectedListing.trust} />
              </div>
            </>
          ) : (
            <div className="rounded-md border bg-secondary p-4 text-sm font-semibold text-primary">
              地图会跟随筛选条件更新。当前没有价格标记时，先回到左侧调整关键词、预算或设施。
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MapMarker({
  label,
  active,
  left,
  top,
  onClick
}: {
  label: string;
  active?: boolean;
  left: number;
  top: number;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-sm font-bold shadow-card transition-transform hover:scale-105",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white bg-white text-primary"
      )}
      onClick={onClick}
      style={{ left, top }}
      type="button"
    >
      {label}
    </button>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-secondary p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 line-clamp-2 break-words text-sm font-bold text-primary">{value}</div>
    </div>
  );
}

function ListingGrid({
  listings,
  selectedId,
  favoriteIds,
  onSelect,
  onFavorite
}: {
  listings: Listing[];
  selectedId: string;
  favoriteIds: Set<string>;
  onSelect: (listing: Listing) => void;
  onFavorite: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          selected={selectedId === listing.id}
          favorite={favoriteIds.has(listing.id)}
          onSelect={onSelect}
          onFavorite={onFavorite}
        />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  selected,
  favorite,
  onSelect,
  onFavorite
}: {
  listing: Listing;
  selected: boolean;
  favorite: boolean;
  onSelect: (listing: Listing) => void;
  onFavorite: (id: string) => void;
}) {
  const gallery = useMemo(() => buildListingGallery(listing), [listing]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const currentImage = gallery[galleryIndex] ?? listing.image;

  function moveGallery(direction: -1 | 1) {
    setGalleryIndex((current) => getGalleryIndex(current, direction, gallery.length));
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card",
        selected ? "border-trust-sky ring-2 ring-trust-sky/20" : "border-border"
      )}
    >
      <div className="relative">
        <button
          className="block h-44 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${currentImage})` }}
          type="button"
          onClick={() => onSelect(listing)}
          aria-label={`查看 ${listing.title}`}
        />
        <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            className="size-8 bg-white/95"
            aria-label={`上一张照片：${listing.title}`}
            onClick={() => moveGallery(-1)}
          >
            <ArrowRight className="rotate-180" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 bg-white/95"
            aria-label={`下一张照片：${listing.title}`}
            onClick={() => moveGallery(1)}
          >
            <ArrowRight />
          </Button>
        </div>
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
          {gallery.map((image, index) => (
            <span
              key={image}
              className={cn(
                "size-1.5 rounded-full border border-white/80",
                index === galleryIndex ? "bg-white" : "bg-white/45"
              )}
            />
          ))}
        </div>
        <Button
          variant={favorite ? "accept" : "outline"}
          size="icon"
          className="absolute right-3 top-3 bg-white/95"
          aria-label={favorite ? "取消收藏" : "收藏房源"}
          onClick={() => onFavorite(listing.id)}
        >
          <Heart className={cn(favorite && "fill-current")} />
        </Button>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <button className="min-w-0 text-left" type="button" onClick={() => onSelect(listing)}>
            <div className="text-base font-bold text-primary">{listing.title}</div>
            <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              {listing.area}
            </div>
          </button>
          <div className="flex items-center gap-1 text-sm font-bold text-primary">
            <Star className="size-4 fill-current text-trust-amber" aria-hidden="true" />
            {listing.score}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold text-primary">${listing.price}</span>
          <span className="text-sm font-semibold text-muted-foreground line-through">
            ${listing.originalPrice}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">/月</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {listing.tags.map((tag) => (
            <Badge key={tag} variant={tag.includes("Group") ? "success" : "secondary"}>
              {tag}
            </Badge>
          ))}
        </div>
        <Button
          variant={selected ? "trust" : "outline"}
          className="w-full justify-between"
          onClick={() => onSelect(listing)}
        >
          {selected ? "正在查看" : "查看详情"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </article>
  );
}

function EmptyResults({ filters, onClear }: { filters: SearchFilters; onClear: () => void }) {
  const insight = buildSearchInsight(filters, 0);

  return (
    <Card className="shadow-panel">
      <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-md bg-secondary text-primary">
          <Search className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">没有命中的房源</h2>
          <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
            {insight.suggestion}
          </p>
        </div>
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">
          {insight.chips.map((chip) => (
            <Badge key={chip} variant="secondary">
              {chip}
            </Badge>
          ))}
        </div>
        <Button variant="trust" onClick={onClear}>
          重置筛选
        </Button>
      </CardContent>
    </Card>
  );
}

function RoommateDirectory({
  roommates,
  groupMembers
}: {
  roommates: Roommate[];
  groupMembers: Roommate[];
}) {
  const memberNames = new Set(groupMembers.map((member) => member.name));

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>室友匹配目录</CardTitle>
            <CardDescription>50 个认证室友 · 按匹配度、预算和通勤偏好排序</CardDescription>
          </div>
          <Badge variant="success">{groupMembers.length} 人已在 Group</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roommates.slice(0, 18).map((roommate) => (
          <div key={`${roommate.name}-${roommate.role}`} className="rounded-md border bg-white p-3">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={roommate.image} alt="" />
                <AvatarFallback>{roommate.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-primary">
                  {roommate.name}, {roommate.age}
                </div>
                <div className="truncate text-xs font-semibold text-muted-foreground">
                  {roommate.role}
                </div>
              </div>
              <Badge variant={memberNames.has(roommate.name) ? "success" : "trust"}>
                {memberNames.has(roommate.name) ? "Group" : `${roommate.match}%`}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric icon={WalletCards} label="预算" value={roommate.budget} />
              <Metric icon={TrainFront} label="通勤" value={roommate.commute} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {roommate.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RoommateDeck({
  roommate,
  total,
  activeIndex,
  skippedCount,
  onReject,
  onLater,
  onAccept
}: {
  roommate: Roommate;
  total: number;
  activeIndex: number;
  skippedCount: number;
  onReject: () => void;
  onLater: () => void;
  onAccept: () => void;
}) {
  return (
    <Card className="overflow-hidden shadow-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>室友卡片流</CardTitle>
            <CardDescription>
              {activeIndex + 1}/{total} · 已跳过 {skippedCount}
            </CardDescription>
          </div>
          <Badge variant="trust">{roommate.match}% Match</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border bg-white shadow-card">
          <div
            className="h-72 bg-cover bg-center"
            style={{ backgroundImage: `url(${roommate.image})` }}
          />
          <div className="flex flex-col gap-3 p-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold text-primary">
                  {roommate.name}, {roommate.age}
                </h2>
                <Badge variant="success">Verified</Badge>
              </div>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {roommate.role}
              </p>
            </div>

            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
              <Metric icon={WalletCards} label="预算" value={roommate.budget} />
              <Metric icon={TrainFront} label="通勤" value={roommate.commute} />
            </div>

            <div className="flex flex-wrap gap-2">
              {roommate.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Button variant="reject" size="iconLg" aria-label="不感兴趣" onClick={onReject}>
            <X />
          </Button>
          <Button variant="outline" size="iconLg" aria-label="稍后查看" onClick={onLater}>
            <Minus />
          </Button>
          <Button variant="accept" size="iconLg" aria-label="喜欢" onClick={onAccept}>
            <Heart />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupPanel({
  groupBudget,
  members,
  onRemoveMember
}: {
  groupBudget: string;
  members: Roommate[];
  onRemoveMember: (name: string) => void;
}) {
  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Group 工作台</CardTitle>
            <CardDescription>{members.length} 人合租战队 · Westside 优先</CardDescription>
          </div>
          <Users className="size-5 text-trust-sky" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-md bg-secondary p-3">
          <div className="flex">
            {members.map((member, index) => (
              <Avatar
                key={member.name}
                className={cn("border-2 border-white", index > 0 && "-ml-2")}
              >
                <AvatarImage src={member.image} alt="" />
                <AvatarFallback>{member.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-muted-foreground">总预算</div>
            <div className="text-lg font-extrabold text-primary">{groupBudget}</div>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
          <Badge variant="success">无烟</Badge>
          <Badge variant="trust">2 卫以上</Badge>
          <Badge variant="secondary">可养猫</Badge>
          <Badge variant="warning">9 月前入住</Badge>
        </div>

        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <div key={member.name} className="flex items-center justify-between rounded-md border bg-white p-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-primary">{member.name}</div>
                <div className="truncate text-xs font-semibold text-muted-foreground">{member.budget}</div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`移出 ${member.name}`} onClick={() => onRemoveMember(member.name)}>
                <X />
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>整租推荐命中率</span>
            <span className="text-trust-green">86%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-secondary">
            <div className="h-2 w-[86%] rounded-full bg-trust-green" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EscrowPanel({
  listing,
  currentStep,
  onAdvance
}: {
  listing: Listing;
  currentStep: number;
  onAdvance: () => void;
}) {
  const steps: Array<{ code: string; label: string }> = [
    { code: "pending_payment", label: "待支付" },
    { code: "funds_held", label: "托管中" },
    { code: "confirmed", label: "已确认" },
    { code: "move_in_pending", label: "入住核销" },
    { code: "completed", label: "已完成" }
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>交易托管</CardTitle>
        <CardDescription>{listing.title} · Stripe Connect 模拟状态</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {steps.map(({ code, label }, index) => {
          const active = index <= currentStep;
          return (
          <div key={code} className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full border",
                active
                  ? "border-trust-green bg-trust-green text-white"
                  : "border-border bg-secondary text-muted-foreground"
              )}
            >
              {active ? (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              ) : (
                <Clock3 className="size-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-primary">{label}</div>
              <div className="truncate text-xs font-semibold text-muted-foreground">
                {code}
              </div>
            </div>
          </div>
          );
        })}
        <div className="rounded-md bg-secondary p-3 text-sm font-semibold text-primary">
          <div className="flex justify-between">
            <span>托管金额</span>
            <span>${listing.price.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex justify-between text-muted-foreground">
            <span>平台服务费</span>
            <span>${Math.round(listing.price * 0.035)}</span>
          </div>
        </div>
        <Button variant="outline" className="w-full justify-between" onClick={onAdvance} disabled={currentStep >= steps.length - 1}>
          {currentStep >= steps.length - 1 ? "交易已完成" : "推进下一状态"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function PublishingFlow({
  isPublishing,
  onCreate
}: {
  isPublishing: boolean;
  onCreate: (draft: PublishDraft) => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PublishDraft>({
    title: "新发布主卧短租",
    area: "Los Angeles · Westwood",
    price: 1580,
    beds: 1,
    baths: 1
  });
  const steps = [
    ["01", "基础信息", "地址、卧室、卫浴、租期"],
    ["02", "分类相册", "卧室、客厅、厨房/卫浴、周边"],
    ["03", "补贴净价", "原租金、首周减免、手净价"],
    ["04", "合同承诺", "房东知情、三方协议、审核"]
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>发布房源流程</CardTitle>
            <CardDescription>分类相册、净价补贴、房东知情承诺、发布审核</CardDescription>
          </div>
          <Button variant="trust" size="sm" onClick={() => onCreate(draft)} disabled={isPublishing}>
            <Building2 data-icon="inline-start" />
            {isPublishing ? "提交中" : "创建并提交"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {steps.map(([stepCode, title, detail], index) => (
            <button
              key={stepCode}
              className={cn(
                "rounded-md border bg-white p-4 text-left transition-colors",
                index === step && "border-trust-sky bg-trust-sky/5"
              )}
              type="button"
              onClick={() => setStep(index)}
            >
              <div className="text-xs font-extrabold text-trust-sky">{stepCode}</div>
              <div className="mt-2 text-sm font-bold text-primary">{title}</div>
              <div className="mt-1 text-sm font-medium text-muted-foreground">{detail}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-md border bg-white p-4 md:grid-cols-[minmax(0,1fr)_140px_90px_90px]">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            房源标题
            <Input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            区域
            <Input
              value={draft.area}
              onChange={(event) => setDraft({ ...draft, area: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            价格
            <Input
              type="number"
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Bed
              <Input
                type="number"
                min="1"
                value={draft.beds}
                onChange={(event) => setDraft({ ...draft, beds: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Bath
              <Input
                type="number"
                min="1"
                value={draft.baths}
                onChange={(event) => setDraft({ ...draft, baths: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrustAndRoadmap() {
  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>信任与三阶段前端范围</CardTitle>
        <CardDescription>P0/P1/P2 静态模块在同一设计系统下呈现</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            phase: "P0",
            title: "核心撮合与交易",
            color: "danger" as const,
            items: ["邮箱认证", "卡片流", "Group 创建", "地图找房", "基础托管"]
          },
          {
            phase: "P1",
            title: "风控与推荐",
            color: "warning" as const,
            items: ["整租推荐", "阶梯退款", "入住保障", "信用降权", "服务费"]
          },
          {
            phase: "P2",
            title: "租后高频生态",
            color: "success" as const,
            items: ["假期转租", "共享微仓", "拼单外卖", "水电拆分"]
          }
        ].map((phase) => (
          <div key={phase.phase} className="rounded-md border bg-white p-4">
            <Badge variant={phase.color}>{phase.phase}</Badge>
            <h3 className="mt-3 text-base font-bold text-primary">{phase.title}</h3>
            <div className="mt-4 flex flex-col gap-2">
              {phase.items.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="size-4 text-trust-green" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OperationsPanel({
  initialQueues,
  onToast
}: {
  initialQueues: ApiTrustQueue[];
  onToast: (message: string) => void;
}) {
  const fallbackQueues: QueueItem[] = [
    { label: "人工认证待审", value: 24, icon: UserCheck, variant: "trust" },
    { label: "房源媒体审核", value: 11, icon: Coffee, variant: "warning" },
    { label: "退款/缺陷工单", value: 3, icon: ShieldCheck, variant: "danger" },
    { label: "信用分重算队列", value: 128, icon: Sparkles, variant: "success" }
  ];
  const [queues, setQueues] = useState<QueueItem[]>(
    initialQueues.length > 0
      ? initialQueues.map((queue) => ({ ...queue, icon: ShieldCheck }))
      : fallbackQueues
  );

  useEffect(() => {
    if (initialQueues.length > 0) {
      setQueues(initialQueues.map((queue) => ({ ...queue, icon: ShieldCheck })));
    }
  }, [initialQueues]);

  function processQueue(label: string) {
    setQueues((current) =>
      current.map((queue) =>
        queue.label === label ? { ...queue, value: Math.max(0, queue.value - 1) } : queue
      )
    );
    onToast(`${label} 已处理 1 条`);
  }

  const reviewModules = [
    "举报入口",
    "内容审核",
    "退款介入",
    "信用降权",
    "入住保障",
    "服务费分账"
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>运营控制台预览</CardTitle>
        <CardDescription>审核、举报、信用分和应急保障的静态入口</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {queues.map(({ label, value, icon: Icon, variant }) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div>
                <div className="text-sm font-bold text-primary">{label}</div>
                <div className="text-xs font-semibold text-muted-foreground">Admin queue</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={variant}>{value}</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => processQueue(label)}
                disabled={value === 0}
              >
                处理
              </Button>
            </div>
          </div>
        ))}
        <Separator />
        <div className="grid grid-cols-2 gap-2">
          {reviewModules.map((module) => (
            <Button
              key={module}
              variant="secondary"
              size="sm"
              className="justify-start"
              onClick={() => onToast(`${module} 已打开静态面板`)}
            >
              <MessageCircle data-icon="inline-start" />
              {module}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusToast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md border bg-white/96 px-4 py-3 text-sm font-semibold text-primary shadow-panel backdrop-blur">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-trust-green" aria-hidden="true" />
        <span className="min-w-0 truncate">{message}</span>
      </div>
    </div>
  );
}
