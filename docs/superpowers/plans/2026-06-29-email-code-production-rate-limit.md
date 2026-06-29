# Email Code Production Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productionize email-code login with a mockable email sender boundary, per-email request cooldown, old-code invalidation, and production-safe sender configuration.

**Architecture:** Keep the current NestJS `AuthService` as the flow owner, but move email delivery behind a focused `EmailSender` interface. Use existing `VerificationCode` rows for cooldown and invalidation so no Redis, queue, or new Prisma model is needed. Keep production strict by making the default factory fail in production until deployment code or a later vendor integration injects a concrete sender.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, Vitest, TypeScript, `@nestjs/jwt`.

---

## File Structure

- Create `api/src/email/email-sender.ts`: email sender interface, console development sender, missing production sender, and sender factory.
- Modify `api/src/auth/auth.service.ts`: inject/use `EmailSender`, enforce cooldown, invalidate old codes, and call sender before returning.
- Modify `api/test/auth.service.spec.ts`: add tests for cooldown, old-code invalidation, production sender behavior, and update the Prisma mock to support multiple verification-code rows.
- Modify `api/test/match-transaction-flow.spec.ts`: add `verificationCode.updateMany` support to the flow-test Prisma mock.
- Modify `api/test/env.spec.ts`: add sender factory/config behavior tests.
- Modify `api/.env.example`: document `EMAIL_SENDER` and `EMAIL_FROM`.
- No Prisma schema change expected.

## Task 1: Email Sender Boundary Tests

**Files:**
- Create: `api/src/email/email-sender.ts`
- Modify: `api/test/env.spec.ts`

- [ ] **Step 1: Write failing sender factory tests**

Add these imports to `api/test/env.spec.ts`:

```ts
import { ConsoleEmailSender, createEmailSender, MissingProductionEmailSender } from "../src/email/email-sender";
```

Append this test block to `api/test/env.spec.ts`:

```ts
describe("email sender config", () => {
  it("uses console sender outside production", () => {
    expect(createEmailSender({ nodeEnv: "development", emailSender: "console" })).toBeInstanceOf(ConsoleEmailSender);
    expect(createEmailSender({ nodeEnv: "test" })).toBeInstanceOf(ConsoleEmailSender);
  });

  it("fails fast for production sender created by the default factory", async () => {
    const sender = createEmailSender({ nodeEnv: "production", emailSender: "console" });
    const externalSender = createEmailSender({ nodeEnv: "production", emailSender: "external" });

    expect(sender).toBeInstanceOf(MissingProductionEmailSender);
    expect(externalSender).toBeInstanceOf(MissingProductionEmailSender);
    await expect(
      sender.sendVerificationCode({
        email: "student@northeastern.edu",
        code: "123456"
      })
    ).rejects.toThrow("Production email sender is not configured");
  });
});
```

- [ ] **Step 2: Run the red test**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/env.spec.ts
```

Expected: FAIL because `../src/email/email-sender` does not exist.

- [ ] **Step 3: Implement `api/src/email/email-sender.ts`**

Create `api/src/email/email-sender.ts`:

```ts
export type SendVerificationCodeInput = {
  email: string;
  code: string;
};

export type EmailSender = {
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
};

type EmailSenderFactoryInput = {
  nodeEnv?: string;
  emailSender?: string;
};

export class ConsoleEmailSender implements EmailSender {
  async sendVerificationCode(input: SendVerificationCodeInput) {
    console.log(`[dev email code] ${input.email}: ${input.code}`);
  }
}

export class MissingProductionEmailSender implements EmailSender {
  async sendVerificationCode() {
    throw new Error("Production email sender is not configured");
  }
}

export function createEmailSender(input: EmailSenderFactoryInput = {}): EmailSender {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const emailSender = input.emailSender ?? process.env.EMAIL_SENDER ?? "console";

  if (nodeEnv === "production") {
    return new MissingProductionEmailSender();
  }

  if (emailSender !== "console") {
    return new MissingProductionEmailSender();
  }

  return new ConsoleEmailSender();
}
```

- [ ] **Step 4: Run the sender tests green**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/env.spec.ts
```

