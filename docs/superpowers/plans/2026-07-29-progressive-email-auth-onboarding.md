# 渐进式邮箱登录与新用户引导实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有邮箱验证码认证升级为清晰的分步登录/自动注册流程，并在首次登录后提供可跳过、在发布房源前必须补全的资料引导。

**Architecture:** 后端在验证码验证响应中明确返回 `isNewUser`；前端用独立的 `lib/auth-flow.ts` 承载邮箱、验证码、资料完整度和发布门槛规则。`AuthFlowPanel` 与 `ProfileOnboarding` 负责界面状态，`SubletApp` 只保留会话、资料、路由意图和全局反馈的编排。

**Tech Stack:** Next.js 15、React 19、TypeScript、NestJS、Prisma、Vitest、PostgreSQL、浏览器自动化。

## Global Constraints

- 保留无密码邮箱验证码认证；不增加密码、OAuth、手机验证码或找回密码。
- 新用户资料引导必须可以跳过，普通浏览不因资料不完整而受阻。
- 本次只为发布房源设置强制资料门槛。
- 首次引导只收集显示名称、身份、学校和城市。
- 微信、Instagram 与个人简介继续留在完整资料编辑区域。
- 所有用户可见错误使用中文，不暴露 NestJS、Prisma 或数据库内部消息。
- 网络失败、验证失败和资料保存失败不得伪造成功状态。
- 不增加新的运行时依赖。

---

### Task 1: 在 API 中区分首次注册与已有用户登录

**Files:**
- Modify: `api/src/auth/auth.service.ts`
- Modify: `api/test/auth.service.spec.ts`
- Modify: `lib/api.ts`

**Interfaces:**
- Consumes: `AuthService.verifyEmailCode(dto: VerifyEmailDto)`、Prisma `user.findUnique` 与 `user.upsert`。
- Produces: `VerifyEmailResponse = { accessToken: string; user: SessionUser; isNewUser: boolean }`。

- [ ] **Step 1: 为首次注册标记编写失败测试**

在 `api/test/auth.service.spec.ts` 的首个验证码成功测试中增加：

```ts
expect(session.isNewUser).toBe(true);
```

再增加已有用户再次登录测试：

```ts
it("marks a returning email login as an existing user", async () => {
  const prisma = createPrismaMock();
  const jwt = new JwtService({ secret: "test-secret" });
  const sender = createEmailSenderMock();
  const service = createAuthService(prisma, jwt, {
    nodeEnv: "development",
    emailSender: sender,
    codeRequestCooldownMs: 0
  });

  const first = await service.requestEmailCode("student@northeastern.edu");
  if (!first.devCode) throw new Error("Expected development verification code");
  await service.verifyEmailCode({
    email: "student@northeastern.edu",
    code: first.devCode
  });

  const second = await service.requestEmailCode("student@northeastern.edu");
  if (!second.devCode) throw new Error("Expected development verification code");
  const session = await service.verifyEmailCode({
    email: "student@northeastern.edu",
    code: second.devCode
  });

  expect(session.isNewUser).toBe(false);
});
```

给 `createPrismaMock().user` 增加 `findUnique`，从 `state.user` 返回匹配邮箱的用户或 `null`，使测试只因缺少 `isNewUser` 失败。

- [ ] **Step 2: 运行 API 认证测试并确认失败原因**

Run:

```bash
pnpm --dir api test -- auth.service.spec.ts
```

Expected: FAIL，首次和再次登录的 `isNewUser` 均为 `undefined`。

- [ ] **Step 3: 在验证成功路径中计算并返回新用户标记**

在 `user.upsert` 前查询已有用户：

```ts
const existingUser = await this.prisma.user.findUnique({
  where: { email },
  select: { id: true }
});
const isNewUser = existingUser === null;
```

保留现有管理员角色更新、Profile upsert 和验证码消费顺序，并在响应中加入：

```ts
return {
  accessToken: await this.jwt.signAsync({
    sub: user.id,
    email: user.email,
    role: user.role
  }),
  user,
  isNewUser
};
```

在 `lib/api.ts` 扩展类型：

