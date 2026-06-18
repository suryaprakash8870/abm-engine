-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "signal_type" TEXT NOT NULL,
    "signal_source" TEXT NOT NULL,
    "points_awarded" INTEGER NOT NULL,
    "decay_rate_per_week" DOUBLE PRECISION NOT NULL,
    "page_url" TEXT,
    "metadata" JSONB,
    "dedup_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_sources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "signal_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "source" TEXT NOT NULL,
    "payload" JSONB,
    "signature_valid" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_tokens" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_sessions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "account_id" TEXT,
    "ip_hash" TEXT NOT NULL,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signals_workspace_id_account_id_idx" ON "signals"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "signals_workspace_id_occurred_at_idx" ON "signals"("workspace_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "signals_workspace_id_dedup_key_key" ON "signals"("workspace_id", "dedup_key");

-- CreateIndex
CREATE INDEX "signal_sources_workspace_id_idx" ON "signal_sources"("workspace_id");

-- CreateIndex
CREATE INDEX "webhook_log_workspace_id_idx" ON "webhook_log"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_tokens_token_key" ON "tracking_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_tokens_workspace_id_key" ON "tracking_tokens"("workspace_id");

-- CreateIndex
CREATE INDEX "visitor_sessions_workspace_id_account_id_idx" ON "visitor_sessions"("workspace_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_sessions_workspace_id_session_id_key" ON "visitor_sessions"("workspace_id", "session_id");
