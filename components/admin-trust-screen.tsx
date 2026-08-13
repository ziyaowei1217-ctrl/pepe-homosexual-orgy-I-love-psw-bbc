"use client";

import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  approveAdminListing,
  getAdminListingReviewQueue,
  rejectAdminListing,
  type ApiListing,
  type ApiTrustQueue,
  type SessionUser
} from "@/lib/api";
import {
  getActiveAdminStepUpToken,
  type AdminStepUpSession
} from "@/lib/admin-step-up";
import { toProductApiError } from "@/lib/product-errors";

type PendingDecision = {
  listingId: string;
  kind: "approve" | "reject";
  reason: string;
};

export function AdminTrustScreen({
  token,
  user,
  stepUpSession,
  onStepUpRequired,
  onCatalogChanged,
  onTrustMetricsChanged,
  onToast,
  onAuthenticationError,
  trustMetrics = []
}: {
  token: string | null;
  user: SessionUser | null;
  stepUpSession: AdminStepUpSession | null;
  onStepUpRequired: () => void;
  onCatalogChanged: () => Promise<void>;
  onTrustMetricsChanged: () => Promise<void>;
  onToast: (message: string) => void;
  onAuthenticationError?: (error: unknown) => void;
  trustMetrics?: ApiTrustQueue[];
}) {
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const onAuthenticationErrorRef = useRef(onAuthenticationError);
  onAuthenticationErrorRef.current = onAuthenticationError;

  const loadQueue = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;
    setLoading(true);
    try {
      const nextListings = await getAdminListingReviewQueue(token);
      setListings(nextListings);
      return { status: "success" as const, listings: nextListings };
    } catch (error) {
      const productError = toProductApiError(error);
      if (productError.status === 401 && onAuthenticationErrorRef.current) {
        onAuthenticationErrorRef.current(error);
        return { status: "authentication-error" as const };
      } else {
        onToastRef.current(`审核队列加载失败：${productError.message}`);
        return { status: "error" as const };
      }
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    setListings([]);
    setPendingDecision(null);
    if (!token || user?.role !== "ADMIN") return;

    setLoading(true);
    void loadQueue();
  }, [loadQueue, token, user?.role]);

  if (!token) {
    return <AdminTrustGate title="请登录管理员账户" detail="登录后可以审核待发布房源。" />;
  }

  if (user?.role !== "ADMIN") {
    return <AdminTrustGate title="需要管理员权限" detail="此页面只对平台管理员开放。" />;
  }

  async function submitDecision() {
    if (!pendingDecision || submitting) return;
    const enhancedToken = getActiveAdminStepUpToken(stepUpSession);
    if (!enhancedToken) {
      onStepUpRequired();
      return;
    }
    if (pendingDecision.kind === "reject" && pendingDecision.reason.trim().length === 0) return;

    setSubmitting(true);
    try {
      if (pendingDecision.kind === "approve") {
        await approveAdminListing(enhancedToken, pendingDecision.listingId);
      } else {
        await rejectAdminListing(
          enhancedToken,
          pendingDecision.listingId,
          pendingDecision.reason.trim()
        );
      }

      setListings((current) => current.filter((listing) => listing.id !== pendingDecision.listingId));
      setPendingDecision(null);
      try {
        const refreshes = await Promise.allSettled([
          loadQueue(),
          onCatalogChanged(),
          onTrustMetricsChanged()
        ]);
        const queueRefresh = refreshes[0];
        const authenticationFailed =
          (queueRefresh.status === "fulfilled" &&
            queueRefresh.value?.status === "authentication-error") ||
          refreshes.some(
            (refresh) =>
              refresh.status === "rejected" &&
              toProductApiError(refresh.reason).status === 401
          );
        if (authenticationFailed) {
          const authenticationRefresh = refreshes.find(
            (refresh) =>
              refresh.status === "rejected" &&
              toProductApiError(refresh.reason).status === 401
          );
          if (authenticationRefresh?.status === "rejected") {
            onAuthenticationErrorRef.current?.(authenticationRefresh.reason);
          }
          return;
        }
        const refreshFailed =
          refreshes.some((refresh) => refresh.status === "rejected") ||
          (queueRefresh.status === "fulfilled" && queueRefresh.value?.status !== "success");
        onToast(
          refreshFailed
            ? "审核决定已成功，但刷新失败，请重试。"
            : pendingDecision.kind === "approve"
              ? "房源已通过审核。"
              : "房源已拒绝并已通知发布者。"
        );
      } catch {
        onToast("审核决定已成功，但刷新失败，请重试。");
      }
    } catch (error) {
      const productError = toProductApiError(error);
      if (productError.code === "ADMIN_REAUTH_REQUIRED") {
        onStepUpRequired();
      } else if (productError.status === 401 && onAuthenticationError) {
        onAuthenticationError(error);
      } else {
        onToast(productError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="app-shell py-5 md:py-6" aria-labelledby="admin-trust-title">
      <div className="editorial-toolbar">
        <div>
          <span className="editorial-kicker">01 / 信任</span>
          <h1 id="admin-trust-title" className="mt-2 text-3xl font-black tracking-[-0.035em] md:text-4xl">
            房源审核队列
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">逐项核验待发布房源，决定会立即同步到公开目录。</p>
        </div>
        <Button type="button" variant="outline" disabled={loading || submitting} onClick={() => void loadQueue()}>
          刷新队列
        </Button>
      </div>

      <div className="mt-5 grid gap-4">
        {trustMetrics.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trustMetrics.map((metric) => (
              <div key={metric.id ?? metric.label} className="rounded-md border bg-secondary/40 p-3">
                <div className="text-xs font-bold text-muted-foreground">{metric.label}</div>
                <div className="mt-1 text-2xl font-black text-primary">{metric.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        {loading && listings.length === 0 ? <p className="text-sm font-semibold text-muted-foreground">正在加载审核队列…</p> : null}
        {!loading && listings.length === 0 ? <p className="rounded-md border border-dashed bg-secondary p-5 text-sm font-semibold text-muted-foreground">当前没有待审核房源。</p> : null}
        {listings.map((listing) => {
          const decision = pendingDecision?.listingId === listing.id ? pendingDecision : null;
          return (
            <Card key={listing.id} className="shadow-panel">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{listing.title}</CardTitle>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">{listing.area} · ${listing.price}/月 · 提交于 {formatTimestamp(listing.submittedAt)}</p>
                  </div>
                  <Badge variant="warning">待审核</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  {listing.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                </div>
                {!decision ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="trust" disabled={submitting} onClick={() => setPendingDecision({ listingId: listing.id, kind: "approve", reason: "" })}>
                      <CheckCircle2 data-icon="inline-start" />
                      通过
                    </Button>
                    <Button type="button" variant="destructive" disabled={submitting} onClick={() => setPendingDecision({ listingId: listing.id, kind: "reject", reason: "" })}>
                      <XCircle data-icon="inline-start" />
                      拒绝
                    </Button>
                  </div>
                ) : decision.kind === "approve" ? (
                  <DecisionConfirmation
                    label="确认通过"
                    submitting={submitting}
                    onConfirm={() => void submitDecision()}
                    onCancel={() => setPendingDecision(null)}
                  />
                ) : (
                  <div className="grid gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                    <label className="grid gap-1 text-sm font-bold text-primary">
                      拒绝原因
                      <Input
                        name="rejection-reason"
                        value={decision.reason}
                        disabled={submitting}
                        onChange={(event) => setPendingDecision((current) => current && current.listingId === listing.id ? { ...current, reason: event.target.value } : current)}
                      />
                    </label>
                    <DecisionConfirmation
                      label="确认拒绝"
                      disabled={decision.reason.trim().length === 0}
                      submitting={submitting}
                      onConfirm={() => void submitDecision()}
                      onCancel={() => setPendingDecision(null)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function DecisionConfirmation({
  label,
  disabled = false,
  submitting,
  onConfirm,
  onCancel
}: {
  label: string;
  disabled?: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-secondary/40 p-3">
      <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
      <span className="mr-auto text-sm font-semibold text-primary">此决定会改变公开房源状态。</span>
      <Button type="button" variant="trust" disabled={disabled || submitting} onClick={onConfirm}>{label}</Button>
      <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>取消</Button>
    </div>
  );
}

function AdminTrustGate({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="app-shell py-10">
      <Card className="mx-auto max-w-3xl shadow-panel">
        <CardContent className="p-8">
          <h1 className="text-3xl font-black text-primary">{title}</h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">{detail}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "未知时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知时间" : date.toLocaleString("zh-CN");
}
