// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationDetailExperience, ApplicationFormExperience } from "../components/marketplace/application-experiences";
import { HostDashboardExperience } from "../components/marketplace/host-experiences";
import { InboxExperience } from "../components/marketplace/inbox-experience";
import { TripsExperience } from "../components/marketplace/trips-experience";
import { authRoute } from "../lib/app-routes";
import { createPreviewListings } from "../lib/preview-data";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const guestPages: { name: string; element: () => ReactNode; returnTo: string; emailCopy: string }[] = [
  { name: "inbox", element: () => <InboxExperience initialConversationId={null} />, returnTo: "/inbox", emailCopy: "和转租人、室友的消息都在这里。用邮箱验证码登录，不需要密码。" },
  { name: "host", element: () => <HostDashboardExperience />, returnTo: "/host", emailCopy: "用邮箱验证码登录后，就能看到你发布的房源和收到的申请。" },
  { name: "trips", element: () => <TripsExperience />, returnTo: "/trips", emailCopy: "用邮箱验证码登录，就能看到已接受的申请和下一步要做的事。" },
  { name: "application detail", element: () => <ApplicationDetailExperience applicationId="application-1" />, returnTo: "/applications/application-1", emailCopy: "用邮箱验证码登录，不需要密码。" }
];

describe("guest sign-in provider copy", () => {
  it.each(guestPages)("uses the configured provider on $name and keeps its sign-in destination", async ({ element, returnTo, emailCopy }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "neon");
    const google = render(element());
    expect(await screen.findByText(/使用 Google 账户登录/)).toBeTruthy();
    expect(google.container.textContent).not.toContain("邮箱验证码");
    expect(screen.getByRole("link", { name: "登录" }).getAttribute("href")).toBe(authRoute({ returnTo }));
    expect(fetch).not.toHaveBeenCalled();
    google.unmount();

    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "email");
    render(element());
    expect(await screen.findByText(emailCopy)).toBeTruthy();
    expect(screen.getByRole("link", { name: "登录" }).getAttribute("href")).toBe(authRoute({ returnTo }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("describes Google sign-in before application submission without falsely requiring invited-email OTP", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "neon");
    const google = render(<ApplicationFormExperience listing={createPreviewListings()[0]} />);
    expect(await screen.findByText("提交前需要使用 Google 账户登录。")).toBeTruthy();
    expect(google.container.textContent).not.toContain("目前仅支持受邀邮箱");
    google.unmount();

    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "email");
    render(<ApplicationFormExperience listing={createPreviewListings()[0]} />);
    expect(await screen.findByText("提交前需要登录，目前仅支持受邀邮箱或已有账户。")).toBeTruthy();
  });
});
