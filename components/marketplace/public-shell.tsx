import {
  Heart,
  Mail,
  Search,
  UserRound,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PswLogo } from "@/components/brand/psw-logo";
import { cn } from "@/lib/utils";

export type PublicNavKey = "discover" | "roommates" | "saved" | "inbox" | "account";

const publicNav = [
  { key: "discover", label: "转租", href: "/search", icon: Search },
  { key: "roommates", label: "室友", href: "/roommates", icon: UsersRound },
  { key: "saved", label: "收藏", href: "/saved", icon: Heart },
  { key: "inbox", label: "消息", href: "/inbox", icon: Mail },
  { key: "account", label: "我的", href: "/account", icon: UserRound }
] as const;

export function PublicShell({ active, mobileNavigation = "bottom", children }: { active?: PublicNavKey; mobileNavigation?: "bottom" | "header"; children: ReactNode }) {
  return (
    <div className="marketplace-shell min-h-dvh bg-[#f4f5fa] text-[#0b1026]">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] flex min-h-11 -translate-y-20 items-center rounded-full bg-[#2453ff] px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        跳到主要内容
      </a>

      <header className="sticky top-0 z-50 border-b border-[#e3e6ef] bg-white/85 backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1520px] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
          <Link href="/" className="group flex min-h-11 shrink-0 items-center gap-3" aria-label="psw 首页">
            <span className="grid size-10 place-items-center rounded-[12px] bg-[#2453ff] transition-transform group-hover:-translate-y-0.5"><PswLogo variant="mark" inverse className="h-8 w-8" /></span>
            <span className={cn("block", mobileNavigation === "header" && "hidden sm:block")}><span className="font-display block text-[28px] font-bold leading-none text-[#0b1026]">psw</span><span className="hidden text-[11px] leading-4 text-[#5b6380] lg:block">留学生转租与接租</span></span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1.5 md:flex" aria-label="主导航">
            {publicNav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-medium text-[#5b6380] transition-colors hover:bg-[#eaeeff] hover:text-[#0b1026]",
                  active === item.key && "bg-[#0b1026] font-bold text-white hover:bg-[#0b1026] hover:text-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {mobileNavigation === "header" ? <nav aria-label="手机快捷导航" className="flex items-center gap-1 md:hidden">
              <Link href="/search" aria-label="转租" className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[13px] font-medium text-[#0b1026] hover:bg-[#eaeeff] sm:gap-1.5 sm:px-2.5 sm:text-sm"><Search className="size-3.5 sm:size-4" aria-hidden="true" />转租</Link>
              <Link href="/saved" aria-label="收藏房源" className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[13px] font-medium text-[#0b1026] hover:bg-[#eaeeff] sm:gap-1.5 sm:px-2.5 sm:text-sm"><Heart className="size-3.5 sm:size-4" aria-hidden="true" />收藏</Link>
            </nav> : null}
            <Link
              href="/host"
              className="hidden min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-medium text-[#0b1026] transition-colors hover:bg-[#eaeeff] lg:inline-flex"
            >
              房东中心
            </Link>
            <Link
              href="/account"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[#cdd2e0] bg-white p-1.5 text-sm font-medium text-[#0b1026] transition-colors hover:border-[#2453ff] hover:bg-[#eaeeff] lg:pr-3"
              aria-label="打开账户"
            >
              <span className="grid size-8 place-items-center rounded-full bg-[#0b1026] text-white">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <span className="hidden text-[13px] lg:block">我的账户</span>
            </Link>
          </div>
        </div>
      </header>

      <div id="main-content" tabIndex={-1} className={cn(mobileNavigation === "bottom" && "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0")}>
        {children}
      </div>

      {mobileNavigation === "bottom" ? <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[#e3e6ef] bg-white/90 px-1 backdrop-blur-xl shadow-[0_-8px_30px_rgba(11,16,38,0.08)] pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden"
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
                "flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-xs font-semibold leading-4 text-[#5b6380]",
                active === item.key && "font-bold text-[#0b1026]"
              )}
            >
              <span className={cn("grid h-[30px] w-[52px] place-items-center rounded-full transition-colors", active === item.key && "bg-[#0b1026] text-white")}><Icon className="size-5" aria-hidden="true" /></span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav> : null}
    </div>
  );
}
