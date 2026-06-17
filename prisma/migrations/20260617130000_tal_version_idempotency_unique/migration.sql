-- Engine 05 hardening (audit Batch): idempotency guard on TAL versions.
-- One immutable version per source event — a concurrent/retried accounts.scored
-- can no longer cut a duplicate version (NULL correlation ids stay unconstrained).
CREATE UNIQUE INDEX "tal_versions_workspace_id_source_correlation_id_key" ON "tal_versions"("workspace_id", "source_correlation_id");
