"use client";

import { Archive, Plus, RefreshCw, Save, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  archiveAdminRoommate,
  createAdminRoommate,
  getAdminRoommates,
  updateAdminRoommate,
  type ApiRoommate,
  type SessionUser,
  type UpsertAdminRoommateInput
} from "@/lib/api";
import {
  getActiveAdminStepUpToken,
  type AdminStepUpSession
} from "@/lib/admin-step-up";
import { toProductApiError } from "@/lib/product-errors";

const emptyDraft: UpsertAdminRoommateInput = {
  name: "",
  age: 23,
  role: "UCLA · 研究生 · 2026 秋季",
  image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  match: 90,
  budget: "$1,650/月",
  commute: "Westwood / Sawtelle",
  tags: ["早睡", "安静", "爱干净"]
};

export function AdminRoommatesScreen({
  token,
  user,
  stepUpSession,
  onStepUpRequired,
  onAuthenticationError,
  onToast
}: {
  token: string | null;
  user: SessionUser | null;
  stepUpSession: AdminStepUpSession | null;
  onStepUpRequired: () => void;
  onAuthenticationError?: (error: unknown) => void;
  onToast: (message: string) => void;
}) {
  const [profiles, setProfiles] = useState<ApiRoommate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpsertAdminRoommateInput>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const onAuthenticationErrorRef = useRef(onAuthenticationError);
  onAuthenticationErrorRef.current = onAuthenticationError;
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  useEffect(() => {
    if (!selectedProfile) return;

    setDraft({
      name: selectedProfile.name,
      age: selectedProfile.age,
      role: selectedProfile.role,
      image: selectedProfile.image,
      match: selectedProfile.match,
      budget: selectedProfile.budget,
      commute: selectedProfile.commute,
      tags: selectedProfile.tags
    });
  }, [selectedProfile]);

  const loadProfiles = useCallback(async () => {
    if (!token || user?.role !== "ADMIN") return;

    setLoading(true);
    try {
      const nextProfiles = await getAdminRoommates(token);
      setProfiles(nextProfiles);
      setSelectedId((current) => current ?? nextProfiles[0]?.id ?? null);
      onToastRef.current(`已加载 ${nextProfiles.length} 位室友资料`);
    } catch (error) {
      const productError = toProductApiError(error);
      if (productError.status === 401 && onAuthenticationErrorRef.current) {
        onAuthenticationErrorRef.current(productError);
        return;
      }
      onToastRef.current(`加载室友资料失败：${productError.message}`);
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  function resetDraft() {
    setSelectedId(null);
    setDraft(emptyDraft);
  }

  async function saveDraft() {
    if (!token || user?.role !== "ADMIN") return;
    const enhancedToken = getActiveAdminStepUpToken(stepUpSession);
    if (!enhancedToken) {
      onStepUpRequired();
      return;
    }

    setSaving(true);
    try {
      const saved = selectedProfile?.id
        ? await updateAdminRoommate(enhancedToken, selectedProfile.id, draft)
        : await createAdminRoommate(enhancedToken, draft);
      setProfiles((current) => {
        const exists = current.some((profile) => profile.id === saved.id);
        return exists
          ? current.map((profile) => profile.id === saved.id ? saved : profile)
          : [saved, ...current];
      });
      setSelectedId(saved.id ?? null);
      onToast(`${saved.name} 已保存，匹配推荐将使用这份资料。`);
    } catch (error) {
      const productError = toProductApiError(error);
      if (productError.code === "ADMIN_REAUTH_REQUIRED") {
        onStepUpRequired();
      } else if (productError.status === 401 && onAuthenticationError) {
        onAuthenticationError(error);
      } else {
        onToast(`保存失败：${productError.message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelectedProfile() {
    if (!token || user?.role !== "ADMIN" || !selectedProfile?.id) return;
    const enhancedToken = getActiveAdminStepUpToken(stepUpSession);
    if (!enhancedToken) {
      onStepUpRequired();
      return;
    }

    setSaving(true);
    try {
      const archived = await archiveAdminRoommate(enhancedToken, selectedProfile.id);
      setProfiles((current) => current.map((profile) => profile.id === archived.id ? archived : profile));
      onToast(`${archived.name} 已归档，已从活跃推荐中移除。`);
    } catch (error) {
      const productError = toProductApiError(error);
      if (productError.code === "ADMIN_REAUTH_REQUIRED") {
        onStepUpRequired();
      } else if (productError.status === 401 && onAuthenticationError) {
        onAuthenticationError(error);
      } else {
        onToast(`归档失败：${productError.message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return <AdminRoommatesGate title="请先登录管理员账户" detail="登录管理员账户后可以管理室友匹配资料。" />;
  }

  if (user?.role !== "ADMIN") {
    return <AdminRoommatesGate title="需要管理员权限" detail="此工作台只对负责匹配目录的管理员开放。" />;
  }

  return (
    <section className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 py-5 xl:grid-cols-[420px_minmax(0,1fr)] xl:px-6">
      <Card className="rounded-[32px] border-blue-100 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-3xl font-black text-primary">室友资料管理</CardTitle>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">新增、调整和归档用于匹配推荐的室友资料。</p>
            </div>
            <Button variant="outline" className="rounded-full font-bold" disabled={loading} onClick={() => void loadProfiles()}>
              <RefreshCw data-icon="inline-start" />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button className="rounded-full bg-[#006AFF] font-bold text-white hover:bg-[#0D4599]" onClick={resetDraft}>
            <Plus data-icon="inline-start" />
            新建资料
          </Button>
          {profiles.map((profile) => (
            <button
              key={profile.id ?? profile.name}
              className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4 text-left transition hover:bg-blue-50"
              type="button"
              onClick={() => setSelectedId(profile.id ?? null)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-primary">{profile.name}</div>
                  <div className="truncate text-xs font-bold text-muted-foreground">{profile.role}</div>
                </div>
                <Badge variant={profile.status === "hidden" ? "secondary" : "trust"}>
                  {profile.status === "hidden" ? "已归档" : "启用"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#006AFF]">
                <span>基础匹配度 {profile.match}%</span>
                <span>{profile.budget}</span>
                <span>{profile.commute}</span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border-blue-100 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-black text-primary">
            <Users className="size-6 text-[#006AFF]" aria-hidden="true" />
            {selectedProfile ? `编辑 ${selectedProfile.name}` : "新建室友资料"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AdminRoommateInput label="姓名" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
          <div className="grid gap-4 md:grid-cols-2">
            <AdminRoommateInput
              label="年龄"
              type="number"
              value={String(draft.age)}
              onChange={(age) => setDraft((current) => ({ ...current, age: Number(age) || current.age }))}
            />
            <AdminRoommateInput
              label="基础匹配度"
              type="number"
              value={String(draft.match)}
              onChange={(match) => setDraft((current) => ({ ...current, match: Math.max(0, Math.min(100, Number(match) || current.match)) }))}
            />
          </div>
          <AdminRoommateInput label="身份描述" value={draft.role} onChange={(role) => setDraft((current) => ({ ...current, role }))} />
          <AdminRoommateInput label="图片链接" value={draft.image} onChange={(image) => setDraft((current) => ({ ...current, image }))} />
          <div className="grid gap-4 md:grid-cols-2">
            <AdminRoommateInput label="预算" value={draft.budget} onChange={(budget) => setDraft((current) => ({ ...current, budget }))} />
            <AdminRoommateInput label="通勤区域" value={draft.commute} onChange={(commute) => setDraft((current) => ({ ...current, commute }))} />
          </div>
          <AdminRoommateInput
            label="标签（逗号分隔）"
            value={draft.tags.join(", ")}
            onChange={(tags) => setDraft((current) => ({ ...current, tags: splitTags(tags) }))}
          />
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-full bg-[#006AFF] font-black text-white hover:bg-[#0D4599]" disabled={saving} onClick={() => void saveDraft()}>
              <Save data-icon="inline-start" />
              {saving ? "保存中…" : "保存资料"}
            </Button>
            {selectedProfile?.status !== "hidden" ? (
              <Button variant="outline" className="rounded-full font-black" disabled={saving || !selectedProfile?.id} onClick={() => void archiveSelectedProfile()}>
                <Archive data-icon="inline-start" />
                归档
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function AdminRoommatesGate({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <Card className="rounded-[32px] border-blue-100 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardContent className="p-8">
          <div className="text-3xl font-black text-primary">{title}</div>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">{detail}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function AdminRoommateInput({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase text-muted-foreground">
      {label}
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}
