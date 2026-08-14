CREATE TYPE "RoommateTeamStatus" AS ENUM ('ACTIVE', 'DISSOLVED');
CREATE TYPE "RoommateTeamInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "RoommateTeam" (
  "id" TEXT NOT NULL,
  "status" "RoommateTeamStatus" NOT NULL DEFAULT 'ACTIVE',
  "dealRoomId" TEXT,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dissolvedAt" TIMESTAMP(3),
  "dissolvedById" TEXT,
  "dissolveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoommateTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoommateTeamMember" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "RoommateTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoommateTeamInvite" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "inviteeId" TEXT NOT NULL,
  "teamId" TEXT,
  "status" "RoommateTeamInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoommateTeamInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoommateTeamInvite_distinct_users" CHECK ("inviterId" <> "inviteeId")
);

CREATE UNIQUE INDEX "RoommateTeam_dealRoomId_key" ON "RoommateTeam"("dealRoomId");
CREATE INDEX "RoommateTeam_status_updatedAt_idx" ON "RoommateTeam"("status", "updatedAt");
CREATE UNIQUE INDEX "RoommateTeamMember_teamId_userId_key" ON "RoommateTeamMember"("teamId", "userId");
CREATE INDEX "RoommateTeamMember_userId_active_idx" ON "RoommateTeamMember"("userId", "active");
CREATE UNIQUE INDEX "RoommateTeamMember_one_active_per_user" ON "RoommateTeamMember"("userId") WHERE "active" = TRUE;
CREATE INDEX "RoommateTeamInvite_inviterId_status_createdAt_idx" ON "RoommateTeamInvite"("inviterId", "status", "createdAt");
CREATE INDEX "RoommateTeamInvite_inviteeId_status_createdAt_idx" ON "RoommateTeamInvite"("inviteeId", "status", "createdAt");
CREATE INDEX "RoommateTeamInvite_matchId_status_idx" ON "RoommateTeamInvite"("matchId", "status");
CREATE UNIQUE INDEX "RoommateTeamInvite_one_pending_per_match" ON "RoommateTeamInvite"("matchId") WHERE "status" = 'PENDING';

ALTER TABLE "RoommateTeam"
  ADD CONSTRAINT "RoommateTeam_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RoommateTeam_dissolvedById_fkey" FOREIGN KEY ("dissolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoommateTeamMember"
  ADD CONSTRAINT "RoommateTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "RoommateTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RoommateTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoommateTeamInvite"
  ADD CONSTRAINT "RoommateTeamInvite_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RoommateMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RoommateTeamInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RoommateTeamInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RoommateTeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "RoommateTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
