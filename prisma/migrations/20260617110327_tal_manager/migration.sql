-- CreateTable
CREATE TABLE "target_account_lists" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Target Account List',
    "version" INTEGER NOT NULL DEFAULT 0,
    "account_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "review_status" TEXT NOT NULL DEFAULT 'unreviewed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_account_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tal_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "domain" TEXT,
    "name" TEXT,
    "tier" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tal_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tal_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "source_correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_list" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "domain" TEXT,
    "account_id" TEXT,
    "reason" TEXT NOT NULL,
    "suppressed_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_audience_sync_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tal_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "audience" TEXT,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_audience_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "target_account_lists_workspace_id_key" ON "target_account_lists"("workspace_id");

-- CreateIndex
CREATE INDEX "tal_accounts_workspace_id_idx" ON "tal_accounts"("workspace_id");

-- CreateIndex
CREATE INDEX "tal_accounts_tal_id_idx" ON "tal_accounts"("tal_id");

-- CreateIndex
CREATE UNIQUE INDEX "tal_accounts_tal_id_account_id_key" ON "tal_accounts"("tal_id", "account_id");

-- CreateIndex
CREATE INDEX "tal_versions_workspace_id_idx" ON "tal_versions"("workspace_id");

-- CreateIndex
CREATE INDEX "tal_versions_tal_id_idx" ON "tal_versions"("tal_id");

-- CreateIndex
CREATE UNIQUE INDEX "tal_versions_tal_id_version_number_key" ON "tal_versions"("tal_id", "version_number");

-- CreateIndex
CREATE INDEX "suppression_list_workspace_id_idx" ON "suppression_list"("workspace_id");

-- CreateIndex
CREATE INDEX "suppression_list_workspace_id_domain_idx" ON "suppression_list"("workspace_id", "domain");

-- CreateIndex
CREATE INDEX "crm_audience_sync_log_workspace_id_idx" ON "crm_audience_sync_log"("workspace_id");

-- CreateIndex
CREATE INDEX "crm_audience_sync_log_tal_id_idx" ON "crm_audience_sync_log"("tal_id");

-- AddForeignKey
ALTER TABLE "tal_accounts" ADD CONSTRAINT "tal_accounts_tal_id_fkey" FOREIGN KEY ("tal_id") REFERENCES "target_account_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tal_versions" ADD CONSTRAINT "tal_versions_tal_id_fkey" FOREIGN KEY ("tal_id") REFERENCES "target_account_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_audience_sync_log" ADD CONSTRAINT "crm_audience_sync_log_tal_id_fkey" FOREIGN KEY ("tal_id") REFERENCES "target_account_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
