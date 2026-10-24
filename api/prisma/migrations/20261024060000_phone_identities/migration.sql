-- One verified phone number per account and one account per phone number.
CREATE TABLE "PhoneIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PhoneIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhoneIdentity_phoneNumber_e164" CHECK ("phoneNumber" ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX "PhoneIdentity_userId_key" ON "PhoneIdentity"("userId");
CREATE UNIQUE INDEX "PhoneIdentity_phoneNumber_key" ON "PhoneIdentity"("phoneNumber");
ALTER TABLE "PhoneIdentity" ADD CONSTRAINT "PhoneIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
