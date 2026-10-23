-- Structured fields for two-sided roommate matching; existing rows stay unknown/open.
ALTER TABLE "roommate_profiles"
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "gender_preference" TEXT NOT NULL DEFAULT 'any',
  ADD COLUMN "dealbreakers" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "roommate_profiles"
  ADD CONSTRAINT "roommate_profiles_gender_check"
    CHECK ("gender" IS NULL OR "gender" IN ('female', 'male', 'nonbinary')),
  ADD CONSTRAINT "roommate_profiles_gender_preference_check"
    CHECK ("gender_preference" IN ('any', 'female', 'male')),
  ADD CONSTRAINT "roommate_profiles_dealbreakers_check"
    CHECK ("dealbreakers" <@ ARRAY['smoking', 'pets', 'night_owl', 'frequent_guests']::TEXT[]);

-- Each public card points at the matching row it was projected from.
ALTER TABLE "RoommateProfile" ADD COLUMN "matchingProfileId" UUID;

ALTER TABLE "RoommateProfile"
  ADD CONSTRAINT "RoommateProfile_matchingProfileId_fkey"
  FOREIGN KEY ("matchingProfileId") REFERENCES "roommate_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "RoommateProfile_matchingProfileId_idx" ON "RoommateProfile"("matchingProfileId");

-- Owned cards were linked to matching rows only through the owner's email; keep the latest row.
UPDATE "RoommateProfile" AS card
SET "matchingProfileId" = latest."id"
FROM "User" AS owner
CROSS JOIN LATERAL (
  SELECT rp."id"
  FROM "roommate_profiles" AS rp
  JOIN "profiles" AS p ON p."id" = rp."user_id"
  WHERE p."email" = owner."email"
  ORDER BY rp."updated_at" DESC, rp."created_at" DESC
  LIMIT 1
) AS latest
WHERE card."ownerId" = owner."id";

-- The deck's recent-likes and recent-activity counts read these ranges on every load.
CREATE INDEX "RoommateAction_action_updatedAt_roommateProfileId_idx" ON "RoommateAction"("action", "updatedAt", "roommateProfileId");
CREATE INDEX "RoommateAction_updatedAt_userId_idx" ON "RoommateAction"("updatedAt", "userId");
