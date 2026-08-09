-- CreateEnum
CREATE TYPE "RoommateMatchStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterTable
ALTER TABLE "RoommateProfile" ADD COLUMN "ownerId" TEXT;

-- CreateTable
CREATE TABLE "RoommateMatch" (
    "id" TEXT NOT NULL,
    "firstUserId" TEXT NOT NULL,
    "secondUserId" TEXT NOT NULL,
    "status" "RoommateMatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoommateMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoommateConversation" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoommateConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoommateConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoommateConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoommateMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoommateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoommateProfile_ownerId_key" ON "RoommateProfile"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "RoommateMatch_firstUserId_secondUserId_key" ON "RoommateMatch"("firstUserId", "secondUserId");

-- CreateIndex
CREATE INDEX "RoommateMatch_firstUserId_status_updatedAt_idx" ON "RoommateMatch"("firstUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "RoommateMatch_secondUserId_status_updatedAt_idx" ON "RoommateMatch"("secondUserId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoommateConversation_matchId_key" ON "RoommateConversation"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "RoommateConversationMember_conversationId_userId_key" ON "RoommateConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "RoommateConversationMember_userId_updatedAt_idx" ON "RoommateConversationMember"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoommateMessage_senderId_clientMessageId_key" ON "RoommateMessage"("senderId", "clientMessageId");

-- CreateIndex
CREATE INDEX "RoommateMessage_conversationId_createdAt_id_idx" ON "RoommateMessage"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RoommateMessage_senderId_idx" ON "RoommateMessage"("senderId");

-- AddForeignKey
ALTER TABLE "RoommateProfile" ADD CONSTRAINT "RoommateProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateMatch" ADD CONSTRAINT "RoommateMatch_firstUserId_fkey" FOREIGN KEY ("firstUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateMatch" ADD CONSTRAINT "RoommateMatch_secondUserId_fkey" FOREIGN KEY ("secondUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateConversation" ADD CONSTRAINT "RoommateConversation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "RoommateMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateConversationMember" ADD CONSTRAINT "RoommateConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "RoommateConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateConversationMember" ADD CONSTRAINT "RoommateConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateMessage" ADD CONSTRAINT "RoommateMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "RoommateConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateMessage" ADD CONSTRAINT "RoommateMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
