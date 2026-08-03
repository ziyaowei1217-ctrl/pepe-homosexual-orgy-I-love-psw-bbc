BEGIN;

-- Full operator email attribution belongs only in immutable AuditEvent.actorEmail.
-- NOT VALID checks protect concurrent writes while legacy rows are cleaned below.
ALTER TABLE "BetaInvite"
  ADD CONSTRAINT "BetaInvite_createdBy_no_full_email"
    CHECK (POSITION('@' IN "createdBy") = 0) NOT VALID,
  ADD CONSTRAINT "BetaInvite_revokedBy_no_full_email"
    CHECK ("revokedBy" IS NULL OR POSITION('@' IN "revokedBy") = 0) NOT VALID;

UPDATE "BetaInvite"
SET
  "createdBy" = CASE
    WHEN POSITION('@' IN "createdBy") > 0 THEN '[REDACTED]'
    ELSE "createdBy"
  END,
  "revokedBy" = CASE
    WHEN "revokedBy" IS NOT NULL AND POSITION('@' IN "revokedBy") > 0 THEN '[REDACTED]'
    ELSE "revokedBy"
  END
WHERE
  POSITION('@' IN "createdBy") > 0
  OR ("revokedBy" IS NOT NULL AND POSITION('@' IN "revokedBy") > 0);

ALTER TABLE "BetaInvite"
  VALIDATE CONSTRAINT "BetaInvite_createdBy_no_full_email";

ALTER TABLE "BetaInvite"
  VALIDATE CONSTRAINT "BetaInvite_revokedBy_no_full_email";

COMMIT;
