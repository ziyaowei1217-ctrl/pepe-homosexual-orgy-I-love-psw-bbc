import {
  ArrowLeft,
  Building2,
  ClipboardCheck,
  Home,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PswMark } from "@/components/brand/psw-logo";
import { cn } from "@/lib/utils";

type HostNavKey = "overview" | "listings" | "applications" | "inbox";
type AdminNavKey = "overview" | "trust" | "roommates";

const hostNav = [
  { key: "overview", label: "概览", href: "/host", icon: LayoutDashboard },
  { key: "listings", label: "房源", href: "/host/listings", icon: Building2 },
  { key: "applications", label: "申请", href: "/host/applications", icon: ClipboardCheck },
  { key: "inbox", label: "消息", href: "/inbox", icon: Mail }
] as const;

const adminNav = [
  { key: "overview", label: "审核概览", href: "/admin", icon: LayoutDashboard },
  { key: "trust", label: "信任审核", href: "/admin/trust", icon: ShieldCheck },
  { key: "roommates", label: "室友资料", href: "/admin/roommates", icon: UsersRound }
] as const;

export function HostShell({ active, children }: { active: HostNavKey; children: ReactNode }) {
  return (
    <WorkspaceShell
      title="房东工作台"
      eyebrow="管理房源和申请"
      active={active}
      items={hostNav}
      accent="blue"
      accountLabel="房东账户"
    >
      {children}
    </WorkspaceShell>
  );
}

export function AdminShell({ active, children }: { active: AdminNavKey; children: ReactNode }) {
  return (
    <WorkspaceShell
      title="运营后台"
      eyebrow="审核与运营"
      active={active}
      items={adminNav}
      accent="navy"
      accountLabel="管理员"
    >
      {children}
    </WorkspaceShell>
  );
}

function WorkspaceShell<Key extends string>({ title, eyebrow, active, items, accent, accountLabel, children }: {
  title: string;
  eyebrow: string;
  active: Key;
  items: ReadonlyArray<{ key: Key; label: string; href: string; icon: typeof Home }>;
  accent: "blue" | "navy";
  accountLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface-subtle text-ink lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className={cn("hidden min-h-dvh flex-col border-r px-4 py-5 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh", accent === "blue" ? "border-ink/20 bg-ink-block" : "border-ink bg-ink-block")}>
        <Link href="/" className="flex items-center gap-3 rounded-[18px] px-2 py-2">
          <PswMark size={40} title="psw" />
          <span><span className="block font-rounded text-[15px] font-bold">{title}</span><span className="mt-0.5 block text-[11px] font-semibold text-on-dark-secondary">{eyebrow}</span></span>
        </Link>
        <nav className="mt-8 space-y-1" aria-label={`${title}导航`}>
          {items.map((item) => {
            const Icon = item.icon;
            return <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined} className={cn("flex items-center gap-3 rounded-[14px] px-3 py-3 text-sm font-bold text-on-dark-secondary transition-colors hover:bg-surface/10 hover:text-white", active === item.key && "bg-surface text-ink hover:bg-surface hover:text-ink")}><Icon className="size-4.5" />{item.label}</Link>;
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <Link href="/" className="flex min-h-11 items-center gap-2 rounded-psw-md px-3 text-sm font-bold text-on-dark-secondary hover:bg-surface/10 hover:text-white"><ArrowLeft className="size-4" />返回租客端</Link>
          <Link href="/account" className="flex items-center gap-3 rounded-[16px] border border-surface/10 bg-surface/[0.06] p-3"><span className="grid size-9 place-items-center rounded-full bg-surface/10"><UserRound className="size-4" /></span><span className="min-w-0"><span className="block text-xs font-black">{accountLabel}</span><span className="mt-0.5 block truncate text-[11px] text-on-dark-secondary">查看账户与权限</span></span></Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-line-strong bg-surface lg:hidden">
          <div className="flex h-[60px] items-center justify-between px-4"><Link href="/" className="flex items-center gap-2"><PswMark size={36} title="psw" /><span className="text-sm font-black">{title}</span></Link><Link href="/account" className="grid size-11 place-items-center rounded-full border border-line-strong" aria-label="打开账户"><UserRound className="size-4" /></Link></div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" aria-label={`${title}手机导航`}>{items.map((item) => { const Icon = item.icon; return <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined} className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold text-ink-secondary", active === item.key && "bg-primary text-white")}><Icon className="size-4" />{item.label}</Link>; })}</nav>
        </header>
        {children}
      </div>
    </div>
  );
}
