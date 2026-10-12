ALTER TABLE "AuthSession" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
CREATE TABLE "UserMfa" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "encryptedSecret" TEXT, "pendingEncryptedSecret" TEXT, "pendingSessionId" UUID,
 "pendingExpiresAt" TIMESTAMP(3), "enabledAt" TIMESTAMP(3), "lastUsedStep" INTEGER,
 "failureCount" INTEGER NOT NULL DEFAULT 0, "lockedUntil" TIMESTAMP(3)
);
CREATE TABLE "MfaRecoveryCode" (
 "id" UUID PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "codeHash" TEXT NOT NULL, "usedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "MfaRecoveryCode_userId_codeHash_key" ON "MfaRecoveryCode"("userId", "codeHash");
