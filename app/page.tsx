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

const listings: Listing[] = [
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

const roommates: Roommate[] = [
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

const navItems = ["Discover", "Roommates", "Groups", "Trips", "Trust"];
const amenities = [
  { label: "Wi-Fi", icon: Wifi },
  { label: "独卫", icon: Bath },
  { label: "宠物", icon: PawPrint },
  { label: "近地铁", icon: TrainFront }
];

export default function HomePage() {
  const [selectedListing, setSelectedListing] = useState(listings[0]);
  const [roommateIndex, setRoommateIndex] = useState(0);
  const [selectedAmenity, setSelectedAmenity] = useState("Wi-Fi");

  const roommate = roommates[roommateIndex];
  const groupBudget = useMemo(() => "$4,620/月", []);

  function cycleRoommate(direction: 1 | -1) {
    setRoommateIndex((current) => {
      const next = current + direction;
      if (next < 0) return roommates.length - 1;
      if (next >= roommates.length) return 0;
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-background">
      <AppHeader />
      <section className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)_360px] xl:px-6">
        <SearchPanel
          selectedAmenity={selectedAmenity}
          onAmenityChange={setSelectedAmenity}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <MarketToolbar />
          <MapCanvas selectedListing={selectedListing} />
          <ListingGrid
            listings={listings}
            selectedId={selectedListing.id}
            onSelect={setSelectedListing}
          />
          <PublishingFlow />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <RoommateDeck
            roommate={roommate}
            total={roommates.length}
            activeIndex={roommateIndex}
            onReject={() => cycleRoommate(1)}
            onAccept={() => cycleRoommate(1)}
          />
          <GroupPanel groupBudget={groupBudget} />
          <EscrowPanel listing={selectedListing} />
        </aside>
      </section>

      <section className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-4 px-4 pb-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:px-6">
        <TrustAndRoadmap />
        <OperationsPanel />
      </section>
    </main>
  );
}

function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 xl:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Home className="size-5" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold text-primary">Sublet Pipeline</div>
            <div className="text-xs font-semibold text-muted-foreground">
              Marketplace & Co-living
            </div>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item, index) => (
            <Button
              key={item}
              variant={index === 0 ? "secondary" : "ghost"}
              size="sm"
            >
              {item}
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <ShieldCheck data-icon="inline-start" />
            .edu Verified
          </Button>
          <Button variant="trust" size="sm">
            <DoorOpen data-icon="inline-start" />
            发布房源
          </Button>
        </div>
      </div>
    </header>
  );
}

