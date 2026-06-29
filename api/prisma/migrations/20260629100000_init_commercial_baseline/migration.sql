-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RoommateActionType" AS ENUM ('LIKE', 'PASS', 'LATER');

-- CreateEnum
CREATE TYPE "DealRoomStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TourRequestStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "originalPrice" INTEGER NOT NULL,
    "beds" INTEGER NOT NULL,
    "baths" INTEGER NOT NULL,
    "commute" TEXT NOT NULL,
    "transit" TEXT NOT NULL,
    "trust" TEXT NOT NULL,
    "tags" TEXT[],
    "score" DOUBLE PRECISION NOT NULL DEFAULT 4.8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoommateProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "match" INTEGER NOT NULL,
    "budget" TEXT NOT NULL,
    "commute" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoommateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "members" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustQueueItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "variant" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoommateAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roommateProfileId" TEXT NOT NULL,
    "action" "RoommateActionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoommateAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealRoom" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "roommateProfileId" TEXT NOT NULL,
    "status" "DealRoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "recommendedHomes" JSONB NOT NULL,
    "pipeline" JSONB NOT NULL,
    "trustChecklist" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealRoomMember" (
    "id" TEXT NOT NULL,
    "dealRoomId" TEXT NOT NULL,
    "roommateProfileId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourRequest" (
    "id" TEXT NOT NULL,
    "dealRoomId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "TourRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "VerificationCode_email_consumedAt_expiresAt_idx" ON "VerificationCode"("email", "consumedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "RoommateAction_userId_idx" ON "RoommateAction"("userId");

-- CreateIndex
CREATE INDEX "RoommateAction_roommateProfileId_idx" ON "RoommateAction"("roommateProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "RoommateAction_userId_roommateProfileId_key" ON "RoommateAction"("userId", "roommateProfileId");

-- CreateIndex
CREATE INDEX "DealRoom_ownerId_status_updatedAt_idx" ON "DealRoom"("ownerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DealRoom_roommateProfileId_idx" ON "DealRoom"("roommateProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoom_ownerId_roommateProfileId_key" ON "DealRoom"("ownerId", "roommateProfileId");

-- CreateIndex
CREATE INDEX "DealRoomMember_dealRoomId_idx" ON "DealRoomMember"("dealRoomId");

-- CreateIndex
CREATE INDEX "DealRoomMember_roommateProfileId_idx" ON "DealRoomMember"("roommateProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DealRoomMember_dealRoomId_roommateProfileId_key" ON "DealRoomMember"("dealRoomId", "roommateProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "TourRequest_dealRoomId_key" ON "TourRequest"("dealRoomId");

-- CreateIndex
CREATE INDEX "TourRequest_requesterId_status_createdAt_idx" ON "TourRequest"("requesterId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateAction" ADD CONSTRAINT "RoommateAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoommateAction" ADD CONSTRAINT "RoommateAction_roommateProfileId_fkey" FOREIGN KEY ("roommateProfileId") REFERENCES "RoommateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRoom" ADD CONSTRAINT "DealRoom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRoom" ADD CONSTRAINT "DealRoom_roommateProfileId_fkey" FOREIGN KEY ("roommateProfileId") REFERENCES "RoommateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRoomMember" ADD CONSTRAINT "DealRoomMember_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRoomMember" ADD CONSTRAINT "DealRoomMember_roommateProfileId_fkey" FOREIGN KEY ("roommateProfileId") REFERENCES "RoommateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourRequest" ADD CONSTRAINT "TourRequest_dealRoomId_fkey" FOREIGN KEY ("dealRoomId") REFERENCES "DealRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourRequest" ADD CONSTRAINT "TourRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

