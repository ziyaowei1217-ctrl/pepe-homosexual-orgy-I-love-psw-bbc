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
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  PawPrint,
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
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Listing = {
  id: number;
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
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
};

type AppSection = "Discover" | "Roommates" | "Groups" | "Publish" | "Trips" | "Trust";

type ViewMode = "map" | "list";

type SearchFilters = {
  query: string;
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
  label: string;
  value: number;
  icon: LucideIcon;
  variant: "trust" | "warning" | "danger" | "success";
};

const seedListings: Listing[] = [
  {
    id: 1,
    title: "Fenway 高层主卧短租",
    area: "Boston · Fenway",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    price: 1420,
    originalPrice: 1680,
    beds: 1,
    baths: 1,
    commute: "步行 12 分钟到 Northeastern",
    transit: "地铁 18 分钟到 Back Bay",
    trust: ".edu 已认证 · 房东知情",
    tags: ["独卫", "电梯", "可 6/18 入住"],
    score: 4.92
  },
  {
    id: 2,
    title: "Cambridge 三室整租 Group 优选",
    area: "Cambridge · Central",
    image:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
    price: 3480,
    originalPrice: 3900,
    beds: 3,
    baths: 2,
    commute: "骑行 9 分钟到 MIT",
    transit: "红线 14 分钟到 Harvard",
    trust: "三方协议模板 · 视频验房",
    tags: ["整租", "宠物友好", "Group 推荐"],
    score: 4.88
  },
  {
    id: 3,
    title: "Jersey City 河景 Studio",
    area: "NYC · Newport",
    image:
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
    price: 2180,
    originalPrice: 2450,
    beds: 1,
    baths: 1,
    commute: "PATH 16 分钟到 WTC",
    transit: "步行 6 分钟到 Newport",
    trust: "企业邮箱认证 · 首日保障",
    tags: ["健身房", "门卫", "可短租"],
    score: 4.84
  }
];

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
  "Boston · Fenway",
  "Cambridge · Central",
  "NYC · Newport",
  "Brooklyn · Downtown",
  "Seattle · South Lake Union",
  "San Francisco · Mission Bay",
  "Los Angeles · Koreatown",
  "Chicago · River North",
  "Austin · Downtown",
  "Toronto · U of T"
];

const listingTitles = [
  "采光主卧短租",
  "高层 Studio 转租",
  "三室整租 Group 优选",
  "近校区次卧",
  "河景公寓短租",
  "实习通勤友好 1B1B",
  "宠物友好合租房",
  "电梯公寓主卧",
  "暑期短租精选",
  "地铁口安静卧室"
];

const listingTagSets = [
  ["独卫", "电梯", "可 6/18 入住"],
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
  "Northeastern",
  "MIT",
  "Harvard",
  "NYU",
  "Columbia",
  "Amazon HQ",
  "Google Office",
  "Meta Campus",
  "UCLA",
  "University of Toronto"
];

function createListings(): Listing[] {
  const generated = Array.from({ length: 100 }, (_, index) => {
    if (seedListings[index]) return seedListings[index];

    const area = listingAreas[index % listingAreas.length];
    const title = `${area.split(" · ")[0]} ${listingTitles[index % listingTitles.length]}`;
    const beds = (index % 4) + 1;
    const baths = Math.min(3, Math.max(1, beds - (index % 2)));
    const price = 980 + ((index * 137) % 3100);
    const originalPrice = price + 180 + ((index * 41) % 420);
    const commuteMinutes = 8 + ((index * 5) % 28);
    const transitMinutes = commuteMinutes + 6 + (index % 12);
    const target = commuteTargets[index % commuteTargets.length];

    return {
      id: index + 1,
      title,
      area,
      image: listingImages[index % listingImages.length],
      price,
      originalPrice,
      beds,
      baths,
      commute: `${index % 3 === 0 ? "步行" : index % 3 === 1 ? "地铁" : "骑行"} ${commuteMinutes} 分钟到 ${target}`,
      transit: `公共交通 ${transitMinutes} 分钟 · ${area.split(" · ")[1]}`,
      trust: trustLabels[index % trustLabels.length],
      tags: listingTagSets[index % listingTagSets.length],
      score: Number((4.62 + ((index * 7) % 37) / 100).toFixed(2))
    };
  });

  return generated;
}

