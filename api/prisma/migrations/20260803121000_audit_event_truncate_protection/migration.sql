-- Keep the previously deployed append-only event table immutable even when a
-- statement-level TRUNCATE is attempted; row triggers do not observe TRUNCATE.
CREATE TRIGGER "AuditEvent_immutable_truncate"
BEFORE TRUNCATE ON "AuditEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_event_mutation"();
