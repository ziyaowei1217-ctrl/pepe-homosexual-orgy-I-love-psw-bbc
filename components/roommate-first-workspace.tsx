"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  Navigation,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  buildDealRoom,
  type DemoListing,
  type DemoRoommate,
  type DecisionFeedback,
  type MatchMetric,
  type RecommendedListing,
  getDecisionFeedback,
  getMatchMomentum,
  type RoommateDecision
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

type DecisionFeedbackState = {
  targetKey: string;
  feedback: DecisionFeedback;
};

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
  const [decisionFeedbackState, setDecisionFeedbackState] = useState<DecisionFeedbackState | null>(null);
  const dealRoom = useMemo(
    () => buildDealRoom(roommate, listings, groupMembers, { readyForTour: canRequestTour, viewerName: "You" }),
    [canRequestTour, groupMembers, listings, roommate]
  );
  const momentum = getMatchMomentum(likedCount, skippedCount, roommates.length);
  const activeHomes = dealRoom.recommendedHomes.slice(0, 3);
  const roommateKey = roommate.id ?? roommate.name;
  const visibleDecisionFeedback =
    decisionFeedbackState?.targetKey === roommateKey ? decisionFeedbackState.feedback : null;

  function handleDecision(decision: RoommateDecision, action: () => void) {
    setDecisionFeedbackState({
      targetKey: roommateKey,
      feedback: getDecisionFeedback(decision, roommate.name)
    });
    action();
  }

  return (
    <section className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-4 py-5 xl:px-6">
      <MarketplaceSearchBar
        roommate={roommate}
        roommateCount={roommates.length}
        momentum={momentum}
        canRequestTour={dealRoom.canRequestTour}
        tourRequested={tourRequested}
        primaryCta={dealRoom.primaryCta}
        onOpenDiscover={onOpenDiscover}
        onRequestTour={onRequestTour}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <RecommendedHomesPanel
            homes={activeHomes}
            favoriteIds={favoriteIds}
            focusLabel={dealRoom.mapFocusLabel}
            onFavoriteListing={onFavoriteListing}
            onSelectListing={onSelectListing}
            onOpenFilters={onOpenDiscover}
          />

          <RoommateSwipeCard
            roommate={roommate}
            activeIndex={activeIndex}
            total={roommates.length}
            decisionFeedback={visibleDecisionFeedback}
            onReject={() => handleDecision("pass", onReject)}
            onLater={() => handleDecision("later", onLater)}
            onLike={() => handleDecision("like", onLike)}
          />

          <div className="lg:col-span-2">
            <MatchFitPanel metrics={dealRoom.matchFit.metrics} sharedBudget={dealRoom.matchFit.sharedBudgetLabel} />
          </div>
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

      <DealPipeline steps={dealRoom.pipeline} />
    </section>
  );
}