const seedRoommates: Roommate[] = [
  {
    name: "Mia Chen",
    age: 22,
    role: "BU MSBA · 秋季入学",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    match: 94,
    budget: "$1,450/月",
    commute: "Fenway / Back Bay",
    tags: ["早睡", "少做饭", "无宠物", "安静"]
  },
  {
    name: "Ethan Liu",
    age: 24,
    role: "实习生 · Seaport",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    match: 89,
    budget: "$1,650/月",
    commute: "红线 30 分钟内",
    tags: ["可合租", "周末社交", "爱干净", "健身"]
  },
  {
    name: "Ava Zhang",
    age: 23,
    role: "Northeastern Co-op",
    image:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80",
    match: 91,
    budget: "$1,520/月",
    commute: "步行到校区",
    tags: ["会做饭", "猫友好", "不抽烟", "稳定"]
  }
];

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
  "Victor Tan"
];

const roommateRoles = [
  "BU MSBA · 秋季入学",
  "实习生 · Seaport",
  "Northeastern Co-op",
  "MIT MEng · Robotics",
  "NYU Stern · Exchange",
  "Google SWE Intern",
  "Harvard GSD · Studio",
  "Amazon PM Intern",
  "UCLA Data Science",
  "Columbia SIPA · Fall"
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
  return Array.from({ length: 50 }, (_, index) => {
    if (seedRoommates[index]) return seedRoommates[index];

    const budget = 1150 + ((index * 73) % 950);

    return {
      name: roommateNames[index % roommateNames.length],
      age: 20 + (index % 9),
      role: roommateRoles[index % roommateRoles.length],
      image: roommateImages[index % roommateImages.length],
      match: 82 + ((index * 3) % 17),
      budget: `$${budget.toLocaleString()}/月`,
      commute: index % 2 === 0 ? "25 分钟通勤圈" : "步行/地铁优先",
      tags: roommateTagSets[index % roommateTagSets.length]
    };
  });
}

const listings = createListings();
const roommates = createRoommates();

