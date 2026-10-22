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

import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
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

// Site pages that exist today. Help, privacy and terms join this list once their pages are written.
const footerLinks = [
  { label: "找房", href: "/search" },
  { label: "找室友", href: "/roommates" },
  { label: "发布我的房间", href: "/host/listings/new" },
  { label: "房东中心", href: "/host" },
  { label: "账户与隐私设置", href: "/account/settings" }
] as const;

export function PublicShell({ active, mobileNavigation = "bottom", wide = false, stickyHeaderOnPhone = true, footer = true, children }: {
  active: PublicNavKey;
  mobileNavigation?: "bottom" | "header";
  /** Full-width pages (search with its map) line the header up with their own edges. */
  wide?: boolean;
  /** Pages with their own sticky toolbar let the header scroll away on phones to keep the screen for results. */
  stickyHeaderOnPhone?: boolean;
  footer?: boolean;
  children: ReactNode;
}) {
  const frame = wide ? "mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-8" : "page-container";
  return (
    <div className="marketplace-shell flex min-h-dvh flex-col bg-background text-ink">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-full bg-ink-block px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0"
      >
        跳到主要内容
      </a>

      <header className={cn("top-0 z-50 border-b border-line-strong bg-surface", stickyHeaderOnPhone ? "sticky" : "relative md:sticky")}>
        <div className={cn(frame, "flex h-[72px] items-center gap-7")}>
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
                  "flex min-h-11 items-center rounded-full px-[18px] text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink",
                  active === item.key && "bg-primary-soft font-bold text-primary-text hover:bg-primary-soft hover:text-primary-text"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {mobileNavigation === "header" ? <nav aria-label="手机快捷导航" className="flex items-center gap-1 md:hidden">
              <Link href="/search" aria-label="找房" className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[15px] font-semibold text-ink-secondary hover:bg-surface-subtle sm:px-2.5"><Search className="size-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">找房</span></Link>
              <Link href="/saved" aria-label="收藏房源" className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[15px] font-semibold text-ink-secondary hover:bg-surface-subtle sm:px-2.5"><Heart className="size-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">收藏</span></Link>
            </nav> : null}
            <AssistantLauncher />
            <Link
              href="/host"
              className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-subtle lg:inline-flex"
            >
              房东中心
            </Link>
            <Link
              href="/account"
              className="flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface p-1.5 pr-3 text-sm font-semibold text-ink-secondary transition-shadow hover:shadow-menu"
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

      <div id="main-content" className={cn("flex flex-1 flex-col", mobileNavigation === "bottom" && "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0")}>
        <div className="flex-1">{children}</div>
        {footer ? <footer className="border-t border-line-strong bg-surface">
          <div className={cn(frame, "flex flex-col gap-5 py-8 md:flex-row md:items-center md:gap-10")}>
            <div className="flex items-center gap-4">
              <PswLogo height={28} title="psw" />
              <p className="text-m-footnote text-ink-secondary">留学生之间的转租</p>
            </div>
            <nav aria-label="页脚" className="flex flex-1 flex-wrap gap-x-6 gap-y-1">
              {footerLinks.map((link) => <Link key={link.href} href={link.href} className="flex min-h-11 items-center text-d-subhead text-ink-secondary hover:text-ink">{link.label}</Link>)}
            </nav>
            <p className="text-m-footnote text-ink-secondary">© {new Date().getFullYear()} psw</p>
          </div>
        </footer> : null}
      </div>

      {mobileNavigation === "bottom" ? <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-line-strong bg-surface px-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden"
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
                "flex min-h-[50px] min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-bold leading-[14px] text-ink-secondary",
                active === item.key && "text-primary-text"
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
