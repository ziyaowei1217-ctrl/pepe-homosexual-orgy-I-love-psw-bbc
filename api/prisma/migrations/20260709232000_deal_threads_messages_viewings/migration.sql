-- CreateEnum
CREATE TYPE "ViewingMode" AS ENUM ('IN_PERSON', 'VIDEO');

-- CreateEnum
CREATE TYPE "ViewingRequestStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DealThread" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dealRoomId" TEXT,
    "listingId" TEXT NOT NULL,
    "listingTitle" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "participantNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "align" TEXT NOT NULL DEFAULT 'right',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingRequest" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "listingTitle" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "timeLabel" TEXT NOT NULL,
    "iso" TIMESTAMP(3) NOT NULL,
    "mode" "ViewingMode" NOT NULL,
    "participantNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ViewingRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealThread_ownerId_listingId_key" ON "DealThread"("ownerId", "listingId");

-- CreateIndex
CREATE INDEX "DealThread_ownerId_updatedAt_idx" ON "DealThread"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "DealThread_dealRoomId_idx" ON "DealThread"("dealRoomId");

-- CreateIndex
CREATE INDEX "DealMessage_threadId_createdAt_idx" ON "DealMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "DealMessage_senderId_idx" ON "DealMessage"("senderId");

-- CreateIndex
CREATE INDEX "ViewingRequest_threadId_createdAt_idx" ON "ViewingRequest"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ViewingRequest_requesterId_status_createdAt_idx" ON "ViewingRequest"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ViewingRequest_listingId_status_createdAt_idx" ON "ViewingRequest"("listingId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "DealThread" ADD CONSTRAINT "DealThread_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealThread" ADD CONSTRAINT "DealThread_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DealThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingRequest" ADD CONSTRAINT "ViewingRequest_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DealThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingRequest" ADD CONSTRAINT "ViewingRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