Expected: PASS with the existing JWT config tests and the new email sender config tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add api/src/email/email-sender.ts api/test/env.spec.ts
git commit -m "feat: add email sender boundary"
```

## Task 2: Auth Service Red Tests For Cooldown And Sender Behavior

**Files:**
- Modify: `api/test/auth.service.spec.ts`
- Modify later: `api/src/auth/auth.service.ts`

- [ ] **Step 1: Update auth test imports**

Change the first import in `api/test/auth.service.spec.ts` from:

```ts
import { UnauthorizedException } from "@nestjs/common";
```

to:

```ts
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
```

Add this import:

```ts
import type { EmailSender } from "../src/email/email-sender";
```

- [ ] **Step 2: Add fake email sender helper**

Add this helper above `createPrismaMock()`:

```ts
function createEmailSenderMock(): EmailSender & { sentCodes: Array<{ email: string; code: string }> } {
  return {
    sentCodes: [],
    async sendVerificationCode(input) {
      this.sentCodes.push(input);
    }
  };
}
```

- [ ] **Step 3: Convert existing service construction to inject sender**

In each existing test in `api/test/auth.service.spec.ts`, create a sender and pass it into the options:

```ts
const sender = createEmailSenderMock();
const service = new AuthService(prisma as never, jwt, { nodeEnv: "development", emailSender: sender });
```

For the production test, use:

```ts
const sender = createEmailSenderMock();
const service = new AuthService(prisma as never, jwt, { nodeEnv: "production", emailSender: sender });
```

In the existing `"rejects verification after five failed attempts"` test, replace:

```ts
code: prisma.verificationCode.state.devCode!
```

with:

```ts
code: sender.sentCodes[0].code
```

- [ ] **Step 4: Add cooldown red test**

Append this test inside `describe("AuthService", () => { ... })`:

```ts
it("rejects a second code request inside the cooldown window", async () => {
  const prisma = createPrismaMock();
  const jwt = new JwtService({ secret: "test-secret" });
  const sender = createEmailSenderMock();
  const service = new AuthService(prisma as never, jwt, {
    nodeEnv: "development",
    emailSender: sender,
    codeRequestCooldownMs: 60_000
  });

  await service.requestEmailCode("student@northeastern.edu");

  await expect(service.requestEmailCode("student@northeastern.edu")).rejects.toBeInstanceOf(BadRequestException);
  expect(sender.sentCodes).toHaveLength(1);
});
```

- [ ] **Step 5: Add old-code invalidation red test**

Append this test inside `describe("AuthService", () => { ... })`:

```ts
it("invalidates older active codes when issuing a newer code after cooldown", async () => {
  const prisma = createPrismaMock();
  const jwt = new JwtService({ secret: "test-secret" });
  const sender = createEmailSenderMock();
  const service = new AuthService(prisma as never, jwt, {
    nodeEnv: "development",
    emailSender: sender,
    codeRequestCooldownMs: 0
  });

  await service.requestEmailCode("student@northeastern.edu");
  const oldCode = sender.sentCodes[0].code;
  await service.requestEmailCode("student@northeastern.edu");
  const newCode = sender.sentCodes[1].code;

  await expect(
    service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: oldCode
    })
  ).rejects.toBeInstanceOf(UnauthorizedException);

  const session = await service.verifyEmailCode({
    email: "student@northeastern.edu",
    code: newCode
  });

  expect(session.user.email).toBe("student@northeastern.edu");
});
```

- [ ] **Step 6: Add production sender tests**

Append these tests inside `describe("AuthService", () => { ... })`:

```ts
it("sends production codes through the configured sender without returning devCode", async () => {
  const prisma = createPrismaMock();
  const jwt = new JwtService({ secret: "test-secret" });
  const sender = createEmailSenderMock();
  const service = new AuthService(prisma as never, jwt, { nodeEnv: "production", emailSender: sender });

  const request = await service.requestEmailCode("student@northeastern.edu");

  expect(request.devCode).toBeUndefined();
  expect(sender.sentCodes).toHaveLength(1);
  expect(sender.sentCodes[0]).toEqual({
    email: "student@northeastern.edu",
    code: expect.stringMatching(/^\d{6}$/)
  });
  expect(prisma.verificationCode.state.codes.at(-1)?.codeHash).not.toBe(sender.sentCodes[0].code);
});