function MarketplaceSearchBar({
  roommate,
  roommateCount,
  momentum,
  canRequestTour,
  tourRequested,
  primaryCta,
  onOpenDiscover,
  onRequestTour
}: {
  roommate: DemoRoommate;
  roommateCount: number;
  momentum: ReturnType<typeof getMatchMomentum>;
  canRequestTour: boolean;
  tourRequested: boolean;
  primaryCta: ReturnType<typeof buildDealRoom>["primaryCta"];
  onOpenDiscover: () => void;
  onRequestTour: () => void;
}) {
  const budgetLabel = roommate.budget.replace("/月", " / person");

  return (
    <Card className="overflow-hidden border-border bg-white shadow-panel">
      <CardContent className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.4fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-trust-blue">
            <MapPin className="size-3.5" aria-hidden="true" />
            Los Angeles marketplace
          </div>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-primary md:text-4xl">
            LA Sublet Match
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
            <span>{roommateCount} verified profiles</span>
            <span>·</span>
            <span>{momentum.detail}</span>
            <Badge variant="trust">{roommate.match}% · {roommate.name}</Badge>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 overflow-hidden rounded-md border bg-secondary/80 sm:grid-cols-3">
          <SearchSegment icon={MapPin} label="City" value="Los Angeles" />
          <SearchSegment icon={CalendarDays} label="Stay" value="Aug 20 - Nov 30" />
          <SearchSegment icon={WalletCards} label="Split budget" value={budgetLabel} />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Button variant="trust" size="sm" onClick={onOpenDiscover}>
            <Home data-icon="inline-start" />
            Browse homes
          </Button>
          <Button
            variant={canRequestTour ? "outline" : "secondary"}
            size="sm"
            onClick={onRequestTour}
            disabled={!canRequestTour}
          >
            <CalendarDays data-icon="inline-start" />
            {tourRequested && canRequestTour ? "Tour requested" : primaryCta}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SearchSegment({
  icon: Icon,
  label,
  value
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b bg-white px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-trust-sky/10 text-trust-blue">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-extrabold text-primary">{value}</div>
      </div>
    </div>
  );
}

function RoommateSwipeCard({
  roommate,
  activeIndex,
  total,
  decisionFeedback,
  onReject,
  onLater,
  onLike
}: {
  roommate: DemoRoommate;
  activeIndex: number;
  total: number;
  decisionFeedback: DecisionFeedback | null;
  onReject: () => void;
  onLater: () => void;
  onLike: () => void;
}) {
  return (
    <Card className="overflow-hidden border-border bg-white shadow-panel">
      <div
        className="relative min-h-[390px] bg-cover bg-top"
        style={{ backgroundImage: `url(${roommate.image})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/0 to-black/82" />
        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
          <Badge className="border-white/20 bg-trust-sky text-white shadow-card">{roommate.match}% Match</Badge>
          <Badge className="border-white/40 bg-white/90 text-primary shadow-sm">
            {activeIndex + 1}/{total}
          </Badge>
        </div>
        {decisionFeedback ? (
          <div
            className={cn(
              "absolute right-5 top-20 rotate-6 rounded-md border-2 bg-white/95 px-4 py-2 text-2xl font-black shadow-card",
              decisionFeedback.tone === "like" && "border-trust-green text-trust-green",
              decisionFeedback.tone === "later" && "border-trust-amber text-trust-amber",
              decisionFeedback.tone === "pass" && "border-trust-red text-trust-red"
            )}
          >
            {decisionFeedback.label}
          </div>
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            .edu verified · lifestyle checked
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-extrabold tracking-normal">
              {roommate.name}, {roommate.age}
            </h2>
            <CheckCircle2 className="size-5 fill-white text-trust-sky" aria-hidden="true" />
          </div>
          <p className="mt-2 max-w-sm text-sm font-semibold text-white/88">{roommate.role}</p>
        </div>
      </div>

      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-1 gap-2 text-sm font-semibold text-primary sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <ProfileSignal icon={MapPin} label={roommate.origin ?? roommate.commute} />
          <ProfileSignal icon={Sparkles} label={roommate.tags[0] ?? "Verified"} />
          <ProfileSignal icon={WalletCards} label={roommate.budget} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {roommate.tags.map((tag) => (
            <Badge key={tag} variant={tag.includes("Clean") || tag.includes("安静") ? "success" : "trust"}>
              {tag}
            </Badge>
          ))}
        </div>

        {decisionFeedback ? (
          <div
            className={cn(
              "rounded-md border p-3 text-sm font-bold",
              decisionFeedback.tone === "like" && "border-trust-green/20 bg-trust-green/10 text-trust-green",
              decisionFeedback.tone === "later" && "border-trust-amber/20 bg-trust-amber/10 text-trust-amber",
              decisionFeedback.tone === "pass" && "border-trust-red/20 bg-trust-red/10 text-trust-red"
            )}
          >
            {decisionFeedback.detail}
          </div>
        ) : (
          <div className="rounded-md border bg-secondary/70 p-3 text-sm font-semibold text-primary">
            <div className="flex items-center justify-between gap-3">
              <span>Best shared lane</span>
              <span className="text-trust-sky">{roommate.commute}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white">
              <div className="h-2 w-[82%] rounded-full bg-trust-green" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
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
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-white px-3 py-2 shadow-sm">
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
      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border bg-white text-sm font-bold text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:bg-secondary hover:shadow-card"
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
    <Card className="border-border bg-white shadow-panel">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Match fit summary</CardTitle>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">4 signals calibrated for this match</p>
        </div>
        <Badge variant="trust">{sharedBudget}</Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 md:grid-cols-2 2xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-md border bg-gradient-to-b from-white to-secondary/75 p-3">
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
  const featuredHome = homes[0];

  return (
    <Card className="overflow-hidden border-border bg-white shadow-panel">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Recommended homes</CardTitle>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{focusLabel}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenFilters}>
          <SlidersHorizontal data-icon="inline-start" />
          Filters
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 p-4 pt-0">
        <div className="relative min-h-[450px] overflow-hidden rounded-lg border bg-secondary">
          <div className="absolute inset-0 [background-image:linear-gradient(rgba(0,34,68,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,34,68,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="absolute left-[-6%] top-[16%] h-16 w-[86%] rotate-[-9deg] rounded-full border-t-2 border-trust-sky/35" />
          <div className="absolute left-[18%] top-[52%] h-20 w-[74%] rotate-[13deg] rounded-full border-t-2 border-trust-green/25" />
          <div className="absolute right-[-10%] top-[26%] h-48 w-48 rounded-full border border-white/70 bg-white/35" />
          <div className="absolute left-5 top-5 rounded-md border bg-white/92 px-3 py-2 shadow-sm">
            <div className="text-xs font-bold uppercase text-muted-foreground">Shared commute</div>
            <div className="mt-1 text-sm font-extrabold text-primary">{focusLabel}</div>
          </div>
          {homes.map((home, index) => (
            <button
              key={home.id}
              className={cn(
                "absolute flex items-center gap-2 rounded-full border border-white px-3 py-1.5 text-xs font-extrabold shadow-card transition-transform hover:scale-105",
                index === 0 ? "bg-primary text-white" : "bg-white text-primary",
                mapPositions[index] ?? "left-[48%] top-[48%]"
              )}
              type="button"
              onClick={() => onSelectListing(home)}
            >
              <MapPin className="size-3.5" aria-hidden="true" />
              ${home.perPersonPrice.toLocaleString()}
            </button>
          ))}
          {featuredHome ? (
            <button
              className="absolute bottom-4 right-4 hidden w-[240px] overflow-hidden rounded-md border bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 sm:block"
              type="button"
              onClick={() => onSelectListing(featuredHome)}
            >
              <div
                className="h-32 bg-cover bg-center"
                style={{ backgroundImage: `url(${featuredHome.image})` }}
              />
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-extrabold text-primary">{featuredHome.title}</div>
                  <Badge variant="success">{featuredHome.fitScore}%</Badge>
                </div>
                <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">{featuredHome.area}</div>
                <div className="mt-2 text-xl font-extrabold text-primary">
                  ${featuredHome.perPersonPrice.toLocaleString()}
                  <span className="text-xs font-semibold text-muted-foreground"> / person</span>
                </div>
              </div>
            </button>
          ) : null}
          <div className="absolute bottom-4 left-4 right-4 rounded-md border bg-white/95 p-3 shadow-card sm:right-auto sm:max-w-[260px]">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <Navigation className="size-4 text-trust-sky" aria-hidden="true" />
              {homes.length} homes inside the match lane
            </div>
            <div className="mt-1 text-xs font-semibold text-muted-foreground">
              Prices shown per person after group split.
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 2xl:grid-cols-3">
          {homes.map((home) => (
            <div
              key={home.id}
              className="grid min-w-0 grid-cols-[98px_minmax(0,1fr)_42px] gap-3 rounded-md border bg-white p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-secondary/70 hover:shadow-card 2xl:grid-cols-1"
            >
              <button
                className="h-24 rounded-md bg-cover bg-center 2xl:h-28"
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">
                    {home.fitScore}% fit
                  </span>
                  <span className="rounded-full bg-trust-sky/10 px-2 py-0.5 text-[11px] font-bold text-trust-blue">
                    {home.commute}
                  </span>
                  <span className="rounded-full bg-trust-green/10 px-2 py-0.5 text-[11px] font-bold text-trust-green">
                    {home.trust.includes("房东") || home.trust.includes("Verified") ? "trust ready" : "verify next"}
                  </span>
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
    <Card className="border-border bg-white shadow-panel">
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
    <aside className="min-w-0">
      <Card className="sticky top-24 overflow-hidden border-border bg-white shadow-panel">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b bg-[linear-gradient(135deg,rgba(0,34,68,0.04),rgba(0,118,168,0.08))]">
          <div>
            <CardTitle>Deal Room</CardTitle>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">Budget · Chat · Trust · Tour</p>
          </div>
          <Badge variant={canRequestTour ? "trust" : "warning"}>
            {canRequestTour ? `${members.length} slots filled` : "Pending match"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4">
          {members.map((member) => (
            <div key={member.id ?? member.name} className="flex min-w-0 items-center gap-3 rounded-md border bg-white p-3 shadow-sm">
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
          <div
            className={cn(
              "rounded-md border p-3 text-sm font-semibold",
              canRequestTour
                ? "border-trust-green/20 bg-trust-green/10 text-trust-green"
                : "border-trust-amber/20 bg-trust-amber/10 text-trust-amber"
            )}
          >
            {canRequestTour
              ? "Match ready · group tour lane open."
              : "Pending like · group tour lane locked."}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border bg-white p-3">
              <div className="text-xs font-bold text-muted-foreground">Shared budget</div>
              <div className="mt-2 text-2xl font-extrabold text-primary">{sharedBudget}</div>
              <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">{targetBudget}</div>
            </div>
            <div className="rounded-md border bg-white p-3">
              <div className="text-xs font-bold text-muted-foreground">Tour status</div>
              <div className="mt-2 text-sm font-extrabold text-primary">
                {tourRequested && canRequestTour ? "Requested" : canRequestTour ? "Ready" : "Locked"}
              </div>
              <div className="mt-2 h-2 rounded-full bg-secondary">
                <div className={cn("h-2 rounded-full", canRequestTour ? "w-[88%] bg-trust-green" : "w-[38%] bg-trust-amber")} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-primary">Message preview</div>
              <MessageCircle className="size-4 text-trust-sky" aria-hidden="true" />
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {messages.map((message) => (
                <div
                  key={`${message.author}-${message.time}`}
                  className={cn(
                    "max-w-[92%] rounded-md border p-3 text-sm font-medium shadow-sm",
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
            </div>
          </div>

          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-extrabold text-primary">Trust checklist</div>
            <Badge variant="success">All clear</Badge>
          </div>
          <div className="flex flex-col gap-3">
            {trustChecklist.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-sm font-semibold">
                <span className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 fill-trust-green text-white" aria-hidden="true" />
                  <span className="truncate text-primary">{item.label}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{item.detail}</span>
              </div>
            ))}
          </div>
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
