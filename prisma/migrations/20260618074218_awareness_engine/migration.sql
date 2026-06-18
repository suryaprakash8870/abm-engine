-- CreateTable
CREATE TABLE "awareness_scores" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "current_score" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'identified',
    "score_7d_change" INTEGER NOT NULL DEFAULT 0,
    "score_30d_change" INTEGER NOT NULL DEFAULT 0,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_signal_at" TIMESTAMP(3),

    CONSTRAINT "awareness_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "dominant_signal_type" TEXT NOT NULL,

    CONSTRAINT "score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trigger_config" JSONB NOT NULL,
    "actions" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cooldown_days" INTEGER NOT NULL DEFAULT 7,
    "max_per_month" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rule_evaluations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "fired_at" TIMESTAMP(3),
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_rule_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_change_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "from_stage" TEXT NOT NULL,
    "to_stage" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "awareness_scores_workspace_id_current_score_idx" ON "awareness_scores"("workspace_id", "current_score");

-- CreateIndex
CREATE UNIQUE INDEX "awareness_scores_workspace_id_account_id_key" ON "awareness_scores"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "score_snapshots_workspace_id_account_id_idx" ON "score_snapshots"("workspace_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_snapshots_workspace_id_account_id_date_key" ON "score_snapshots"("workspace_id", "account_id", "date");

-- CreateIndex
CREATE INDEX "routing_rules_workspace_id_idx" ON "routing_rules"("workspace_id");

-- CreateIndex
CREATE INDEX "routing_rule_evaluations_workspace_id_rule_id_account_id_idx" ON "routing_rule_evaluations"("workspace_id", "rule_id", "account_id");

-- CreateIndex
CREATE INDEX "stage_change_log_workspace_id_account_id_idx" ON "stage_change_log"("workspace_id", "account_id");