it("fails production requests when the default production sender is not configured", async () => {
  const prisma = createPrismaMock();
  const jwt = new JwtService({ secret: "test-secret" });
  const service = new AuthService(prisma as never, jwt, { nodeEnv: "production" });

  await expect(service.requestEmailCode("student@northeastern.edu")).rejects.toThrow(
    "Production email sender is not configured"
  );
});
```

- [ ] **Step 7: Replace the single-code Prisma mock with multi-code state**

Replace the `state` definition in `createPrismaMock()` with:

```ts
const state = {
  codes: [] as VerificationCodeRecord[],
  get code() {
    return this.codes.at(-1);
  },
  user: undefined as { id: string; email: string; role: string; createdAt: Date } | undefined
};
```

Remove `devCode` from the mock state. Tests should read codes from `sender.sentCodes`.

- [ ] **Step 8: Update mock create/find/update methods**

Replace `verificationCode.create`, `findFirst`, and `update` in `createPrismaMock()` with:

```ts
create: async ({ data }: { data: { email: string; codeHash?: string; expiresAt: Date; attemptCount?: number } }) => {
  const created = {
    id: `code-${state.codes.length + 1}`,
    email: data.email,
    codeHash: data.codeHash,
    attemptCount: data.attemptCount ?? 0,
    expiresAt: data.expiresAt,
    consumedAt: null,
    createdAt: new Date(Date.now() + state.codes.length)
  };
  state.codes.push(created);
  return created;
},
findFirst: async ({
  where,
  orderBy
}: {
  where: { email: string; consumedAt?: null; expiresAt?: { gt: Date } };
  orderBy?: { createdAt: "desc" };
}) => {
  const matches = state.codes.filter((code) => {
    if (code.email !== where.email) return false;
    if ("consumedAt" in where && code.consumedAt !== where.consumedAt) return false;
    if (where.expiresAt && code.expiresAt <= where.expiresAt.gt) return false;
    return true;
  });

  if (orderBy?.createdAt === "desc") {
    return matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  }

  return matches[0] ?? null;
},
update: async (args: { where: { id: string }; data: VerificationCodeUpdateData }) => {
  const code = state.codes.find((record) => record.id === args.where.id);
  if (!code) return null;

  if (isAttemptIncrement(args.data)) {
    code.attemptCount = (code.attemptCount ?? 0) + args.data.attemptCount.increment;
  } else {
    Object.assign(code, args.data);
  }

  mock.verificationCode.updateCalls.push(args);
  return code;
},
updateMany: async ({ where, data }: { where: { email: string; consumedAt: null }; data: { consumedAt: Date } }) => {
  let count = 0;
  for (const code of state.codes) {
    if (code.email === where.email && code.consumedAt === where.consumedAt) {
      code.consumedAt = data.consumedAt;
      count += 1;
    }
  }
  return { count };
}
```

- [ ] **Step 9: Run the auth red tests**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/auth.service.spec.ts
```

Expected: FAIL because `AuthServiceOptions` does not yet accept `emailSender` or `codeRequestCooldownMs`, `AuthService` does not call a sender, and cooldown/invalidation are missing.

## Task 3: Implement Auth Flow Cooldown, Invalidation, And Sender Calls

**Files:**
- Modify: `api/src/auth/auth.service.ts`
- Test: `api/test/auth.service.spec.ts`
- Test: `api/test/match-transaction-flow.spec.ts`

- [ ] **Step 1: Update imports and options**

In `api/src/auth/auth.service.ts`, add:

```ts
import { createEmailSender, EmailSender } from "../email/email-sender";
```

Replace `AuthServiceOptions` with:

```ts
type AuthServiceOptions = {
  nodeEnv?: string;
  emailSender?: EmailSender;
  codeRequestCooldownMs?: number;
};
```

