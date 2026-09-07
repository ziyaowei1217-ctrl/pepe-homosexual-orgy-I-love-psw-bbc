-- Existing and server-generated messages have no client operation identity.
ALTER TABLE "DealMessage" ADD COLUMN "clientMessageId" TEXT;

-- PostgreSQL permits multiple NULL values; identified user operations are unique per sender.
CREATE UNIQUE INDEX "DealMessage_senderId_clientMessageId_key"
ON "DealMessage"("senderId", "clientMessageId");
