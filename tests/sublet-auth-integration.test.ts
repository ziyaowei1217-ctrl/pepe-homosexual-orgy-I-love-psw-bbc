// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer
} from "./support/dom-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { ProfileOnboarding } from "../components/profile-onboarding";
import { PublishScreen } from "../components/sublet-app";
import type { ApiProfile, SessionUser } from "../lib/api";
import {
  beginLatestRequest,
  commitLatestRequest,
  getPublishAccess,
  invalidateLatestRequests,
  runGuardedPublishAction
} from "../lib/auth-flow";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const user: SessionUser = {
  id: "user-1",
  email: "maya@example.edu",
  role: "USER"
};

const completeListerProfile: ApiProfile = {
  id: "profile-1",
  email: "maya@example.edu",
  displayName: "Maya Chen",
  avatarUrl: null,
  school: "UCLA",
  city: "Los Angeles",
  role: "lister",
  eduEmailVerified: true,
  phoneVerified: false,
  wechat: null,
  instagram: null,
  bio: null
};

const incompleteListerProfile: ApiProfile = {
  ...completeListerProfile,
  displayName: null,
  school: null,
  city: null
};

function findByName(root: ReactTestInstance, name: string) {
  return root.find(
    (node) =>
      (node.type === "input" || node.type === "select") &&
      node.props.name === name
  );
}

describe("sublet auth state integration", () => {
  it("defers the incomplete-profile gate while the current profile is loading", () => {
    const access = getPublishAccess({
      authenticated: true,
      profile: null,
      profileStatus: "loading"
    });

    expect(access.status).toBe("profile-loading");
    const html = renderToStaticMarkup(
      createElement(PublishScreen, {
        isPublishing: false,
        listings: [],
        user,
        publishAccess: access,
        editingListingId: null,
        onEditListing: vi.fn(),
        onSave: vi.fn()
      })
    );

    expect(html).toContain("正在读取身份资料");
    expect(html).not.toContain("请先完善身份资料");
    expect(html).not.toContain("保存草稿");
  });

  it("hydrates an asynchronously loaded profile without overwriting dirty onboarding fields", async () => {
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        createElement(ProfileOnboarding, {
          reason: "publish-required",
          profile: null,
          pending: false,
          error: null,
          onSave: vi.fn(),
          onDismiss: vi.fn()
        })
      );
    });

    await act(async () => {
      findByName(renderer!.root, "displayName").props.onChange({
        target: { value: "Local edit" }
      });
      renderer!.update(
        createElement(ProfileOnboarding, {
          reason: "publish-required",
          profile: completeListerProfile,
          pending: false,
          error: null,
          onSave: vi.fn(),
          onDismiss: vi.fn()
        })
      );
    });

    expect(findByName(renderer!.root, "displayName").props.value).toBe(
      "Local edit"
    );
    expect(findByName(renderer!.root, "school").props.value).toBe("UCLA");
    expect(findByName(renderer!.root, "city").props.value).toBe("Los Angeles");
    expect(findByName(renderer!.root, "role").props.value).toBe("lister");

    await act(async () => {
      renderer!.unmount();
    });
  });

  it("ignores an older profile load after a newer save succeeds", async () => {
    const guard = { current: 0 };
    const requestVersion = beginLatestRequest(guard);
    let resolveLoad: ((profile: ApiProfile) => void) | undefined;
    let visibleProfile: ApiProfile = incompleteListerProfile;
    const oldLoad = new Promise<ApiProfile>((resolve) => {
      resolveLoad = resolve;
    }).then((loadedProfile) => {
      commitLatestRequest(guard, requestVersion, () => {
        visibleProfile = loadedProfile;
      });
    });

    invalidateLatestRequests(guard);
    visibleProfile = completeListerProfile;
    resolveLoad?.(incompleteListerProfile);
    await oldLoad;

    expect(visibleProfile).toBe(completeListerProfile);
  });

  it("blocks incomplete listers before rendering or invoking a publish action", async () => {
    const publishAction = vi.fn().mockResolvedValue("created");
    const attempt = await runGuardedPublishAction(
      {
        authenticated: true,
        profile: incompleteListerProfile,
        profileStatus: "loaded"
      },
      publishAction
    );

    expect(attempt.gate.status).toBe("needs-profile");
    expect(publishAction).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(
      createElement(PublishScreen, {
        isPublishing: false,
        listings: [],
        user,
        publishAccess: attempt.gate,
        editingListingId: null,
        onEditListing: vi.fn(),
        onSave: vi.fn()
      })
    );
    expect(html).toContain("请先完善身份资料");
    expect(html).not.toContain("保存草稿");
  });

  it("allows a complete lister to render and invoke the publish action", async () => {
    const publishAction = vi.fn().mockResolvedValue("created");
    const attempt = await runGuardedPublishAction(
      {
        authenticated: true,
        profile: completeListerProfile,
        profileStatus: "loaded"
      },
      publishAction
    );

    expect(attempt).toMatchObject({
      gate: { status: "allowed" },
      value: "created"
    });
    expect(publishAction).toHaveBeenCalledTimes(1);
    expect(
      renderToStaticMarkup(
        createElement(PublishScreen, {
          isPublishing: false,
          listings: [],
          user,
          publishAccess: attempt.gate,
          editingListingId: null,
          onEditListing: vi.fn(),
          onSave: vi.fn()
        })
      )
    ).toContain("保存草稿");
  });
});
