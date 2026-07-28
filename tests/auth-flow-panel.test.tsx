import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AuthFlowPanel } from "../components/auth-flow-panel";
import { ProfileOnboarding } from "../components/profile-onboarding";

describe("progressive email auth UI", () => {
  it("renders the email step with an accessible email field", () => {
    const html = renderToStaticMarkup(
      <AuthFlowPanel
        token={null}
        user={null}
        profile={null}
        apiError={null}
        onboardingReason={null}
        isPinnedToPublish={false}
        onAuthenticated={vi.fn()}
        onProfileSave={vi.fn()}
        onOnboardingDismiss={vi.fn()}
        onLogout={vi.fn()}
        onClose={vi.fn()}
        onToast={vi.fn()}
      />
    );

    expect(html).toContain("邮箱登录");
    expect(html).toContain('type="email"');
    expect(html).toContain("发送验证码");
  });

  it("renders the four required onboarding fields and skip action", () => {
    const html = renderToStaticMarkup(
      <ProfileOnboarding
        reason="new-user"
        profile={null}
        pending={false}
        error={null}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(html).toContain("显示名称");
    expect(html).toContain("身份");
    expect(html).toContain("学校");
    expect(html).toContain("城市");
    expect(html).toContain("稍后完善");
  });
});
