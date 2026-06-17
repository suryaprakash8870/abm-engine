-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "crm_contact_id" TEXT,
    "full_name" TEXT NOT NULL,
    "title" TEXT,
    "seniority" TEXT,
    "department" TEXT,
    "linkedin_url" TEXT,
    "email" TEXT,
    "email_status" TEXT,
    "stakeholder_role" TEXT,
    "role_confidence" DOUBLE PRECISION,
    "flagged_for_review" BOOLEAN NOT NULL DEFAULT false,
    "engagement_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholder_maps" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "dm_contact_ids" TEXT[],
    "champion_contact_ids" TEXT[],
    "influencer_contact_ids" TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stakeholder_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_results" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bounce_risk" DOUBLE PRECISION NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_crm_sync_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_crm_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourcing_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "contacts_found" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sourcing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_workspace_id_idx" ON "contacts"("workspace_id");

-- CreateIndex
CREATE INDEX "contacts_account_id_idx" ON "contacts"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_account_id_email_key" ON "contacts"("workspace_id", "account_id", "email");

-- CreateIndex
CREATE INDEX "stakeholder_maps_workspace_id_idx" ON "stakeholder_maps"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "stakeholder_maps_workspace_id_account_id_key" ON "stakeholder_maps"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "email_verification_results_workspace_id_idx" ON "email_verification_results"("workspace_id");

-- CreateIndex
CREATE INDEX "email_verification_results_contact_id_idx" ON "email_verification_results"("contact_id");

-- CreateIndex
CREATE INDEX "contact_crm_sync_log_workspace_id_idx" ON "contact_crm_sync_log"("workspace_id");

-- CreateIndex
CREATE INDEX "contact_crm_sync_log_contact_id_idx" ON "contact_crm_sync_log"("contact_id");

-- CreateIndex
CREATE INDEX "sourcing_jobs_workspace_id_idx" ON "sourcing_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "sourcing_jobs_account_id_idx" ON "sourcing_jobs"("account_id");
