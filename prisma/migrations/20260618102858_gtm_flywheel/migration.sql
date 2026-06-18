-- CreateTable
CREATE TABLE "pipeline_snapshots" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pipeline_by_tier" JSONB NOT NULL,
    "win_rate_by_tier" JSONB NOT NULL,
    "avg_deal_size_by_tier" JSONB NOT NULL,
    "days_to_close_by_tier" JSONB NOT NULL,

    CONSTRAINT "pipeline_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "touch_type" TEXT NOT NULL,
    "touch_subtype" TEXT,
    "signal_id" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "occurred_before_pipeline" BOOLEAN NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "win_loss_analysis" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "account_id" TEXT,
    "outcome" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "account_attributes" JSONB NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "win_loss_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flywheel_metrics" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "period" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_correlation_data" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "signal_combination" TEXT[],
    "correlation_score" DOUBLE PRECISION NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_correlation_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_snapshots_workspace_id_date_idx" ON "pipeline_snapshots"("workspace_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_snapshots_workspace_id_date_key" ON "pipeline_snapshots"("workspace_id", "date");

-- CreateIndex
CREATE INDEX "attribution_events_workspace_id_deal_id_idx" ON "attribution_events"("workspace_id", "deal_id");

-- CreateIndex
CREATE INDEX "win_loss_analysis_workspace_id_outcome_idx" ON "win_loss_analysis"("workspace_id", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "win_loss_analysis_workspace_id_deal_id_key" ON "win_loss_analysis"("workspace_id", "deal_id");

-- CreateIndex
CREATE INDEX "flywheel_metrics_workspace_id_metric_key_period_idx" ON "flywheel_metrics"("workspace_id", "metric_key", "period");

-- CreateIndex
CREATE UNIQUE INDEX "flywheel_metrics_workspace_id_metric_key_period_key" ON "flywheel_metrics"("workspace_id", "metric_key", "period");

-- CreateIndex
CREATE INDEX "signal_correlation_data_workspace_id_idx" ON "signal_correlation_data"("workspace_id");
