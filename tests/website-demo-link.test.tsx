// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppLink, { type AppLinkProps } from "../components/ui/app-link";

const { delegated } = vi.hoisted(() => ({ delegated: vi.fn() }));
vi.mock("next/link", () => ({
  default: (props: AppLinkProps) => {
    delegated(props);
    return <span data-testid="next-link">{props.children as ReactNode}</span>;
  }
}));

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true"); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("document navigation for unavailable website demo sections", () => {
  it.each([
    "/inbox", "/inbox/thread-a", "/messages?listingId=listing-a", "/account", "/account/profile",
    "/host", "/host/listings/new", "/applications", "/applications/new?listingId=listing-a",
    "/trips", "/listing/mine", "/roommates/likes", "/roommates/teams"
  ])("uses an ordinary anchor for the bounded unavailable route %s", href => {
    render(<AppLink href={href} className="primary-action" aria-label="Open section"><span>Section</span></AppLink>);
    const anchor = screen.getByRole("link", { name: "Open section" });
    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("href")).toBe(href);
    expect(anchor.getAttribute("data-website-demo-navigation")).toBe("document");
    expect(anchor.className).toBe("primary-action");
    expect(anchor.querySelector("span")?.textContent).toBe("Section");
    expect(delegated).not.toHaveBeenCalled();
  });

  it.each([
    "/", "/search?q=Boston", "/saved", "/roommates", "/roommates/profile-a", "/listing/listing-a",
    "/demo?section=inbox", "/api/health", "/admin", "/unknown-section"
  ])("preserves Next navigation for a public or unmapped destination %s", href => {
    render(<AppLink href={href} prefetch={false}>Section</AppLink>);
    expect(screen.getByTestId("next-link").textContent).toBe("Section");
    expect(delegated).toHaveBeenCalledOnce();
    expect(delegated.mock.calls[0][0]).toMatchObject({ href, prefetch: false });
    expect(document.querySelector('[data-website-demo-navigation="document"]')).toBeNull();
  });

  it.each([
    "inbox", "#inbox", "https://outside.invalid/inbox", "//outside.invalid/inbox", "/inbox/",
    "/inbox//thread", "/inbox/../account", "/inbox%2fthread", "/%69nbox", "/inbox/%252fprivate",
    "/inbox\\thread", "/inbox\u0000", { pathname: "/inbox", query: { listingId: "listing-a" } }
  ])("leaves ambiguous, absolute and object href %j with Next", href => {
    render(<AppLink href={href}>Section</AppLink>);
    expect(delegated).toHaveBeenCalledOnce();
    expect(delegated.mock.calls[0][0].href).toBe(href);
    expect(document.querySelector('[data-website-demo-navigation="document"]')).toBeNull();
  });

  it("retains Next routing for legacy child and as-path semantics", () => {
    const legacy = { href: "/inbox", legacyBehavior: true, children: <a>Legacy section</a> };
    const aliased = { href: "/inbox", as: "/messages", children: "Aliased section" };
    render(<><AppLink {...legacy} /><AppLink {...aliased} /></>);
    expect(delegated.mock.calls.map(([props]) => props)).toEqual([legacy, aliased]);
    expect(document.querySelector('[data-website-demo-navigation="document"]')).toBeNull();
  });

  it("delegates every production prop, handler and ref without modification", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "");
    const props: AppLinkProps = {
      href: "/inbox?listingId=a&tour=1#conversation", as: "/messages", replace: true, scroll: false,
      shallow: true, passHref: true, prefetch: false, locale: "en", legacyBehavior: true,
      className: "secondary-action", target: "_blank", rel: "noopener", "aria-label": "Messages",
      ref: createRef<HTMLAnchorElement>(), onClick: vi.fn(), onMouseEnter: vi.fn(), onTouchStart: vi.fn(),
      onNavigate: vi.fn(), children: <span>Messages</span>
    };
    render(<AppLink {...props} />);
    expect(delegated).toHaveBeenCalledOnce();
    expect(delegated.mock.calls[0][0]).toEqual(props);
    expect(delegated.mock.calls[0][0].onClick).toBe(props.onClick);
    expect(delegated.mock.calls[0][0].ref).toBe(props.ref);
  });

  it("preserves exact native href, new-tab attributes, ref and DOM handlers while filtering router props", () => {
    const href = "/inbox?listingId=a%2Fb&tour=1&note=%E4%BD%A0%E5%A5%BD#conversation";
    const ref = createRef<HTMLAnchorElement>(), onMouseEnter = vi.fn(), onTouchStart = vi.fn();
    const onNavigate = vi.fn();
    render(<AppLink href={href} ref={ref} target="_blank" rel="noopener noreferrer" download="demo.html"
      aria-label="Messages" data-caller="preserved" prefetch={false} replace scroll={false} shallow passHref
      locale="en" legacyBehavior={false} onNavigate={onNavigate} onMouseEnter={onMouseEnter} onTouchStart={onTouchStart}>
      Messages
    </AppLink>);
    const anchor = screen.getByRole("link", { name: "Messages" });
    expect(ref.current).toBe(anchor);
    expect(anchor.getAttribute("href")).toBe(href);
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor.getAttribute("download")).toBe("demo.html");
    expect(anchor.getAttribute("data-caller")).toBe("preserved");
    for (const name of ["as", "replace", "scroll", "shallow", "passHref", "prefetch", "locale", "legacyBehavior", "onNavigate"]) {
      expect(anchor.hasAttribute(name)).toBe(false);
    }
    fireEvent.mouseEnter(anchor); fireEvent.touchStart(anchor);
    expect(onMouseEnter).toHaveBeenCalledOnce(); expect(onTouchStart).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled(); expect(delegated).not.toHaveBeenCalled();
  });

  it.each([
    { button: 0 }, { button: 0, ctrlKey: true }, { button: 0, metaKey: true },
    { button: 0, shiftKey: true }, { button: 0, altKey: true }, { button: 1 }
  ])("keeps native default and caller handling for click %j", modifiers => {
    const observations: Array<{ defaultPrevented: boolean; button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = [];
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => {
      observations.push({ defaultPrevented: event.defaultPrevented, button: event.button, ctrlKey: event.ctrlKey,
        metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey });
    });
    render(<AppLink href="/inbox" onClick={onClick}>Messages</AppLink>);
    const anchor = screen.getByRole("link", { name: "Messages" });
    // Cancel only at the test document boundary, after the real caller runs,
    // so jsdom does not attempt a browser navigation it cannot implement.
    const preventTestNavigation = (event: Event) => { if (event.target === anchor) event.preventDefault(); };
    document.addEventListener("click", preventTestNavigation, { once: true });
    fireEvent(anchor, new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(observations).toEqual([{ defaultPrevented: false, button: modifiers.button,
      ctrlKey: "ctrlKey" in modifiers, metaKey: "metaKey" in modifiers,
      shiftKey: "shiftKey" in modifiers, altKey: "altKey" in modifiers }]);
  });

  it("respects a caller that cancels the native link", () => {
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    render(<AppLink href="/account" onClick={onClick}>Account</AppLink>);
    const anchor = screen.getByRole("link", { name: "Account" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(fireEvent(anchor, event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
