"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  buildDealRoom,
  type DemoListing,
  type DemoRoommate,
  type MatchMetric,
  type RecommendedListing
} from "@/lib/match-demo";
import { cn } from "@/lib/utils";

type RoommateFirstWorkspaceProps = {
  roommate: DemoRoommate;
  roommates: DemoRoommate[];
  listings: DemoListing[];
  groupMembers: DemoRoommate[];
  activeIndex: number;
  skippedCount: number;
  likedCount: number;
  favoriteIds: Set<string>;
  canRequestTour: boolean;
  tourRequested: boolean;
  onReject: () => void;
  onLater: () => void;
  onLike: () => void;
  onFavoriteListing: (id: string) => void;
  onSelectListing: (listing: DemoListing) => void;
  onRequestTour: () => void;
  onOpenDiscover: () => void;
};

const metricAccent: Record<MatchMetric["tone"], string> = {
  budget: "bg-trust-sky",
  commute: "bg-accent",
  lifestyle: "bg-primary",
  trust: "bg-trust-green"
};

const mapPositions = [
  "left-[18%] top-[25%]",
  "left-[58%] top-[33%]",
  "left-[36%] top-[64%]"
];

export function RoommateFirstWorkspace({
  roommate,
  roommates,
  listings,
  groupMembers,
  activeIndex,
  skippedCount,
  likedCount,
  favoriteIds,
  canRequestTour,
  tourRequested,
  onReject,
  onLater,
  onLike,
  onFavoriteListing,
  onSelectListing,
  onRequestTour,
  onOpenDiscover
}: RoommateFirstWorkspaceProps) {
  const dealRoom = useMemo(
    () => buildDealRoom(roommate, listings, groupMembers, { readyForTour: canRequestTour, viewerName: "You" }),
    [canRequestTour, groupMembers, listings, roommate]
  );
  const activeHomes = dealRoom.recommendedHomes.slice(0, 3);

  return (
    <section className="mx-auto flex w-full max-w-[1540px] flex-col gap-4 px-4 py-4 xl:px-6">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-primary">Roommate Match</h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {roommates.length} verified profiles · {likedCount} liked · {skippedCount} passed
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={onOpenDiscover}>
            <Home data-icon="inline-start" />
            Browse homes
          </Button>
          <Button
            variant={dealRoom.canRequestTour ? "trust" : "outline"}
            size="sm"
            onClick={onRequestTour}
            disabled={!dealRoom.canRequestTour}
          >
            <CalendarDays data-icon="inline-start" />
            {tourRequested && dealRoom.canRequestTour ? "Tour requested" : dealRoom.primaryCta}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[430px_minmax(0,1fr)_390px]">
        <RoommateSwipeCard
          roommate={roommate}
          activeIndex={activeIndex}
          total={roommates.length}
          onReject={onReject}
          onLater={onLater}
          onLike={onLike}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <MatchFitPanel metrics={dealRoom.matchFit.metrics} sharedBudget={dealRoom.matchFit.sharedBudgetLabel} />
          <RecommendedHomesPanel
            homes={activeHomes}
            favoriteIds={favoriteIds}
            focusLabel={dealRoom.mapFocusLabel}
            onFavoriteListing={onFavoriteListing}
            onSelectListing={onSelectListing}
            onOpenFilters={onOpenDiscover}
          />
          <DealPipeline steps={dealRoom.pipeline} />
        </div>

        <DealRoomRail
          members={dealRoom.members}
          sharedBudget={dealRoom.matchFit.sharedBudgetLabel}
          targetBudget={dealRoom.matchFit.targetBudgetLabel}
          messages={dealRoom.messages}
          trustChecklist={dealRoom.trustChecklist}
          canRequestTour={dealRoom.canRequestTour}
          tourRequested={tourRequested}
          primaryCta={dealRoom.primaryCta}
          onRequestTour={onRequestTour}
        />
      </div>
    </section>
  );
}

