-- Supports selecting one stable current matching profile per owner, including
-- legacy accounts that created several rows before writes became canonical.
CREATE INDEX "roommate_profiles_user_id_created_at_id_idx"
ON "roommate_profiles"("user_id", "created_at", "id");