```ts
export type VerifyEmailResponse = {
  accessToken: string;
  user: SessionUser;
  isNewUser: boolean;
};
```

- [ ] **Step 4: 运行认证测试和 API 类型检查**

Run:

```bash
pnpm --dir api test -- auth.service.spec.ts
pnpm --dir api typecheck
```

Expected: 两条新老用户测试通过，管理员和验证码安全测试保持通过，API 类型检查退出码为 0。

- [ ] **Step 5: 提交 API 新用户识别**

```bash
git add api/src/auth/auth.service.ts api/test/auth.service.spec.ts lib/api.ts
git commit -m "feat: identify first-time email sign-ins"
```

---

### Task 2: 建立可测试的前端认证与资料门槛规则

**Files:**
- Create: `lib/auth-flow.ts`
- Create: `tests/auth-flow.test.ts`

**Interfaces:**
- Consumes: `ApiProfile` 与 `ProductApiError`。
- Produces:
  - `normalizeAuthEmail(value: string): string`
  - `isValidAuthEmail(value: string): boolean`
  - `normalizeVerificationCode(value: string): string`
  - `getResendSeconds(availableAt: number, now: number): number`
  - `getMissingProfileFields(profile: Partial<ApiProfile> | null): ProfileField[]`
  - `isProfileComplete(profile: Partial<ApiProfile> | null): boolean`
  - `getPublishGate(input: PublishGateInput): PublishGateResult`
  - `shouldOpenNewUserOnboarding(input): boolean`
  - `shouldClearAuthSession(error: unknown): boolean`

- [ ] **Step 1: 编写认证规范化和倒计时失败测试**

在 `tests/auth-flow.test.ts` 写入：

```ts
import { describe, expect, it } from "vitest";

import {
  getResendSeconds,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeVerificationCode
} from "../lib/auth-flow";

describe("auth flow input", () => {
  it("normalizes email and accepts only a plausible complete address", () => {
    expect(normalizeAuthEmail(" Student@UCLA.edu ")).toBe("student@ucla.edu");
    expect(isValidAuthEmail("student@ucla.edu")).toBe(true);
    expect(isValidAuthEmail("student@ucla")).toBe(false);
  });

  it("keeps at most six verification-code digits", () => {
    expect(normalizeVerificationCode(" 12a34-567 ")).toBe("123456");
  });

  it("rounds resend time up and never returns a negative value", () => {
    expect(getResendSeconds(61_000, 1_500)).toBe(60);
    expect(getResendSeconds(1_000, 1_001)).toBe(0);
  });
});
```

- [ ] **Step 2: 编写资料完整度和发布门槛失败测试**

在同一文件增加：

```ts
describe("profile onboarding rules", () => {
  const completeProfile = {
    displayName: "Maya Chen",
    school: "UCLA",
    city: "Los Angeles",
    role: "lister" as const
  };

  it("reports the exact onboarding fields still missing", () => {
    expect(
      getMissingProfileFields({
        displayName: " ",
        school: "UCLA",
        city: null,
        role: "renter"
      })
    ).toEqual(["displayName", "city"]);
    expect(isProfileComplete(completeProfile)).toBe(true);
  });

  it("opens onboarding only for a new user with incomplete profile", () => {
    expect(
      shouldOpenNewUserOnboarding({
        isNewUser: true,
        profile: { ...completeProfile, displayName: null }
      })
    ).toBe(true);
    expect(
      shouldOpenNewUserOnboarding({
        isNewUser: false,
        profile: { ...completeProfile, displayName: null }
      })
    ).toBe(false);
  });

  it("gates publishing in auth, profile, and role order", () => {
    expect(getPublishGate({ authenticated: false, profile: null }).status).toBe("needs-auth");
    expect(
      getPublishGate({
        authenticated: true,
        profile: { ...completeProfile, school: null }
      }).status
    ).toBe("needs-profile");
    expect(
      getPublishGate({
        authenticated: true,
        profile: { ...completeProfile, role: "renter" }
      }).status
    ).toBe("needs-role");
    expect(
      getPublishGate({ authenticated: true, profile: completeProfile }).status
    ).toBe("allowed");
  });
});
```

