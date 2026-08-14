# Confirmed Two-Person Roommate Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent invitation workflow that turns one reciprocal roommate match into one confirmed two-person team and only then creates or associates a Deal Room.

**Architecture:** `RoommateTeam`, membership, and invite records are the source of truth for grouping; `DealRoom` remains a downstream collaboration surface. Invite acceptance runs at serializable isolation, creates both active memberships, and associates a Deal Room in the same transaction. The existing reciprocal-match conversation remains independent and unchanged.

**Tech Stack:** NestJS, Prisma, PostgreSQL 16, Next.js 15, React 19, Vitest, Supertest.

## Global Constraints

- A team contains exactly two distinct users connected by an active reciprocal `RoommateMatch`.
- A user can belong to at most one active team; PostgreSQL enforces this with a partial unique membership index.
- Invite statuses are `PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED`, and `EXPIRED`.
- Team statuses are `ACTIVE` and `DISSOLVED`.
- A user without an active team may have pending invitations across multiple reciprocal matches.
- Accepting an invite, creating memberships, and associating a Deal Room is one serializable transaction.
- The acceptance transaction also cancels every other pending invitation involving either new member.
- Leaving dissolves the team and preserves invites, membership snapshots, messages, applications, and Deal Room history.
- `DealRoom` is never used to infer team membership.
- Direct messages still require only the existing server-confirmed reciprocal conversation.

---

### Task 1: Persist team, invite, and active-membership invariants

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20260814150000_roommate_teams/migration.sql`
- Create: `api/test/roommate-teams-schema.spec.ts`

**Interfaces:**
- Produces: `RoommateTeamStatus`, `RoommateTeamInviteStatus`.
- Produces: `RoommateTeam`, `RoommateTeamMember`, and `RoommateTeamInvite` Prisma delegates.
- Produces: partial unique indexes `RoommateTeamMember_one_active_per_user` and `RoommateTeamInvite_one_pending_per_match`.

- [ ] **Step 1: Write the failing schema-source and disposable-PostgreSQL assertions**

Assert the models, relations, two status enums, foreign keys, and both partial unique indexes. The database assertions must include:

```ts
expect(await scalar(db, `SELECT array_to_string(enum_range(NULL::"RoommateTeamStatus"), ',')`))
  .toBe("ACTIVE,DISSOLVED");
expect(await scalar(db, `SELECT array_to_string(enum_range(NULL::"RoommateTeamInviteStatus"), ',')`))
  .toBe("PENDING,ACCEPTED,DECLINED,CANCELLED,EXPIRED");
