"use client";

import { Archive, Plus, RefreshCw, Save, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

const emptyDraft: UpsertAdminRoommateInput = {
  name: "",
  age: 23,
  role: "UCLA · Grad student · Fall 2026",
  image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  match: 90,
  budget: "$1,650/月",
  commute: "Westwood / Sawtelle",
  tags: ["早睡", "安静", "爱干净"]
};

export function AdminRoommatesScreen({
  token,
  user,
  onToast
}: {
  token: string | null;
  user: SessionUser | null;
  onToast: (message: string) => void;
}) {
  const [profiles, setProfiles] = useState<ApiRoommate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpsertAdminRoommateInput>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
      onToast(`Loaded ${nextProfiles.length} roommate profiles`);
    } catch (error) {
      onToast(error instanceof Error ? `Failed to load roommate profiles: ${error.message}` : "Failed to load roommate profiles");
    } finally {
      setLoading(false);
    }
  }, [onToast, token, user?.role]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  function resetDraft() {
    setSelectedId(null);
    setDraft(emptyDraft);
  }

  async function saveDraft() {
    if (!token || user?.role !== "ADMIN") return;

    setSaving(true);
    try {
      const saved = selectedProfile?.id
        ? await updateAdminRoommate(token, selectedProfile.id, draft)
        : await createAdminRoommate(token, draft);
      setProfiles((current) => {
        const exists = current.some((profile) => profile.id === saved.id);
        return exists
          ? current.map((profile) => profile.id === saved.id ? saved : profile)
          : [saved, ...current];
      });
      setSelectedId(saved.id ?? null);
      onToast(`${saved.name} saved. The matching deck will use this profile.`);
    } catch (error) {
      onToast(error instanceof Error ? `Save failed: ${error.message}` : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelectedProfile() {
    if (!token || user?.role !== "ADMIN" || !selectedProfile?.id) return;

    setSaving(true);
    try {
      const archived = await archiveAdminRoommate(token, selectedProfile.id);
      setProfiles((current) => current.map((profile) => profile.id === archived.id ? archived : profile));
      onToast(`${archived.name} archived and removed from active discovery.`);
    } catch (error) {
      onToast(error instanceof Error ? `Archive failed: ${error.message}` : "Archive failed");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return <AdminRoommatesGate title="Sign in required" detail="Log in as an admin to manage roommate deck profiles." />;
  }

  if (user?.role !== "ADMIN") {
    return <AdminRoommatesGate title="Admin access required" detail="This workspace is for developers/admins managing the matching catalog." />;
  }

  return (
    <section className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 py-5 xl:grid-cols-[420px_minmax(0,1fr)] xl:px-6">
      <Card className="rounded-[32px] border-blue-100 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-3xl font-black text-primary">Roommate Admin</CardTitle>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Add, tune, and archive profiles used by the swipe deck.</p>
            </div>
            <Button variant="outline" className="rounded-full font-bold" disabled={loading} onClick={() => void loadProfiles()}>
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button className="rounded-full bg-[#006AFF] font-bold text-white hover:bg-[#0D4599]" onClick={resetDraft}>
            <Plus data-icon="inline-start" />
            New profile
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
                  {profile.status ?? "active"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#006AFF]">
                <span>{profile.match}% base</span>
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
            {selectedProfile ? `Edit ${selectedProfile.name}` : "Create roommate profile"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AdminRoommateInput label="Name" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
          <div className="grid gap-4 md:grid-cols-2">
            <AdminRoommateInput
              label="Age"
              type="number"
              value={String(draft.age)}
              onChange={(age) => setDraft((current) => ({ ...current, age: Number(age) || current.age }))}
            />
            <AdminRoommateInput
              label="Base match"
              type="number"
              value={String(draft.match)}
              onChange={(match) => setDraft((current) => ({ ...current, match: Math.max(0, Math.min(100, Number(match) || current.match)) }))}
            />
          </div>
          <AdminRoommateInput label="Role" value={draft.role} onChange={(role) => setDraft((current) => ({ ...current, role }))} />
          <AdminRoommateInput label="Image URL" value={draft.image} onChange={(image) => setDraft((current) => ({ ...current, image }))} />
          <div className="grid gap-4 md:grid-cols-2">
            <AdminRoommateInput label="Budget" value={draft.budget} onChange={(budget) => setDraft((current) => ({ ...current, budget }))} />
            <AdminRoommateInput label="Commute" value={draft.commute} onChange={(commute) => setDraft((current) => ({ ...current, commute }))} />
          </div>
          <AdminRoommateInput
            label="Tags, comma-separated"
            value={draft.tags.join(", ")}
            onChange={(tags) => setDraft((current) => ({ ...current, tags: splitTags(tags) }))}
          />
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-full bg-[#006AFF] font-black text-white hover:bg-[#0D4599]" disabled={saving} onClick={() => void saveDraft()}>
              <Save data-icon="inline-start" />
              {saving ? "Saving..." : "Save profile"}
            </Button>
            {selectedProfile?.status !== "hidden" ? (
              <Button variant="outline" className="rounded-full font-black" disabled={saving || !selectedProfile?.id} onClick={() => void archiveSelectedProfile()}>
                <Archive data-icon="inline-start" />
                Archive
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
