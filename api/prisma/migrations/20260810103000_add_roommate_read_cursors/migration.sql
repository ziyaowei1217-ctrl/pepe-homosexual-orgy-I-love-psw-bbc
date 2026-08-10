-- AlterTable
ALTER TABLE "RoommateConversationMember"
ADD COLUMN "lastReadMessageId" TEXT,
ADD COLUMN "lastReadAt" TIMESTAMP(3);
