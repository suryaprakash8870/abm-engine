-- CreateTable
CREATE TABLE "crm_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "crm_type" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "portal_id" TEXT,
    "instance_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sync_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "records_total" INTEGER NOT NULL DEFAULT 0,
    "records_synced" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sync_job_id" TEXT,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "api_response" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_mappings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "crm_type" TEXT NOT NULL,
    "abm_field" TEXT NOT NULL,
    "crm_field" TEXT NOT NULL,

    CONSTRAINT "field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "crm_type" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_connections_workspace_id_idx" ON "crm_connections"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_connections_workspace_id_crm_type_key" ON "crm_connections"("workspace_id", "crm_type");

-- CreateIndex
CREATE INDEX "sync_jobs_workspace_id_idx" ON "sync_jobs"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_jobs_workspace_id_sync_type_correlation_id_key" ON "sync_jobs"("workspace_id", "sync_type", "correlation_id");

-- CreateIndex
CREATE INDEX "sync_log_workspace_id_synced_at_idx" ON "sync_log"("workspace_id", "synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_log_workspace_id_sync_job_id_record_id_key" ON "sync_log"("workspace_id", "sync_job_id", "record_id");

-- CreateIndex
CREATE INDEX "field_mappings_workspace_id_idx" ON "field_mappings"("workspace_id");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_workspace_id_idx" ON "webhook_subscriptions"("workspace_id");