Add this constant below `maxVerificationAttempts`:

```ts
const defaultCodeRequestCooldownMs = 60_000;
```

- [ ] **Step 2: Add service fields**

Replace the current `private readonly nodeEnv: string;` field with:

```ts
private readonly nodeEnv: string;
private readonly emailSender: EmailSender;
private readonly codeRequestCooldownMs: number;
```

Update the constructor body to:

```ts
this.nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
this.emailSender = options.emailSender ?? createEmailSender({ nodeEnv: this.nodeEnv });
this.codeRequestCooldownMs = options.codeRequestCooldownMs ?? defaultCodeRequestCooldownMs;
```

- [ ] **Step 3: Add cooldown check before creating a code**

Inside `requestEmailCode()`, after the empty-email check and before generating `code`, add:

```ts
const latestCode = await this.prisma.verificationCode.findFirst({
  where: { email },
  orderBy: { createdAt: "desc" }
});

if (latestCode && Date.now() - latestCode.createdAt.getTime() < this.codeRequestCooldownMs) {
  throw new BadRequestException("Please wait before requesting another code");
}
```

- [ ] **Step 4: Invalidate old active codes before creating the new code**

Inside `requestEmailCode()`, immediately before `this.prisma.verificationCode.create(...)`, add:

```ts
await this.prisma.verificationCode.updateMany({
  where: {
    email,
    consumedAt: null
  },
  data: {
    consumedAt: new Date()
  }
});
```

- [ ] **Step 5: Replace inline console logging with sender call**

In `requestEmailCode()`, remove:

```ts
if (this.nodeEnv !== "production") {
  console.log(`[dev email code] ${email}: ${code}`);
}
```

Add after the new verification-code record is created:

```ts
await this.emailSender.sendVerificationCode({ email, code });
```

Leave the response logic as:

```ts
const response: { email: string; expiresAt: Date; devCode?: string } = {
  email,
  expiresAt
};

if (this.nodeEnv !== "production") response.devCode = code;

return response;
```

- [ ] **Step 6: Run auth tests green**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/auth.service.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Update match transaction flow mock**

In `api/test/match-transaction-flow.spec.ts`, add this method to the `verificationCode` mock object after `update`:

```ts
updateMany: async ({ where, data }: { where: { email: string; consumedAt: null }; data: { consumedAt: Date } }) => {
  let count = 0;
  for (const code of state.codes) {
    if (code.email === where.email && code.consumedAt === where.consumedAt) {
      code.consumedAt = data.consumedAt;
      count += 1;
    }
  }
  return { count };
}
```

- [ ] **Step 8: Run flow test green**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/match-transaction-flow.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add api/src/auth/auth.service.ts api/test/auth.service.spec.ts api/test/match-transaction-flow.spec.ts
git commit -m "feat: harden email code request flow"
```

## Task 4: Environment Documentation And Integration Checks

**Files:**
- Modify: `api/.env.example`
- Test: `api/test/env.spec.ts`

- [ ] **Step 1: Update `.env.example`**

Add these lines after `JWT_SECRET="dev-change-me"` in `api/.env.example`:

```dotenv
EMAIL_SENDER="console"
EMAIL_FROM="Sublet Pipeline <no-reply@example.com>"
```

- [ ] **Step 2: Run focused tests**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/env.spec.ts test/auth.service.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run from `api`:

```bash
npm run typecheck
```

Expected: PASS with Prisma client generation and no TypeScript errors.

- [ ] **Step 4: Commit Task 4**

```bash
git add api/.env.example api/test/env.spec.ts
git commit -m "docs: document email sender config"
```

## Final Verification

- [ ] Run all API tests:

```bash
./node_modules/.bin/vitest run
```

Expected: all test files pass.

- [ ] Run API typecheck:

```bash
npm run typecheck
```

Expected: command exits 0.

- [ ] Run API build:

```bash
npm run build
```

Expected: command exits 0.

- [ ] Run Prisma validate:

```bash
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] Check repository status from the repo root:

```bash
git status --short --branch
```

Expected: only intentional commits/changes for this feature remain.
