-- CreateTable
CREATE TABLE "plays_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "play_type" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "trigger_signal_id" TEXT,
    "execution_method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'fired',
    "crm_task_id" TEXT,
    "slack_message_ts" TEXT,
    "assigned_to" TEXT,
    "outcome" TEXT,
    "snoozed_until" TIMESTAMP(3),
    "correlation_id" TEXT,
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plays_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "play_type" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "execution_method" TEXT NOT NULL,
    "template_config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "play_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_outcomes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "play_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "cooldown_days" INTEGER NOT NULL DEFAULT 7,
    "max_per_month" INTEGER NOT NULL DEFAULT 4,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "suppression_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_mappings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "industry" TEXT,
    "role" TEXT,
    "sequence_id" TEXT NOT NULL,

    CONSTRAINT "sequence_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_draft_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "play_id" TEXT NOT NULL,
    "subject_lines" TEXT[],
    "body" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_draft_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plays_log_workspace_id_account_id_idx" ON "plays_log"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "plays_log_workspace_id_status_idx" ON "plays_log"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plays_log_workspace_id_account_id_correlation_id_key" ON "plays_log"("workspace_id", "account_id", "correlation_id");

-- CreateIndex
CREATE INDEX "play_templates_workspace_id_idx" ON "play_templates"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "play_templates_workspace_id_tier_stage_key" ON "play_templates"("workspace_id", "tier", "stage");

-- CreateIndex
CREATE INDEX "play_outcomes_workspace_id_play_id_idx" ON "play_outcomes"("workspace_id", "play_id");

-- CreateIndex
CREATE INDEX "suppression_rules_workspace_id_idx" ON "suppression_rules"("workspace_id");

-- CreateIndex
CREATE INDEX "sequence_mappings_workspace_id_tier_idx" ON "sequence_mappings"("workspace_id", "tier");

-- CreateIndex
CREATE INDEX "ai_draft_log_workspace_id_play_id_idx" ON "ai_draft_log"("workspace_id", "play_id");