function RoommateSwipeCard({
  roommate,
  activeIndex,
  total,
  onReject,
  onLater,
  onLike
}: {
  roommate: DemoRoommate;
  activeIndex: number;
  total: number;
  onReject: () => void;
  onLater: () => void;
  onLike: () => void;
}) {
  return (
    <Card className="overflow-hidden shadow-panel">
      <div
        className="relative min-h-[420px] bg-cover bg-top"
        style={{ backgroundImage: `url(${roommate.image})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/0 to-black/76" />
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <Badge className="border-transparent bg-trust-sky text-white">{roommate.match}% Match</Badge>
          <Badge className="border-white/30 bg-white/90 text-primary">
            {activeIndex + 1}/{total}
          </Badge>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-extrabold tracking-normal">
              {roommate.name}, {roommate.age}
            </h2>
            <CheckCircle2 className="size-5 fill-white text-trust-sky" aria-hidden="true" />
          </div>
          <p className="mt-2 max-w-sm text-sm font-semibold text-white/86">{roommate.role}</p>
        </div>
      </div>

      <CardContent className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-primary sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <ProfileSignal icon={MapPin} label={roommate.origin ?? roommate.commute} />
          <ProfileSignal icon={Sparkles} label={roommate.tags[0] ?? "Verified"} />
          <ProfileSignal icon={WalletCards} label={roommate.budget} />
        </div>

        <div className="flex flex-wrap gap-2">
          {roommate.tags.map((tag) => (
            <Badge key={tag} variant={tag.includes("Clean") || tag.includes("安静") ? "success" : "trust"}>
              {tag}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SwipeButton label="Pass" variant="reject" icon={X} onClick={onReject} />
          <SwipeButton label="Later" variant="outline" icon={Clock3} onClick={onLater} />
          <SwipeButton label="Like" variant="accept" icon={Heart} onClick={onLike} />
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileSignal({
  icon: Icon,
  label
}: {
  icon: typeof MapPin;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-secondary px-3 py-2">
      <Icon className="size-4 shrink-0 text-trust-sky" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function SwipeButton({
  label,
  variant,
  icon: Icon,
  onClick
}: {
  label: string;
  variant: "reject" | "outline" | "accept";
  icon: typeof Heart;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border bg-white text-sm font-bold text-primary transition-colors hover:bg-secondary"
      type="button"
      onClick={onClick}
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-full border",
          variant === "reject" && "border-trust-red/25 bg-trust-red text-white",
          variant === "accept" && "border-trust-green/25 bg-trust-green text-white",
          variant === "outline" && "border-border bg-secondary text-primary"
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      {label}
    </button>
  );
}

function MatchFitPanel({
  metrics,
  sharedBudget
}: {
  metrics: MatchMetric[];
  sharedBudget: string;
}) {
  return (
    <Card className="shadow-panel">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Match fit summary</CardTitle>
        <Badge variant="trust">{sharedBudget}</Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 p-5 pt-0 md:grid-cols-2 2xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-md border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-xs font-bold text-muted-foreground">{metric.label}</div>
              {metric.tone === "trust" ? (
                <ShieldCheck className="size-4 text-trust-green" aria-hidden="true" />
              ) : metric.tone === "commute" ? (
                <TrainFront className="size-4 text-trust-sky" aria-hidden="true" />
              ) : metric.tone === "budget" ? (
                <WalletCards className="size-4 text-trust-sky" aria-hidden="true" />
              ) : (
                <Users className="size-4 text-primary" aria-hidden="true" />
              )}
            </div>
            <div className="mt-3 text-2xl font-extrabold text-primary">{metric.score}%</div>
            <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">{metric.detail}</div>
            <div className="mt-3 h-2 rounded-full bg-secondary">
              <div className={cn("h-2 rounded-full", metricAccent[metric.tone])} style={{ width: `${metric.score}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecommendedHomesPanel({
  homes,
  favoriteIds,
  focusLabel,
  onFavoriteListing,
  onSelectListing,
  onOpenFilters
}: {
  homes: RecommendedListing[];
  favoriteIds: Set<string>;
  focusLabel: string;
  onFavoriteListing: (id: string) => void;
  onSelectListing: (listing: DemoListing) => void;
  onOpenFilters: () => void;
}) {
  return (
    <Card className="overflow-hidden shadow-panel">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Recommended homes</CardTitle>
        <Button variant="outline" size="sm" onClick={onOpenFilters}>
          <SlidersHorizontal data-icon="inline-start" />
          Filters
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 p-5 pt-0 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[300px] overflow-hidden rounded-lg border bg-[#E7EEF3]">
          <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(rgba(0,34,68,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,34,68,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute left-[10%] top-[20%] h-[2px] w-[58%] -rotate-6 bg-trust-sky/40" />
          <div className="absolute left-[28%] top-[70%] h-[2px] w-[52%] rotate-12 bg-trust-slate/35" />
          {homes.map((home, index) => (
            <button
              key={home.id}
              className={cn(
                "absolute rounded-full border border-white px-3 py-1 text-xs font-extrabold shadow-card transition-transform hover:scale-105",
                index === 0 ? "bg-primary text-white" : "bg-white text-primary",
                mapPositions[index] ?? "left-[48%] top-[48%]"
              )}
              type="button"
              onClick={() => onSelectListing(home)}
            >
              ${home.perPersonPrice.toLocaleString()}
            </button>
          ))}
          <div className="absolute bottom-4 left-4 rounded-md border bg-white/95 p-3 shadow-card">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Navigation className="size-4 text-trust-sky" aria-hidden="true" />
              {focusLabel}
            </div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">
              Shortlist homes around shared commute
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {homes.map((home) => (
            <div
              key={home.id}
              className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)_44px] gap-3 rounded-md border bg-white p-2 transition-colors hover:bg-secondary"
            >
              <button
                className="h-24 rounded-md bg-cover bg-center"
                style={{ backgroundImage: `url(${home.image})` }}
                type="button"
                onClick={() => onSelectListing(home)}
                aria-label={`Open ${home.title}`}
              />
              <button className="min-w-0 py-1 text-left" type="button" onClick={() => onSelectListing(home)}>
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-extrabold text-primary">{home.title}</div>
                  <Badge variant={home.fitLabel === "Best match" ? "success" : "trust"}>{home.fitLabel}</Badge>
                </div>
                <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                  {home.area} · {home.commute}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
                  <span>{home.beds} bed</span>
                  <span>{home.baths} bath</span>
                  <span>{home.tags[0]}</span>
                </div>
                <div className="mt-2 text-lg font-extrabold text-primary">
                  ${home.perPersonPrice.toLocaleString()}
                  <span className="text-xs font-semibold text-muted-foreground"> / person</span>
                </div>
              </button>
              <button
                className="mt-2 flex size-9 items-center justify-center rounded-full border bg-white text-primary"
                type="button"
                onClick={() => onFavoriteListing(home.id)}
                aria-label={favoriteIds.has(home.id) ? "Remove saved home" : "Save home"}
              >
                <Heart className={cn("size-4", favoriteIds.has(home.id) && "fill-current text-trust-green")} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DealPipeline({
  steps
}: {
  steps: Array<{ label: string; status: "active" | "ready" | "idle"; detail: string }>;
}) {
  return (
    <Card className="shadow-panel">
      <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.label} className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold",
                step.status === "active" && "border-primary bg-primary text-white",
                step.status === "ready" && "border-trust-green bg-trust-green/10 text-trust-green",
                step.status === "idle" && "border-border bg-secondary text-muted-foreground"
              )}
            >
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-primary">{step.label}</div>
              <div className="truncate text-xs font-semibold text-muted-foreground">{step.detail}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DealRoomRail({
  members,
  sharedBudget,
  targetBudget,
  messages,
  trustChecklist,
  canRequestTour,
  tourRequested,
  primaryCta,
  onRequestTour
}: Pick<ReturnType<typeof buildDealRoom>, "members" | "messages" | "trustChecklist"> & {
  sharedBudget: string;
  targetBudget: string;
  canRequestTour: boolean;
  tourRequested: boolean;
  primaryCta: ReturnType<typeof buildDealRoom>["primaryCta"];
  onRequestTour: () => void;
}) {
  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <Card className="shadow-panel">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Deal Room</CardTitle>
          <Badge variant={canRequestTour ? "trust" : "warning"}>
            {canRequestTour ? `${members.length} slots filled` : "Pending match"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-0">
          {members.map((member) => (
            <div key={member.id ?? member.name} className="flex min-w-0 items-center gap-3 rounded-md border bg-white p-3">
              <Avatar className="size-12">
                <AvatarImage src={member.image} alt="" />
                <AvatarFallback>{member.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-extrabold text-primary">{member.name}</div>
                  <Badge variant="trust">Verified</Badge>
                </div>
                <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">{member.role}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle>Shared budget</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="text-2xl font-extrabold text-primary">{sharedBudget}</div>
          <div className="mt-3 h-2 rounded-full bg-secondary">
            <div className="h-2 w-[72%] rounded-full bg-trust-sky" />
          </div>
          <div className="mt-3 text-sm font-semibold text-muted-foreground">{targetBudget}</div>
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Message preview</CardTitle>
          <MessageCircle className="size-4 text-trust-sky" aria-hidden="true" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-0">
          {messages.map((message) => (
            <div
              key={`${message.author}-${message.time}`}
              className={cn(
                "max-w-[92%] rounded-md border p-3 text-sm font-medium",
                message.align === "right" ? "ml-auto bg-trust-sky/10" : "bg-white"
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-xs font-bold text-primary">
                <span>{message.author}</span>
                <span className="text-muted-foreground">{message.time}</span>
              </div>
              <p className="text-muted-foreground">{message.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Trust checklist</CardTitle>
          <Badge variant="success">All clear</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-0">
          {trustChecklist.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span className="flex min-w-0 items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 fill-trust-green text-white" aria-hidden="true" />
                <span className="truncate text-primary">{item.label}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.detail}</span>
            </div>
          ))}
          <Separator />
          <Button
            variant={canRequestTour ? "trust" : "outline"}
            size="lg"
            className="w-full"
            onClick={onRequestTour}
            disabled={!canRequestTour}
          >
            <CalendarDays data-icon="inline-start" />
            {tourRequested && canRequestTour ? "Group tour requested" : primaryCta}
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}