await expect(db.query(`
  INSERT INTO "RoommateTeamMember"
    ("id", "teamId", "userId", "snapshot", "active", "joinedAt")
  VALUES
    ('member-conflict', 'team-2', 'user-1', '{}'::jsonb, TRUE, NOW())
`))
  .rejects.toThrow(/RoommateTeamMember_one_active_per_user/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/roommate-teams-schema.spec.ts`

Expected: FAIL because the team tables and enums do not exist.

- [ ] **Step 3: Add the schema and migration**

Use these server-owned fields:

```prisma
model RoommateTeam {
  id          String             @id @default(cuid())
  status      RoommateTeamStatus @default(ACTIVE)
  dealRoomId  String?            @unique
  confirmedAt DateTime           @default(now())
  dissolvedAt DateTime?
  dissolvedById String?
  dissolveReason String?
  dealRoom   DealRoom?          @relation(fields: [dealRoomId], references: [id], onDelete: SetNull)
  members     RoommateTeamMember[]
  invites     RoommateTeamInvite[]
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
}

model RoommateTeamMember {
  id        String       @id @default(cuid())
  teamId    String
  userId    String
  snapshot  Json
  active    Boolean      @default(true)
  joinedAt  DateTime     @default(now())
  leftAt    DateTime?
  team      RoommateTeam @relation(fields: [teamId], references: [id], onDelete: Restrict)
  user      User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@unique([teamId, userId])
  @@index([userId, active])
}
```

`RoommateTeamInvite` stores `matchId`, `inviterId`, `inviteeId`, `status`, `expiresAt`, `respondedAt`, optional `teamId`, and timestamps. Add a check constraint rejecting self-invites, a pending-match partial unique index, and an active-membership partial unique index.
New invitations expire exactly 7 days after creation; reads and mutations convert overdue pending invitations to `EXPIRED` before returning state.

- [ ] **Step 4: Generate Prisma and verify GREEN**

Run: `cd api && pnpm prisma generate && pnpm vitest run test/roommate-teams-schema.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260814150000_roommate_teams api/test/roommate-teams-schema.spec.ts
git commit -m "feat: persist confirmed roommate teams"
```

### Task 2: Implement invite lifecycle and concurrency-safe acceptance

**Files:**
- Create: `api/src/roommate-teams/roommate-teams.dto.ts`
- Create: `api/src/roommate-teams/roommate-teams.presenter.ts`
- Create: `api/src/roommate-teams/roommate-teams.service.ts`
- Create: `api/test/roommate-teams.service.spec.ts`

**Interfaces:**
- Produces: `CreateRoommateTeamInviteDto { roommateProfileId: string }`.
- Produces: `RoommateTeamsService.current`, `listInvites`, `invite`, `accept`, `decline`, `cancel`, and `leave`.
- Produces: `RoommateTeamResponse` with persisted member snapshots and optional `dealRoomId`.
- Consumes: `DealRoomsService.ensureForConfirmedTeam(transaction, ownerId, teammateId)` from Task 3.

- [ ] **Step 1: Write failing service tests**

Cover active-match enforcement, target profile ownership, self-invite rejection, pending invite reuse for the same match, multiple pending invitations across different matches, only-invitee acceptance/decline, only-inviter cancellation, expiry, competing-invite cancellation, one-active-team conflicts, two memberships, and team dissolution. Verify concurrent accepts cannot place either user in two active teams.

```ts
const invite = await service.invite("user-a", { roommateProfileId: "profile-b" });
expect(invite).toMatchObject({ status: "PENDING", inviterId: "user-a", inviteeId: "user-b" });
const team = await service.accept("user-b", invite.id);
expect(team.members.map((member) => member.userId).sort()).toEqual(["user-a", "user-b"]);
await expect(service.accept("user-b", invite.id)).resolves.toMatchObject({ id: team.id });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/roommate-teams.service.spec.ts`

Expected: FAIL because `RoommateTeamsService` does not exist.

- [ ] **Step 3: Implement invite/read commands**

Resolve the target through `RoommateProfile.ownerId`; require an `ACTIVE` normalized `RoommateMatch`. Expire stale pending invites before returning lists. Return 404 for records outside the actor's relationship and 409 for valid but stale state transitions.

- [ ] **Step 4: Implement accept/leave at serializable isolation**

Acceptance conditionally changes `PENDING -> ACCEPTED`, creates the team, creates both active members with immutable display snapshots, cancels every other `PENDING` invitation where either accepted member is inviter or invitee, calls `ensureForConfirmedTeam`, and stores its `dealRoomId`. Retry Prisma `P2034` up to three times; translate partial-unique `P2002` failures into `409 ROOMMATE_TEAM_CONFLICT`.

Leaving conditionally changes `ACTIVE -> DISSOLVED`, sets both memberships inactive with `leftAt`, records the actor and bounded reason `成员主动离开`, and archives the associated Deal Room so it cannot accept new group-tour commands. The Deal Room row and all history remain readable.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `cd api && pnpm vitest run test/roommate-teams.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/roommate-teams api/test/roommate-teams.service.spec.ts
git commit -m "feat: add roommate team invitations"
```

### Task 3: Associate Deal Rooms only after team confirmation and expose HTTP APIs

**Files:**
- Modify: `api/src/deal-rooms/deal-rooms.service.ts`
- Modify: `api/src/deal-rooms/deal-rooms.module.ts`
- Create: `api/src/roommate-teams/roommate-teams.controller.ts`
- Create: `api/src/roommate-teams/roommate-teams.module.ts`
- Modify: `api/src/app.module.ts`
- Modify: `api/test/deal-rooms.service.spec.ts`
- Create: `api/test/roommate-teams.e2e.spec.ts`

**Interfaces:**
- Produces: `DealRoomsService.ensureForConfirmedTeam(transaction, ownerId, teammateId): Promise<DealRoom>`.
- Produces authenticated routes under `/roommate-teams` matching the approved design.

- [ ] **Step 1: Write failing Deal Room and HTTP tests**

Assert that a reciprocal LIKE no longer creates a Deal Room, team acceptance creates/reuses one room with both snapshots, and every team route requires authentication. Exercise create/list/accept/decline/cancel/leave over HTTP with two authenticated users.

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd api && pnpm vitest run test/deal-rooms.service.spec.ts test/roommate-teams.e2e.spec.ts`

Expected: FAIL on missing confirmed-team method/routes and legacy eager Deal Room creation.

- [ ] **Step 3: Move Deal Room creation behind team confirmation**

Remove `createDealRoom` from roommate-action behavior and responses. `ensureForConfirmedTeam` loads both owned roommate profiles, reuses either directional existing room, otherwise creates one with the confirmer as owner, and upserts both `DealRoomMember` snapshots.

- [ ] **Step 4: Add guarded controllers and module wiring**

Expose:

```text
GET    /roommate-teams/current
POST   /roommate-teams/invites
GET    /roommate-teams/invites
POST   /roommate-teams/invites/:id/accept
POST   /roommate-teams/invites/:id/decline
POST   /roommate-teams/invites/:id/cancel
POST   /roommate-teams/current/leave
```

Use a strict `ValidationPipe` for the invitation body and `AuthGuard` for the controller.

- [ ] **Step 5: Run the tests and verify GREEN**

Run: `cd api && pnpm vitest run test/deal-rooms.service.spec.ts test/roommate-teams.e2e.spec.ts test/match-transaction-flow.spec.ts`

Expected: PASS with the flow updated to accept an invite before reading an active Deal Room.

- [ ] **Step 6: Commit**

```bash
git add api/src/deal-rooms api/src/roommate-teams api/src/app.module.ts api/test/deal-rooms.service.spec.ts api/test/roommate-teams.e2e.spec.ts api/test/match-transaction-flow.spec.ts
git commit -m "feat: connect confirmed teams to deal rooms"
```

### Task 4: Replace placeholder team UI with server state

**Files:**
- Modify: `lib/api.ts`
- Create: `lib/roommate-teams.ts`
- Create: `components/roommate-team-controls.tsx`
- Modify: `components/sublet-app.tsx`
- Create: `tests/roommate-teams.test.ts`
- Create: `tests/roommate-team-controls.test.tsx`
- Modify: `tests/sublet-app-roommate-chat.test.tsx`

**Interfaces:**
- Produces: `ApiRoommateTeam`, `ApiRoommateTeamInvite`, and `deriveRoommateTeamAction`.
- Produces: `RoommateTeamControls` callbacks for invite, accept, decline, cancel, and leave.

- [ ] **Step 1: Write failing pure/UI tests**

Cover mutually exclusive states: invite, outgoing pending, incoming accept/decline, active team, and unavailable without a reciprocal match. Assert private messaging remains enabled from the conversation response and does not depend on team state.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm vitest run tests/roommate-teams.test.ts tests/roommate-team-controls.test.tsx tests/sublet-app-roommate-chat.test.tsx`

Expected: FAIL because the team client/UI does not exist and placeholder copy remains.

- [ ] **Step 3: Implement server-backed team state**

Load current team and invites after authentication, map persisted team members into `groupMembers`, and use only the returned `dealRoomId` for group tours. Replace `handleDecideRoommate` and eager `response.dealRoom` handling with team commands and refresh after every successful mutation.

- [ ] **Step 4: Render focused controls and safe pending/error states**

Disable each command while pending, preserve the last confirmed state on request failure, and present Chinese states `邀请组队`, `等待对方确认`, `接受邀请`, `拒绝`, `已组成两人小组`, and `退出小组`.

- [ ] **Step 5: Run the tests and verify GREEN**

Run: `pnpm vitest run tests/roommate-teams.test.ts tests/roommate-team-controls.test.tsx tests/sublet-app-roommate-chat.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api.ts lib/roommate-teams.ts components/roommate-team-controls.tsx components/sublet-app.tsx tests/roommate-teams.test.ts tests/roommate-team-controls.test.tsx tests/sublet-app-roommate-chat.test.tsx
git commit -m "feat: expose confirmed roommate team controls"
```