再增加 401 判断：

```ts
it("clears a session only for authentication errors", () => {
  expect(shouldClearAuthSession(productErrorForStatus(401))).toBe(true);
  expect(shouldClearAuthSession(productErrorForStatus(503))).toBe(false);
});
```

- [ ] **Step 3: 运行前端规则测试并确认模块不存在**

Run:

```bash
pnpm test -- tests/auth-flow.test.ts
```

Expected: FAIL，提示无法解析 `../lib/auth-flow`。

- [ ] **Step 4: 实现最小认证规则模块**

在 `lib/auth-flow.ts` 定义：

```ts
import type { ApiProfile } from "./api";
import { toProductApiError } from "./product-errors";

export type ProfileField = "displayName" | "role" | "school" | "city";
export type OnboardingReason = "new-user" | "publish-required";

export type PublishGateResult =
  | { status: "needs-auth"; message: string }
  | { status: "needs-profile"; message: string; missing: ProfileField[] }
  | { status: "needs-role"; message: string }
  | { status: "allowed"; message: "" };
```

实现规则：

```ts
export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidAuthEmail(value: string) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizeAuthEmail(value));
}

export function normalizeVerificationCode(value: string) {
  return value.replace(/\\D/g, "").slice(0, 6);
}

export function getResendSeconds(availableAt: number, now: number) {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}
```

`getMissingProfileFields` 必须按 `displayName`、`role`、`school`、`city` 的固定顺序返回缺失字段；只有 `renter`、`lister`、`both` 是有效身份。`getPublishGate` 必须先判断登录，再判断完整度，最后判断房东身份。`shouldClearAuthSession` 只在 `toProductApiError(error).category === "authentication"` 时返回 `true`。

- [ ] **Step 5: 运行规则测试并提交**

Run:

```bash
pnpm test -- tests/auth-flow.test.ts
```

Expected: 所有认证规则测试通过。

```bash
git add lib/auth-flow.ts tests/auth-flow.test.ts
git commit -m "feat: add auth onboarding rules"
```

---

### Task 3: 构建分步登录面板与资料引导组件

**Files:**
- Create: `components/auth-flow-panel.tsx`
- Create: `components/profile-onboarding.tsx`
- Create: `tests/auth-flow-panel.test.tsx`
- Modify: `lib/profile-input.ts`
- Modify: `tests/profile-input.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `VerifyEmailResponse`，Task 2 的认证规则，现有 `requestEmailCode`、`verifyEmailCode`、`buildProfileUpdateInput`。
- Produces:

```ts
export type AuthFlowPanelProps = {
  token: string | null;
  user: SessionUser | null;
  profile: ApiProfile | null;
  apiError: string | null;
  onboardingReason: OnboardingReason | null;
  isPinnedToPublish: boolean;
  onAuthenticated: (response: VerifyEmailResponse) => void;
  onProfileSave: (draft: UpdateProfileInput) => Promise<ApiProfile | null>;
  onOnboardingDismiss: () => void;
  onLogout: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
};
```

- [ ] **Step 1: 为资料草稿和静态界面状态编写失败测试**

先扩展 `tests/profile-input.test.ts`：

```ts
expect(
  buildOnboardingProfileInput({
    displayName: "  Maya Chen ",
    school: " UCLA ",
    city: " Los Angeles ",
    role: "lister"
  })
).toEqual({
  displayName: "Maya Chen",
  school: "UCLA",
  city: "Los Angeles",
  role: "lister"
});
```

创建 `tests/auth-flow-panel.test.tsx`，使用 `renderToStaticMarkup` 验证游客首屏和资料引导：

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AuthFlowPanel } from "../components/auth-flow-panel";
import { ProfileOnboarding } from "../components/profile-onboarding";

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
```

- [ ] **Step 2: 运行组件测试并确认导出不存在**

Run:

```bash
pnpm test -- tests/profile-input.test.ts tests/auth-flow-panel.test.tsx
```

