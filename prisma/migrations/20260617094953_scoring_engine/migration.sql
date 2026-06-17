-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member');

-- CreateTable
CREATE TABLE "enrichment_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_job_id" TEXT NOT NULL,
    "icp_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "total" INTEGER NOT NULL DEFAULT 0,
    "enriched" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "qualified_count" INTEGER NOT NULL DEFAULT 0,
    "disqualified_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "enrichment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enriched_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "headcount" INTEGER,
    "revenue" TEXT,
    "geography" TEXT,
    "funding_stage" TEXT,
    "tech_stack" TEXT[],
    "data_quality_score" DOUBLE PRECISION,
    "enrichment_sources" TEXT[],
    "enriched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enriched_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification_results" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "qualified" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "disqualifying_factors" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qualification_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "accuracy_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_cache" (
    "domain" TEXT NOT NULL,
    "firmographics" JSONB NOT NULL,
    "technographics" JSONB NOT NULL,
    "enriched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmographic_expires_at" TIMESTAMP(3) NOT NULL,
    "technographic_expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrichment_cache_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "enrichment_icp_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "icp_id" TEXT NOT NULL,
    "firmographics" JSONB NOT NULL,
    "technographics" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "exclusions" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrichment_icp_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icp_definitions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL,
    "firmographics" JSONB NOT NULL,
    "technographics" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "exclusions" JSONB NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "icp_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icp_versions" (
    "id" TEXT NOT NULL,
    "icp_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "icp_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wizard_sessions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "icp_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "wizard_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_analysis_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "crm_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deal_count" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icp_confidence_history" (
    "id" TEXT NOT NULL,
    "icp_id" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "icp_confidence_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_formulas" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "icp_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "criteria" JSONB NOT NULL,
    "tier_boundaries" JSONB NOT NULL,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_formula_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "formula_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_formula_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_scores" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "formula_version" INTEGER NOT NULL,
    "total_score" DOUBLE PRECISION NOT NULL,
    "tier" INTEGER NOT NULL,
    "criterion_scores" JSONB NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_history" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "tier" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_overrides" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "overridden_by" TEXT NOT NULL,
    "overridden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tier_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tam_build_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "icp_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "total_found" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "account_limit" INTEGER NOT NULL DEFAULT 1000,
    "filters" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tam_build_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apollo_search_results" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "raw_response" JSONB NOT NULL,
    "page_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apollo_search_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_account_list" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apollo_id" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_account_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_params_log" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "result_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_params_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrichment_jobs_workspace_id_idx" ON "enrichment_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "enrichment_jobs_source_job_id_idx" ON "enrichment_jobs"("source_job_id");

-- CreateIndex
CREATE INDEX "enriched_accounts_job_id_idx" ON "enriched_accounts"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "enriched_accounts_workspace_id_account_id_key" ON "enriched_accounts"("workspace_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_results_account_id_key" ON "qualification_results"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_icp_snapshots_icp_id_key" ON "enrichment_icp_snapshots"("icp_id");

-- CreateIndex
CREATE INDEX "enrichment_icp_snapshots_workspace_id_idx" ON "enrichment_icp_snapshots"("workspace_id");

-- CreateIndex
CREATE INDEX "icp_definitions_workspace_id_idx" ON "icp_definitions"("workspace_id");

-- CreateIndex
CREATE INDEX "icp_versions_icp_id_idx" ON "icp_versions"("icp_id");

-- CreateIndex
CREATE INDEX "wizard_sessions_workspace_id_idx" ON "wizard_sessions"("workspace_id");

-- CreateIndex
CREATE INDEX "crm_analysis_jobs_workspace_id_idx" ON "crm_analysis_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "icp_confidence_history_icp_id_idx" ON "icp_confidence_history"("icp_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "scoring_formulas_workspace_id_icp_id_idx" ON "scoring_formulas"("workspace_id", "icp_id");

-- CreateIndex
CREATE INDEX "scoring_formula_versions_workspace_id_formula_id_idx" ON "scoring_formula_versions"("workspace_id", "formula_id");

-- CreateIndex
CREATE INDEX "account_scores_workspace_id_idx" ON "account_scores"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_scores_workspace_id_account_id_key" ON "account_scores"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "score_history_workspace_id_account_id_idx" ON "score_history"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "tier_overrides_workspace_id_account_id_idx" ON "tier_overrides"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "tam_build_jobs_workspace_id_idx" ON "tam_build_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "tam_build_jobs_icp_id_idx" ON "tam_build_jobs"("icp_id");

-- CreateIndex
CREATE INDEX "apollo_search_results_job_id_idx" ON "apollo_search_results"("job_id");

-- CreateIndex
CREATE INDEX "raw_account_list_job_id_idx" ON "raw_account_list"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_account_list_workspace_id_domain_key" ON "raw_account_list"("workspace_id", "domain");

-- CreateIndex
CREATE INDEX "search_params_log_job_id_idx" ON "search_params_log"("job_id");

-- AddForeignKey
ALTER TABLE "icp_versions" ADD CONSTRAINT "icp_versions_icp_id_fkey" FOREIGN KEY ("icp_id") REFERENCES "icp_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icp_confidence_history" ADD CONSTRAINT "icp_confidence_history_icp_id_fkey" FOREIGN KEY ("icp_id") REFERENCES "icp_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_formula_versions" ADD CONSTRAINT "scoring_formula_versions_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "scoring_formulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
