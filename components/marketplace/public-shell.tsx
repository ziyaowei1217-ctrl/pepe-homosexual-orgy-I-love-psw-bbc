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

export function PublicShell({ active, mobileNavigation = "bottom", children }: { active: PublicNavKey; mobileNavigation?: "bottom" | "header"; children: ReactNode }) {
  return (
    <div className="marketplace-shell min-h-dvh bg-[#F5F8F5] text-[#203C30]">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] flex min-h-11 -translate-y-20 items-center rounded-full bg-[#234B3B] px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        跳到主要内容
      </a>

      <header className="sticky top-0 z-50 border-b border-[#234B3B]/15 bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-10">
          <Link href="/" className="flex min-h-11 shrink-0 flex-col justify-center" aria-label="psw 首页">
            <PswLogo className="h-8 w-[92px] sm:h-9 sm:w-auto" />
            <span className="hidden text-[11px] leading-4 text-[#416F5A] lg:block">留学生转租与接租</span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1.5 md:flex" aria-label="主导航">
            {publicNav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-medium text-[#416F5A] transition-colors hover:bg-[#F5F8F5] hover:text-[#234B3B]",
                  active === item.key && "bg-[#E9F2A9]/60 font-semibold text-[#234B3B]"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {mobileNavigation === "header" ? <nav aria-label="手机快捷导航" className="flex items-center gap-1 md:hidden">
              <Link href="/search" aria-label="转租" className="flex min-h-11 items-center gap-1 rounded-full px-1.5 text-[13px] font-medium text-[#234B3B] hover:bg-[#F5F8F5] sm:gap-1.5 sm:px-2.5 sm:text-sm"><Search className="size-3.5 sm:size-4" aria-hidden="true" />转租</Link>
              <Link href="/saved" aria-label="收藏房源" className="flex min-h-11 items-center gap-1 rounded-full px-1.5 text-[13px] font-medium text-[#234B3B] hover:bg-[#F5F8F5] sm:gap-1.5 sm:px-2.5 sm:text-sm"><Heart className="size-3.5 sm:size-4" aria-hidden="true" />收藏</Link>
            </nav> : null}
            <Link
              href="/host"
              className="hidden min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-medium text-[#234B3B] transition-colors hover:bg-[#F5F8F5] lg:inline-flex"
            >
              房东中心
            </Link>
            <Link
              href="/account"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[#234B3B]/20 bg-white p-1.5 text-sm font-medium text-[#234B3B] transition-colors hover:border-[#416F5A] hover:bg-[#F5F8F5] lg:pr-3"
              aria-label="打开账户"
            >
              <span className="grid size-8 place-items-center rounded-full bg-[#234B3B] text-white">
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
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[#234B3B]/15 bg-white px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden"
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
                "flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-medium text-[#416F5A]",
                active === item.key && "bg-[#F5F8F5] font-semibold text-[#234B3B]"
              )}
            >
              <Icon className={cn("size-5", active === item.key && "fill-[#E9F2A9]")} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav> : null}
    </div>
  );
}