function SearchPanel({
  selectedAmenity,
  onAmenityChange
}: {
  selectedAmenity: string;
  onAmenityChange: (value: string) => void;
}) {
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
            <Input className="pl-9" defaultValue="Northeastern University" />
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            入住
            <Button variant="outline" className="justify-start">
              <CalendarDays data-icon="inline-start" />
              6/18
            </Button>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            搬出
            <Button variant="outline" className="justify-start">
              <CalendarDays data-icon="inline-start" />
              9/05
            </Button>
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">预算上限</span>
            <span className="text-sm font-bold text-primary">$1,650/月</span>
          </div>
          <div className="h-2 rounded-full bg-secondary">
            <div className="h-2 w-[68%] rounded-full bg-trust-sky" />
          </div>
          <div className="flex justify-between text-xs font-semibold text-muted-foreground">
            <span>$900</span>
            <span>$2,200</span>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold">设施偏好</span>
          <div className="grid grid-cols-2 gap-2">
            {amenities.map((amenity) => {
              const Icon = amenity.icon;
              const active = amenity.label === selectedAmenity;

              return (
                <button
                  key={amenity.label}
                  className={cn(
                    "flex h-12 items-center gap-2 rounded-md border px-3 text-left text-sm font-semibold transition-colors",
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
            3 人总预算 $4,620/月，均接受 25 分钟内通勤，无烟，偏好独卫或 2 卫以上。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MarketToolbar() {
  return (
    <Card className="shadow-panel">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Boston 短租发现</h1>
          <p className="text-sm font-medium text-muted-foreground">
            42 套可匹配房源 · 18 个已认证室友 · 7 个 Group 正在找房
          </p>
        </div>
        <Tabs defaultValue="map" className="w-full lg:w-auto">
          <TabsList className="grid w-full grid-cols-3 lg:w-[330px]">
            <TabsTrigger value="map">地图</TabsTrigger>
            <TabsTrigger value="list">房源</TabsTrigger>
            <TabsTrigger value="match">室友</TabsTrigger>
          </TabsList>
          <TabsContent value="map" className="sr-only">
            地图视图
          </TabsContent>
          <TabsContent value="list" className="sr-only">
            房源视图
          </TabsContent>
          <TabsContent value="match" className="sr-only">
            室友视图
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function MapCanvas({ selectedListing }: { selectedListing: Listing }) {
  return (
    <Card className="overflow-hidden shadow-panel">
      <div className="grid min-h-[330px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative overflow-hidden bg-[#E7EEF3]">
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(0,34,68,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,34,68,0.08)_1px,transparent_1px)] [background-size:46px_46px]" />
          <div className="absolute left-[16%] top-[22%] h-[2px] w-[58%] -rotate-6 bg-trust-sky/45" />
          <div className="absolute left-[32%] top-[28%] h-[2px] w-[46%] rotate-[18deg] bg-trust-slate/35" />
          <MapMarker className="left-[17%] top-[24%]" label="$1,420" active />
          <MapMarker className="left-[58%] top-[34%]" label="$3,480" />
          <MapMarker className="left-[38%] top-[58%]" label="$2,180" />
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
        <div className="flex flex-col justify-between gap-4 border-l bg-white p-5">
          <div>
            <Badge variant="trust">地标通勤</Badge>
            <h2 className="mt-3 text-xl font-bold text-primary">
              {selectedListing.title}
            </h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {selectedListing.area}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
  active
}: {
  className?: string;
  label: string;
  active?: boolean;
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
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-secondary p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 line-clamp-2 text-sm font-bold text-primary">{value}</div>
    </div>
  );
}

function ListingGrid({
  listings,
  selectedId,
  onSelect
}: {
  listings: Listing[];
  selectedId: number;
  onSelect: (listing: Listing) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {listings.map((listing) => (
        <button
          key={listing.id}
          className={cn(
            "overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card",
            selectedId === listing.id ? "border-trust-sky ring-2 ring-trust-sky/20" : "border-border"
          )}
          onClick={() => onSelect(listing)}
          type="button"
        >
          <div
            className="h-44 bg-cover bg-center"
            style={{ backgroundImage: `url(${listing.image})` }}
          />
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold text-primary">{listing.title}</div>
                <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-muted-foreground">
                  <MapPin className="size-4" aria-hidden="true" />
                  {listing.area}
                </div>
              </div>
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
          </div>
        </button>
      ))}
    </div>
  );
}

function RoommateDeck({
  roommate,
  total,
  activeIndex,
  onReject,
  onAccept
}: {
  roommate: Roommate;
  total: number;
  activeIndex: number;
  onReject: () => void;
  onAccept: () => void;
}) {
  return (
    <Card className="overflow-hidden shadow-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>室友卡片流</CardTitle>
            <CardDescription>
              {activeIndex + 1}/{total} · 双向右滑解锁 Group
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

            <div className="grid grid-cols-2 gap-2">
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
          <Button variant="outline" size="iconLg" aria-label="稍后查看">
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

function GroupPanel({ groupBudget }: { groupBudget: string }) {
  const members = [
    ["M", roommates[0].image],
    ["E", roommates[1].image],
    ["A", roommates[2].image]
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Group 工作台</CardTitle>
            <CardDescription>3 人合租战队 · Cambridge 优先</CardDescription>
          </div>
          <Users className="size-5 text-trust-sky" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-md bg-secondary p-3">
          <div className="flex">
            {members.map(([fallback, image], index) => (
              <Avatar
                key={fallback}
                className={cn("border-2 border-white", index > 0 && "-ml-2")}
              >
                <AvatarImage src={image} alt="" />
                <AvatarFallback>{fallback}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-muted-foreground">总预算</div>
            <div className="text-lg font-extrabold text-primary">{groupBudget}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Badge variant="success">无烟</Badge>
          <Badge variant="trust">2 卫以上</Badge>
          <Badge variant="secondary">可养猫</Badge>
          <Badge variant="warning">9 月前入住</Badge>
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

function EscrowPanel({ listing }: { listing: Listing }) {
  const steps: Array<{ code: string; label: string; active: boolean }> = [
    { code: "pending_payment", label: "待支付", active: true },
    { code: "funds_held", label: "托管中", active: true },
    { code: "confirmed", label: "已确认", active: true },
    { code: "move_in_pending", label: "入住核销", active: false }
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>交易托管</CardTitle>
        <CardDescription>{listing.title} · Stripe Connect 模拟状态</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {steps.map(({ code, label, active }) => (
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
        ))}
        <Button variant="outline" className="w-full justify-between">
          查看资金流水
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function PublishingFlow() {
  return (
    <Card className="shadow-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>发房静态流程</CardTitle>
            <CardDescription>分类相册、净价补贴、房东知情承诺、发布审核</CardDescription>
          </div>
          <Button variant="trust" size="sm">
            <Building2 data-icon="inline-start" />
            创建房源
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            ["01", "基础信息", "地址、卧室、卫浴、租期"],
            ["02", "分类相册", "卧室、客厅、厨房/卫浴、周边"],
            ["03", "补贴净价", "原租金、首周减免、手净价"],
            ["04", "合同承诺", "房东知情、三方协议、审核"]
          ].map(([step, title, detail]) => (
            <div key={step} className="rounded-md border bg-white p-4">
              <div className="text-xs font-extrabold text-trust-sky">{step}</div>
              <div className="mt-2 text-sm font-bold text-primary">{title}</div>
              <div className="mt-1 text-sm font-medium text-muted-foreground">{detail}</div>
            </div>
          ))}
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

function OperationsPanel() {
  const queues: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    variant: "trust" | "warning" | "danger" | "success";
  }> = [
    { label: "人工认证待审", value: "24", icon: UserCheck, variant: "trust" },
    { label: "房源媒体审核", value: "11", icon: Coffee, variant: "warning" },
    { label: "退款/缺陷工单", value: "3", icon: ShieldCheck, variant: "danger" },
    { label: "信用分重算队列", value: "128", icon: Sparkles, variant: "success" }
  ];

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle>运营控制台预览</CardTitle>
        <CardDescription>审核、举报、信用分和应急保障的静态入口</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {queues.map(({ label, value, icon: Icon, variant }) => (
          <div key={label} className="flex items-center justify-between rounded-md border bg-white p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div>
                <div className="text-sm font-bold text-primary">{label}</div>
                <div className="text-xs font-semibold text-muted-foreground">Admin queue</div>
              </div>
            </div>
            <Badge variant={variant}>{value}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