const navItems: Array<{ label: string; section: AppSection }> = [
  { label: "Discover", section: "Discover" },
  { label: "Roommates", section: "Roommates" },
  { label: "Groups", section: "Groups" },
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

export default function HomePage() {
  const [allListings, setAllListings] = useState(listings);
  const [selectedListing, setSelectedListing] = useState(listings[0]);
  const [roommateIndex, setRoommateIndex] = useState(0);
  const [activeSection, setActiveSection] = useState<AppSection>("Discover");
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [filters, setFilters] = useState<SearchFilters>({
    query: "Northeastern University",
    budget: 2200,
    amenity: "Wi-Fi"
  });
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set([1]));
  const [groupMembers, setGroupMembers] = useState<Roommate[]>(roommates.slice(0, 3));
  const [skippedCount, setSkippedCount] = useState(0);
  const [escrowStep, setEscrowStep] = useState(2);
  const [toast, setToast] = useState("已加载 100 套房源和 50 个室友");

  const roommate = roommates[roommateIndex];
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
        const matchesQuery = !query || haystack.includes(query) || query.includes("northeastern");
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
  const groupBudget = useMemo(() => {
    const total = groupMembers.reduce((sum, member) => {
      const amount = Number(member.budget.replace(/[^0-9]/g, ""));
      return sum + amount;
    }, 0);

    return `$${total.toLocaleString()}/月`;
  }, [groupMembers]);

  function cycleRoommate(direction: 1 | -1) {
    setRoommateIndex((current) => {
      const next = current + direction;
      if (next < 0) return roommates.length - 1;
      if (next >= roommates.length) return 0;
      return next;
    });
  }

  function handleAmenityChange(amenity: string) {
    setFilters((current) => ({ ...current, amenity }));
    setToast(`已筛选设施：${amenity}`);
  }

  function handleFavorite(listingId: number) {
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

  function handleAcceptRoommate() {
    setGroupMembers((current) => {
      if (current.some((member) => member.name === roommate.name)) return current;
      return [...current, roommate].slice(-4);
    });
    setToast(`${roommate.name} 已加入 Group 候选`);
    cycleRoommate(1);
  }

  function handleRejectRoommate() {
    setSkippedCount((current) => current + 1);
    setToast(`已跳过 ${roommate.name}`);
    cycleRoommate(1);
  }

  function handleCreateListing(draft: PublishDraft) {
    const newListing: Listing = {
      id: allListings.length + 1,
      title: draft.title,
      area: draft.area,
      image: listingImages[allListings.length % listingImages.length],
      price: draft.price,
      originalPrice: draft.price + 320,
      beds: draft.beds,
      baths: draft.baths,
      commute: "步行 15 分钟到 Northeastern",
      transit: "地铁 22 分钟 · 新发布房源",
      trust: "房东知情 · 待审核",
      tags: ["新发布", "视频验房", "房东知情"],
      score: 4.8
    };

    setAllListings((current) => [newListing, ...current]);
    setSelectedListing(newListing);
    setActiveSection("Discover");
    setViewMode("list");
    setToast(`${draft.title} 已创建并进入发布审核`);
  }

  function advanceEscrow() {
    setEscrowStep((current) => Math.min(current + 1, 4));
    setToast("交易托管状态已更新");
  }

  return (
    <main className="min-h-screen bg-background">
      <AppHeader
        favoriteCount={favoriteIds.size}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
      {activeSection === "Discover" ? (
        <DiscoverScreen
          filters={filters}
          listings={visibleListings}
          selectedListing={selectedListing}
          favoriteIds={favoriteIds}
          viewMode={viewMode}
          onFiltersChange={setFilters}
          onAmenityChange={handleAmenityChange}
          onClear={() => {
            setFilters({ query: "", budget: 4200, amenity: "Wi-Fi" });
            setToast("筛选条件已重置");
          }}
          onSelect={(listing) => {
            setSelectedListing(listing);
            setToast(`已选中：${listing.title}`);
          }}
          onFavorite={handleFavorite}
          onViewModeChange={setViewMode}
          onOpenRoommates={() => setActiveSection("Roommates")}
        />
      ) : null}
      {activeSection === "Roommates" ? (
        <RoommatesScreen
          roommate={roommate}
          roommates={roommates}
          groupMembers={groupMembers}
          activeIndex={roommateIndex}
          skippedCount={skippedCount}
          onReject={handleRejectRoommate}
          onLater={() => {
            setToast(`${roommate.name} 已放入稍后查看`);
            cycleRoommate(1);
          }}
          onAccept={handleAcceptRoommate}
        />
      ) : null}
      {activeSection === "Groups" ? (
        <GroupsScreen
          groupBudget={groupBudget}
          members={groupMembers}
          listings={allListings.slice(0, 6)}
          onRemoveMember={(name) => {
            setGroupMembers((current) => current.filter((member) => member.name !== name));
            setToast(`${name} 已移出 Group`);
          }}
          onSelectListing={(listing) => {
            setSelectedListing(listing);
            setActiveSection("Discover");
            setToast(`已打开 Group 推荐房源：${listing.title}`);
          }}
        />
      ) : null}
      {activeSection === "Publish" ? (
        <PublishScreen onCreate={handleCreateListing} />
      ) : null}
      {activeSection === "Trips" ? (
        <TripsScreen
          listing={selectedListing}
          currentStep={escrowStep}
          onAdvance={advanceEscrow}
        />
      ) : null}
      {activeSection === "Trust" ? (
        <TrustScreen onToast={setToast} />
      ) : null}
      <StatusToast message={toast} />
    </main>
  );
}

function AppHeader({
  favoriteCount,
  activeSection,
  onSectionChange
}: {
  favoriteCount: number;
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
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
            .edu Verified
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
  favoriteIds: Set<number>;
  viewMode: ViewMode;
  onFiltersChange: (filters: SearchFilters) => void;
  onAmenityChange: (value: string) => void;
  onClear: () => void;
  onSelect: (listing: Listing) => void;
  onFavorite: (id: number) => void;
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
            onOpenRoommates={onOpenRoommates}
          />
          {listings.length === 0 ? (
            <EmptyResults onClear={onClear} />
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
  return (
    <Card className="shadow-panel">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1.2fr)_150px_150px_minmax(220px,0.8fr)_auto] lg:items-end">
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
          <label className="flex flex-col gap-2 text-sm font-semibold">
            入住
            <Button variant="outline" className="h-11 justify-start">
              <CalendarDays data-icon="inline-start" />
              6/18
            </Button>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            搬出
            <Button variant="outline" className="h-11 justify-start">
              <CalendarDays data-icon="inline-start" />
              9/05
            </Button>
          </label>
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
      </CardContent>
    </Card>
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
  onRemoveMember,
  onSelectListing
}: {
  groupBudget: string;
  members: Roommate[];
  listings: Listing[];
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
          <CardDescription>只展示适合多人合租的候选，点击后回到找房页查看详情</CardDescription>
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

function PublishScreen({ onCreate }: { onCreate: (draft: PublishDraft) => void }) {
  return (
    <section className="mx-auto w-full max-w-[1100px] px-4 py-4 xl:px-6">
      <PublishingFlow onCreate={onCreate} />
    </section>
  );
}

function TripsScreen({
  listing,
  currentStep,
  onAdvance
}: {
  listing: Listing;
  currentStep: number;
  onAdvance: () => void;
}) {
  return (
    <section className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:px-6">
      <EscrowPanel listing={listing} currentStep={currentStep} onAdvance={onAdvance} />
      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>订单与入住</CardTitle>
          <CardDescription>这里保留交易后动作，不再占用找房首屏</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["定金", `$${listing.price.toLocaleString()}`, "Stripe Connect 托管"],
            ["入住", "6/18", "首日缺陷可介入"],
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

function TrustScreen({ onToast }: { onToast: (message: string) => void }) {
  return (
    <section className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_420px] xl:px-6">
      <TrustAndRoadmap />
      <OperationsPanel onToast={onToast} />
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
              placeholder="Northeastern / MIT / NYC"
            />
          </div>
        </label>

        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            入住
            <Button variant="outline" className="w-full min-w-0 justify-start">
              <CalendarDays data-icon="inline-start" />
              6/18
            </Button>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            搬出
            <Button variant="outline" className="w-full min-w-0 justify-start">
              <CalendarDays data-icon="inline-start" />
              9/05
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
  onOpenRoommates
}: {
  listingCount: number;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  favoriteCount: number;
  onOpenRoommates: () => void;
}) {
  return (
    <Card className="shadow-panel">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Boston 短租发现</h1>
          <p className="text-sm font-medium text-muted-foreground">
            {listingCount} 套可匹配房源 · {favoriteCount} 个收藏 · 主页专注找房
          </p>
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
  const markerPositions = [
    "left-[17%] top-[24%]",
    "left-[58%] top-[34%]",
    "left-[38%] top-[58%]",
    "left-[72%] top-[60%]",
    "left-[24%] top-[67%]",
    "left-[48%] top-[18%]"
  ];

  return (
    <Card className={cn("overflow-hidden shadow-panel", className)}>
      <div className="grid min-h-[520px] grid-cols-1">
        <div className="relative min-h-[330px] overflow-hidden bg-[#E7EEF3]">
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(0,34,68,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,34,68,0.08)_1px,transparent_1px)] [background-size:46px_46px]" />
          <div className="absolute left-[16%] top-[22%] h-[2px] w-[58%] -rotate-6 bg-trust-sky/45" />
          <div className="absolute left-[32%] top-[28%] h-[2px] w-[46%] rotate-[18deg] bg-trust-slate/35" />
          {listings.slice(0, 6).map((listing, index) => (
            <MapMarker
              key={listing.id}
              className={markerPositions[index]}
              label={`$${listing.price.toLocaleString()}`}
              active={listing.id === selectedListing.id}
              onClick={() => onSelect(listing)}
            />
          ))}
          <div className="absolute bottom-5 left-5 rounded-md border bg-white/94 p-3 shadow-card">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Navigation className="size-4 text-trust-sky" aria-hidden="true" />
              {selectedListing.commute}
            </div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">
              {selectedListing.transit}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 border-t bg-white p-5">
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
        </div>
      </div>
    </Card>
  );
}

function MapMarker({
  className,
  label,
  active,
  onClick
}: {
  className?: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "absolute rounded-full border px-3 py-1 text-sm font-bold shadow-card transition-transform hover:scale-105",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white bg-white text-primary",
        className
      )}
      onClick={onClick}
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
  selectedId: number;
  favoriteIds: Set<number>;
  onSelect: (listing: Listing) => void;
  onFavorite: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {listings.map((listing) => (
        <article
          key={listing.id}
          className={cn(
            "overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card",
            selectedId === listing.id ? "border-trust-sky ring-2 ring-trust-sky/20" : "border-border"
          )}
        >
          <div className="relative">
            <button
              className="block h-44 w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${listing.image})` }}
              type="button"
              onClick={() => onSelect(listing)}
              aria-label={`查看 ${listing.title}`}
            />
            <Button
              variant={favoriteIds.has(listing.id) ? "accept" : "outline"}
              size="icon"
              className="absolute right-3 top-3 bg-white/95"
              aria-label={favoriteIds.has(listing.id) ? "取消收藏" : "收藏房源"}
              onClick={() => onFavorite(listing.id)}
            >
              <Heart className={cn(favoriteIds.has(listing.id) && "fill-current")} />
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
              variant={selectedId === listing.id ? "trust" : "outline"}
              className="w-full justify-between"
              onClick={() => onSelect(listing)}
            >
              {selectedId === listing.id ? "正在查看" : "查看详情"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function EmptyResults({ onClear }: { onClear: () => void }) {
  return (
    <Card className="shadow-panel">
      <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-md bg-secondary text-primary">
          <Search className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-primary">没有命中的房源</h2>
          <p className="mt-2 max-w-md text-sm font-medium text-muted-foreground">
            可以放宽预算、清空地标关键词，或切换设施偏好。Group 推荐会在后端接入后继续做交集排序。
          </p>
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
            <CardDescription>{members.length} 人合租战队 · Cambridge 优先</CardDescription>
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

function PublishingFlow({ onCreate }: { onCreate: (draft: PublishDraft) => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PublishDraft>({
    title: "新发布主卧短租",
    area: "Boston · Fenway",
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
            <CardTitle>发房静态流程</CardTitle>
            <CardDescription>分类相册、净价补贴、房东知情承诺、发布审核</CardDescription>
          </div>
          <Button variant="trust" size="sm" onClick={() => onCreate(draft)}>
            <Building2 data-icon="inline-start" />
            创建房源
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

function OperationsPanel({ onToast }: { onToast: (message: string) => void }) {
  const [queues, setQueues] = useState<QueueItem[]>([
    { label: "人工认证待审", value: 24, icon: UserCheck, variant: "trust" },
    { label: "房源媒体审核", value: 11, icon: Coffee, variant: "warning" },
    { label: "退款/缺陷工单", value: 3, icon: ShieldCheck, variant: "danger" },
    { label: "信用分重算队列", value: 128, icon: Sparkles, variant: "success" }
  ]);

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
  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md border bg-white/96 px-4 py-3 text-sm font-semibold text-primary shadow-panel backdrop-blur">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-trust-green" aria-hidden="true" />
        <span className="min-w-0 truncate">{message}</span>
      </div>
    </div>
  );
}