Expected: FAIL，提示缺少 `buildOnboardingProfileInput`、`AuthFlowPanel` 和 `ProfileOnboarding`。

- [ ] **Step 3: 实现首次资料草稿构建器**

在 `lib/profile-input.ts` 增加：

```ts
export type OnboardingProfileInput = Required<
  Pick<UpdateProfileInput, "displayName" | "school" | "city" | "role">
>;

export function buildOnboardingProfileInput(
  draft: OnboardingProfileInput
): OnboardingProfileInput {
  return {
    displayName: draft.displayName.trim(),
    school: draft.school.trim(),
    city: draft.city.trim(),
    role: draft.role
  };
}
```

组件在调用 `onSave` 前用 Task 2 的 `getMissingProfileFields` 验证结果，缺失时在本地显示中文错误，不发送 API 请求。

- [ ] **Step 4: 实现 `ProfileOnboarding`**

组件要求：

- `reason === "new-user"` 时标题为“先介绍一下自己”，显示“稍后完善”；
- `reason === "publish-required"` 时标题为“发布前完善资料”，关闭动作文字为“暂不发布”；
- 四个字段均有 `<label>`；
- 身份使用原生 `<select>`，值为 `renter`、`lister`、`both`；
- 错误使用 `role="alert"`；
- 保存按钮在 `pending` 时显示“保存中…”并禁用；
- 保存失败时保留草稿。

- [ ] **Step 5: 实现 `AuthFlowPanel`**

组件内部状态：

```ts
type GuestAuthStep = "email" | "code";
const [step, setStep] = useState<GuestAuthStep>("email");
const [email, setEmail] = useState("");
const [sentEmail, setSentEmail] = useState("");
const [code, setCode] = useState("");
const [expiresAt, setExpiresAt] = useState<string | null>(null);
const [resendAvailableAt, setResendAvailableAt] = useState(0);
const [now, setNow] = useState(() => Date.now());
const [pendingAction, setPendingAction] =
  useState<"request" | "verify" | "profile" | null>(null);
const [localError, setLocalError] = useState<string | null>(null);
```

请求验证码时：

1. 用 `isValidAuthEmail` 阻止无效邮箱；
2. 调用 `requestEmailCode(normalizeAuthEmail(email))`；
3. 保存服务端规范化邮箱与 `expiresAt`；
4. 设置 `resendAvailableAt = Date.now() + 60_000`；
5. 开发环境存在 `devCode` 时填入验证码并显示“本地开发验证码已填入”；
6. 成功后进入 `code` 状态。

验证码步骤必须包含：

- `inputMode="numeric"` 与 `autoComplete="one-time-code"`；
- `normalizeVerificationCode`；
- “修改邮箱”；
- 倒计时期间禁用“重新发送”；
- 六位验证码才能提交；
- 验证成功调用 `onAuthenticated(response)`。

已登录状态渲染账户摘要、完整资料编辑、保存和退出；`onboardingReason` 非空时优先渲染 `ProfileOnboarding`。

- [ ] **Step 6: 运行组件、规则与类型测试**

Run:

```bash
pnpm test -- tests/profile-input.test.ts tests/auth-flow.test.ts tests/auth-flow-panel.test.tsx
pnpm typecheck
```

Expected: 新组件测试和现有资料输入测试通过，TypeScript 无错误。

- [ ] **Step 7: 提交认证组件**

```bash
git add components/auth-flow-panel.tsx components/profile-onboarding.tsx lib/profile-input.ts tests/profile-input.test.ts tests/auth-flow-panel.test.tsx
git commit -m "feat: build progressive email auth UI"
```

---

### Task 4: 将认证组件接入全局会话与发布流程

**Files:**
- Modify: `components/sublet-app.tsx`
- Create: `tests/sublet-auth-integration.test.ts`
- Modify: `lib/product-capabilities.ts`
- Modify: `tests/product-capabilities.test.ts`

