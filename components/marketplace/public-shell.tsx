import {
  Heart,
  Home,
  Mail,
  Menu,
  Search,
  UserRound,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PublicNavKey = "discover" | "roommates" | "saved" | "inbox" | "account";

const publicNav = [
  { key: "discover", label: "找房", href: "/search", icon: Search },
  { key: "roommates", label: "室友", href: "/roommates", icon: UsersRound },
  { key: "saved", label: "收藏", href: "/saved", icon: Heart },
  { key: "inbox", label: "消息", href: "/inbox", icon: Mail },
  { key: "account", label: "我的", href: "/account", icon: UserRound }
] as const;

export function PublicShell({ active, mobileNavigation = "bottom", children }: { active: PublicNavKey; mobileNavigation?: "bottom" | "header"; children: ReactNode }) {
  return (
    <div className="marketplace-shell min-h-dvh bg-[#f7f8fb] text-slate-950">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        跳到主要内容
      </a>

      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1520px] items-center gap-7 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="Sublet Pipeline 首页">
            <span className="grid size-10 place-items-center rounded-[14px] bg-[#0668e1] text-white shadow-[0_10px_28px_rgba(6,104,225,0.25)] transition-transform group-hover:-translate-y-0.5">
              <Home className="size-[19px]" aria-hidden="true" />
            </span>
            <span className="hidden sm:block">
              <span className="block text-[15px] font-black tracking-[-0.02em]">Sublet Pipeline</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Live well, sooner</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="主导航">
            {publicNav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950",
                  active === item.key && "bg-blue-50 text-[#0668e1]"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {mobileNavigation === "header" ? <nav aria-label="手机快捷导航" className="flex items-center gap-1 md:hidden">
              <Link href="/search" aria-label="找房" className="flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"><Search className="size-4" aria-hidden="true" />找房</Link>
              <Link href="/saved" aria-label="收藏房源" className="flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"><Heart className="size-4" aria-hidden="true" />收藏</Link>
            </nav> : null}
            <Link
              href="/host"
              className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 lg:inline-flex"
            >
              房东中心
            </Link>
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 pr-3 text-sm font-semibold text-slate-700 shadow-sm transition-shadow hover:shadow-md"
              aria-label="打开账户"
            >
              <span className="grid size-8 place-items-center rounded-full bg-slate-950 text-white">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <Menu className="size-4 text-slate-500" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div id="main-content" className={cn(mobileNavigation === "bottom" && "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0")}>
        {children}
      </div>

      {mobileNavigation === "bottom" ? <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] md:hidden"
        aria-label="手机导航"
      >
        {publicNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-xs font-bold text-slate-600",
                active === item.key && "text-[#0668e1]"
              )}
            >
              <Icon className={cn("size-5", active === item.key && "fill-blue-50")} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav> : null}
    </div>
  );
}
