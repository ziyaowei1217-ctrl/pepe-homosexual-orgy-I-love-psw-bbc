-- Provider subjects are bound once; verified email changes never remap an identity.
CREATE TABLE "ExternalAuthIdentity" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalAuthIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExternalAuthIdentity_provider_issuer_subject_key" ON "ExternalAuthIdentity"("provider", "issuer", "subject");
CREATE UNIQUE INDEX "ExternalAuthIdentity_provider_issuer_userId_key" ON "ExternalAuthIdentity"("provider", "issuer", "userId");
CREATE INDEX "ExternalAuthIdentity_userId_idx" ON "ExternalAuthIdentity"("userId");
ALTER TABLE "ExternalAuthIdentity" ADD CONSTRAINT "ExternalAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