**Interfaces:**
- Consumes: `AuthFlowPanelProps`、`OnboardingReason`、`getPublishGate`、`shouldOpenNewUserOnboarding`、`shouldClearAuthSession`。
- Produces:
  - 新用户登录后自动打开资料引导；
  - 已有用户登录后直接恢复当前页面；
  - 直接进入 `/host/listings` 时按登录、资料、身份顺序引导；
  - 401 清理会话，网络错误保留令牌；
  - `handleSaveProfile` 返回 `Promise<ApiProfile | null>`。

- [ ] **Step 1: 编写全局接线失败测试**

创建 `tests/sublet-auth-integration.test.ts`：

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "components/sublet-app.tsx"),
  "utf8"
);

describe("sublet auth integration", () => {
  it("delegates authentication UI to focused components", () => {
    expect(source).toContain('import { AuthFlowPanel } from "@/components/auth-flow-panel"');
    expect(source).toContain("<AuthFlowPanel");
    expect(source).not.toContain("function AuthStrip(");
  });

  it("tracks onboarding reason and handles expired sessions explicitly", () => {
    expect(source).toContain("setOnboardingReason");
    expect(source).toContain("shouldOpenNewUserOnboarding");
    expect(source).toContain("shouldClearAuthSession");
  });
});
```

扩展 `tests/product-capabilities.test.ts`，明确资料完整度由认证流程处理，能力模块仍只判断服务能力和最终房东身份：

```ts
expect(
  checkProductCapability("publish-listing", {
    authenticated: true,
    apiOnline: true,
    profileRole: undefined
  }).status
).toBe("unavailable");
```

- [ ] **Step 2: 运行接线测试并确认旧内联组件导致失败**

Run:

```bash
pnpm test -- tests/sublet-auth-integration.test.ts tests/product-capabilities.test.ts
```

Expected: FAIL，`sublet-app.tsx` 尚未导入 `AuthFlowPanel`，且仍包含 `AuthStrip`。

- [ ] **Step 3: 替换内联 `AuthStrip` 并建立引导状态**

在 `HomePage` 增加：

```ts
const [onboardingReason, setOnboardingReason] =
  useState<OnboardingReason | null>(null);
```

删除 `AuthStrip` 函数，将渲染替换为：

```tsx
<AuthFlowPanel
  token={token}
  user={user}
  profile={profile}
  apiError={apiError}
  onboardingReason={onboardingReason}
  isPinnedToPublish={activeSection === "Publish"}
  onAuthenticated={handleAuthenticated}
  onProfileSave={handleSaveProfile}
  onOnboardingDismiss={() => setOnboardingReason(null)}
  onLogout={handleLogout}
  onClose={() => setAuthPanelOpen(false)}
  onToast={setToast}
/>
```

`handleAuthenticated` 改为接收完整响应：

```ts
function handleAuthenticated(response: VerifyEmailResponse) {
  writeStoredAuthSession(response.accessToken);
  setToken(response.accessToken);
  setUser(response.user);
  setAuthPanelOpen(true);
  if (response.isNewUser) setOnboardingReason("new-user");
}
```

- [ ] **Step 4: 接入发布门槛与资料保存结果**

当 `activeSection === "Publish"` 且用户与 Profile 状态变化时，调用 `getPublishGate`：

```ts
const gate = getPublishGate({
  authenticated: Boolean(token && user),
  profile
});

