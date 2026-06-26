-- CreateTable (IF NOT EXISTS — the table may already exist via `prisma db push`
-- in dev; this migration is what creates it in deployed environments).
CREATE TABLE IF NOT EXISTS "integration_keys" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "key_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "integration_keys_workspace_id_idx" ON "integration_keys"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "integration_keys_workspace_id_provider_key" ON "integration_keys"("workspace_id", "provider");
