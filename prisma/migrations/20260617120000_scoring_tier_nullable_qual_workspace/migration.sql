-- Engine 04 hardening (Batch 2 of the scoring audit):
--   (1) nullable tier so the tier3_min floor is honoured (below it = untiered, not in the TAL)
--   (2) workspace-scope qualification_results (architecture rule #3: every table has workspace_id)

-- 1. account_scores.tier / score_history.tier become nullable.
--    null = the account was scored but fell below tier3_min, so it has no tier.
ALTER TABLE "account_scores" ALTER COLUMN "tier" DROP NOT NULL;
ALTER TABLE "score_history" ALTER COLUMN "tier" DROP NOT NULL;

-- 2. qualification_results gets workspace_id. Add it nullable first, backfill from
--    enriched_accounts (same account_id), then enforce NOT NULL — preserves existing data.
ALTER TABLE "qualification_results" ADD COLUMN "workspace_id" TEXT;

UPDATE "qualification_results" qr
SET "workspace_id" = ea."workspace_id"
FROM "enriched_accounts" ea
WHERE ea."account_id" = qr."account_id";

-- Drop orphan rows that have no enriched account to source a tenant from.
DELETE FROM "qualification_results" WHERE "workspace_id" IS NULL;

ALTER TABLE "qualification_results" ALTER COLUMN "workspace_id" SET NOT NULL;

-- 3. Replace the global unique(account_id) with a per-workspace unique + index.
DROP INDEX "qualification_results_account_id_key";
CREATE UNIQUE INDEX "qualification_results_workspace_id_account_id_key" ON "qualification_results"("workspace_id", "account_id");
CREATE INDEX "qualification_results_workspace_id_idx" ON "qualification_results"("workspace_id");
