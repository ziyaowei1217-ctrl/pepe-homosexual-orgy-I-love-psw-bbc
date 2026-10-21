import {
  Heart,
  Mail,
  Menu,
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
  { key: "discover", label: "找房", href: "/search", icon: Search },
  { key: "roommates", label: "室友", href: "/roommates", icon: UsersRound },
  { key: "saved", label: "收藏", href: "/saved", icon: Heart },
  { key: "inbox", label: "消息", href: "/inbox", icon: Mail },
  { key: "account", label: "我的", href: "/account", icon: UserRound }
] as const;

export function PublicShell({ active, mobileNavigation = "bottom", children }: { active: PublicNavKey; mobileNavigation?: "bottom" | "header"; children: ReactNode }) {
  return (
    <div className="marketplace-shell min-h-dvh bg-surface-subtle text-ink">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-full bg-ink-block px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        跳到主要内容
      </a>

      <header className="sticky top-0 z-50 border-b border-line-strong/80 bg-surface/85 backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-surface">
        <div className="mx-auto flex h-[72px] max-w-[1520px] items-center gap-7 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex shrink-0 items-center rounded-full py-1 transition-transform hover:-translate-y-0.5" aria-label="psw 首页">
            <PswLogo height={34} title="psw" />
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="主导航">
            {publicNav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  "rounded-full px-[18px] py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink",
                  active === item.key && "bg-primary-soft font-bold text-primary-text hover:bg-primary-soft hover:text-primary-text"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {mobileNavigation === "header" ? <nav aria-label="手机快捷导航" className="flex items-center gap-1 md:hidden">
              <Link href="/search" aria-label="找房" className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface-subtle"><Search className="size-4" aria-hidden="true" />找房</Link>
              <Link href="/saved" aria-label="收藏房源" className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface-subtle"><Heart className="size-4" aria-hidden="true" />收藏</Link>
            </nav> : null}
            <Link
              href="/host"
              className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-subtle lg:inline-flex"
            >
              房东中心
            </Link>
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-full border border-line-strong bg-surface p-1.5 pr-3 text-sm font-semibold text-ink-secondary shadow-sm transition-shadow hover:shadow-md"
              aria-label="打开账户"
            >
              <span className="grid size-8 place-items-center rounded-full bg-ink-block text-white">
                <UserRound className="size-4" aria-hidden="true" />
              </span>
              <Menu className="size-4 text-ink-secondary" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <div id="main-content" className={cn(mobileNavigation === "bottom" && "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0")}>
        {children}
      </div>

      {mobileNavigation === "bottom" ? <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-line-strong/80 bg-surface/90 px-1 backdrop-blur-xl pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(29,22,64,0.08)] md:hidden"
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
                "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-xs font-semibold text-ink-secondary",
                active === item.key && "font-bold text-primary-text"
              )}
            >
              <span className={cn("grid h-[30px] w-[52px] place-items-center rounded-full transition-colors", active === item.key && "bg-primary-soft text-primary-text")}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav> : null}
    </div>
  );
}