if (gate.status === "needs-profile" || gate.status === "needs-role") {
  setAuthPanelOpen(true);
  setOnboardingReason("publish-required");
}
```

游客保持在 `/host/listings`，登录面板固定显示；不跳转首页。保存资料时：

```ts
async function handleSaveProfile(
  draft: UpdateProfileInput
): Promise<ApiProfile | null> {
  if (!token) {
    setToast("请先登录再完善资料");
    setAuthPanelOpen(true);
    return null;
  }

  try {
    const updatedProfile = await updateMyProfile(token, draft);
    setProfile(updatedProfile);
    if (isProfileComplete(updatedProfile)) setOnboardingReason(null);
    setToast("资料已保存");
    return updatedProfile;
  } catch (error) {
    setToast(toProductApiError(error).message);
    return null;
  }
}
```

`handleSaveListing` 继续调用 `requireCapability("publish-listing")`，形成提交前的最终防线。

- [ ] **Step 5: 只在 401 时清理恢复中的会话**

把 `loadMe` 的无条件清理改为：

```ts
} catch (error) {
  if (cancelled) return;
  const productError = toProductApiError(error);
  if (shouldClearAuthSession(productError)) {
    clearStoredAuthSession();
    setToken(null);
    setUser(null);
    setProfile(null);
    setToast(productError.message);
    setAuthPanelOpen(true);
  } else {
    setApiError(productError.message);
    setApiOnline(false);
  }
}
```

退出时同时清除 `onboardingReason`。保持当前路由不变。

- [ ] **Step 6: 运行集成测试与完整前端检查**

Run:

```bash
pnpm test -- tests/sublet-auth-integration.test.ts tests/product-capabilities.test.ts tests/auth-flow.test.ts tests/auth-flow-panel.test.tsx
pnpm check
```

Expected: 接线测试通过；前端 lint、类型检查、全部测试和生产构建退出码均为 0。

- [ ] **Step 7: 提交全局认证接线**

```bash
git add components/sublet-app.tsx tests/sublet-auth-integration.test.ts lib/product-capabilities.ts tests/product-capabilities.test.ts
git commit -m "feat: integrate auth onboarding with publishing"
```

---

### Task 5: 完整 API、数据库与浏览器验收

**Files:**
- Modify only if verification exposes a regression in files already listed above.
- Do not add unrelated refactors or dependencies.

**Interfaces:**
- Consumes: Tasks 1–4 的完整认证流程。
- Produces: 可重复的本地新用户注册、资料跳过、发布门槛、资料保存、退出、再次登录与会话恢复证据。

- [ ] **Step 1: 运行 API 发布前检查**

Run:

```bash
pnpm --dir api launch:check
```

Expected: API 全部非数据库测试、类型检查、构建和 Prisma schema validate 通过；数据库 smoke 保持按配置跳过。

- [ ] **Step 2: 准备真实本地数据库**

Run:

```bash
pnpm local:setup
```

Expected: PostgreSQL 健康，所有迁移应用成功，洛杉矶房源与室友种子数据写入。

- [ ] **Step 3: 运行真实数据库冒烟测试**

Run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api launch:smoke
```

Expected: `test/launch-smoke.spec.ts` 的真实 PostgreSQL 流程通过。

- [ ] **Step 4: 启动网站与 API**

分别运行：

```bash
pnpm --dir api dev
pnpm dev
```

Expected:

- `http://localhost:4000/api/v1/health` 返回 `{"status":"ok"}`；
- `http://localhost:3000` 返回 200。

- [ ] **Step 5: 用真实浏览器验证首次注册和跳过**

使用一个数据库中不存在的邮箱：

1. 打开 `/account`；
2. 输入邮箱并请求验证码；
3. 确认进入验证码步骤，显示规范化邮箱、修改邮箱、有效期和重发倒计时；
4. 使用本地开发验证码登录；
5. 确认出现四字段新用户引导；
6. 点击“稍后完善”；
7. 打开首页与室友页，确认普通浏览不受阻。

- [ ] **Step 6: 用真实浏览器验证发布门槛**

1. 打开 `/host/listings`；
2. 确认资料引导重新出现；
3. 填写显示名称、学校、城市，身份先选“租客”；
4. 确认仍提示需要房东身份；
5. 将身份改为“房东”或“租客兼房东”并保存；
6. 确认发布表单可用，且未自动创建房源。

- [ ] **Step 7: 验证退出、再次登录和会话恢复**

1. 退出登录；
2. 使用同一邮箱重新登录；
3. 确认不再显示首次引导；
4. 刷新页面；
5. 确认会话与资料恢复；
6. 确认浏览器控制台无 error 或 warn。

- [ ] **Step 8: 检查最终差异与工作区状态**

Run:

```bash
git diff --check
git status --short
git log --oneline -6
```

Expected: 无空白错误；除用户原有的未跟踪输出目录外没有未提交的功能文件；最近提交依次包含 API 新用户识别、认证规则、认证组件和全局接线。
