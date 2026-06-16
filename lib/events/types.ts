/**
 * FROZEN EVENT CONTRACTS — the single source of truth for engine-to-engine communication.
 *
 * This file is the most important interface in the system. Engines NEVER call each
 * other directly; they publish and subscribe to the events typed here. Because these
 * payloads are frozen, each of the 11 engines can be built independently and in
 * parallel against a stable contract.
 *
 * RULES
 *  - Every event flows inside an `EventEnvelope` carrying workspace_id, correlation_id, timestamp.
 *  - Adding a field is backwards-compatible. Renaming/removing a field is a BREAKING change —
 *    it requires a version bump and sign-off from every consuming engine's owner.
 *  - Keep this in sync with docs/project/architecture.md (the event table) and each engine doc.
 *
 * See docs/project/ownership.md for who publishes/consumes what.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared scalar / enum types
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceId = string;
export type CorrelationId = string;
export type AccountId = string;
export type ContactId = string;
export type IsoTimestamp = string; // ISO-8601, e.g. "2026-06-16T12:00:00.000Z"

export type Tier = 1 | 2 | 3;

/** The five awareness stages, in order. */
export type AwarenessStage =
  | 'identified'
  | 'aware'
  | 'interested'
  | 'considering'
  | 'selecting';

export type CrmType = 'hubspot' | 'salesforce';

/** The three ICP creation modes (ADR-007). */
export type IcpMode = 'hypothesis' | 'crm_analysis' | 'csv_import';

/** Generic JSON blob — used for JSONB fields whose internal shape an owner refines. */
export type Json = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// The envelope — every event on the bus is wrapped in this
// ─────────────────────────────────────────────────────────────────────────────

export interface EventEnvelope<T extends EventName = EventName> {
  /** The event name, e.g. "accounts.enriched". */
  type: T;
  /** The domain payload, typed per-event below. */
  payload: EventPayloads[T];
  /** Tenant the event belongs to. ALWAYS present (multi-tenancy, ADR-004). */
  workspace_id: WorkspaceId;
  /** Generated at the start of a pipeline run, propagated through every downstream event (ADR-002). */
  correlation_id: CorrelationId;
  /** When the event was published. */
  timestamp: IsoTimestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// 01 ICP Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface IcpCreatedPayload {
  icp_id: string;
  version: number;
  mode: IcpMode;
  firmographics: Json;
  technographics: Json;
  signals: Json;
  exclusions: Json;
  confidence_score: number;
}

export interface IcpUpdatedPayload {
  icp_id: string;
  version: number;
  previous_version: number;
  changed_fields: string[];
  confidence_score: number;
  update_source: 'manual_edit' | 'flywheel_feedback';
}

export interface IcpErrorPayload {
  icp_id: string | null;
  mode: IcpMode;
  failure_reason: string;
  stage: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 02 TAM Builder
// ─────────────────────────────────────────────────────────────────────────────

export interface TamSearchCompletedPayload {
  job_id: string;
  icp_id: string;
  account_ids: AccountId[];
  total_found: number;
  account_limit: number;
  source_breakdown: Json; // { apollo: number, csv_upload: number, ... }
}

export interface TamSearchFailedPayload {
  job_id: string;
  icp_id: string;
  error_code: string;
  error_message: string;
  last_processed_page: number;
  processed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 03 Enrichment Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountsEnrichedPayload {
  job_id: string;
  source_job_id: string; // the tam_build_jobs id that triggered enrichment
  enriched_account_ids: AccountId[];
  total: number;
  enriched: number;
  failed: number;
  qualified_count: number;
  disqualified_count: number;
  quality_summary: Json;
  top_industries: string[];
  geography_breakdown: Json;
}

export interface EnrichmentFailedPayload {
  job_id: string;
  source_job_id: string;
  error_reason: string;
  failed_checks: string[];
  partial_enriched_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 Scoring Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountsScoredPayload {
  account_ids: AccountId[];
  formula_version: number;
  tier_summary: Json;
  tier_1_count: number;
  tier_2_count: number;
  tier_3_count: number;
  top_tier_1_account_ids: AccountId[];
  scored_at: IsoTimestamp;
}

export interface ScoringFailedPayload {
  icp_id: string;
  reason: string;
  failed_check: string;
  account_ids_attempted: AccountId[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 05 TAL Manager
// ─────────────────────────────────────────────────────────────────────────────

export interface TalFinalizedPayload {
  tal_id: string;
  version: number;
  version_number: number;
  account_count: number;
  tier1_count: number;
  tier2_count: number;
  tier3_count: number;
  status: string;
  review_status: 'reviewed' | 'unreviewed';
  suppressed_count: number;
  finalized_at: IsoTimestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// 06 Contact Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface ContactsMappedPayload {
  account_id: AccountId;
  tier: Tier;
  contact_ids: ContactId[];
  dm_contact_ids: ContactId[];
  champion_contact_ids: ContactId[];
  influencer_contact_ids: ContactId[];
  contacts_found: number;
  verified_email_count: number;
  stakeholder_map: Json;
}

export interface ContactsSourcingFailedPayload {
  account_id: AccountId;
  tier: Tier;
  reason: string;
  failed_check: string;
  contacts_found: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 07 Signal Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalReceivedPayload {
  account_id: AccountId;
  contact_id: ContactId | null;
  signal_type: string;
  signal_source: string;
  points_awarded: number;
  decay_rate_per_week: number;
  page_url: string | null;
  metadata: Json;
  dedup_key: string;
  occurred_at: IsoTimestamp;
  received_at: IsoTimestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// 08 Awareness Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountScoreUpdatedPayload {
  account_id: AccountId;
  current_score: number;
  previous_score: number;
  stage: AwarenessStage;
  score_7d_change: number;
  score_30d_change: number;
  last_signal_at: IsoTimestamp | null;
  last_calculated_at: IsoTimestamp;
}

export interface AccountStageChangedPayload {
  account_id: AccountId;
  from_stage: AwarenessStage;
  to_stage: AwarenessStage;
  score: number;
  changed_at: IsoTimestamp;
}

export interface AccountHotPayload {
  account_id: AccountId;
  current_score: number;
  score_change: number;
  window_hours: number;
  stage: AwarenessStage;
  dominant_signal_type: string;
  top_recent_signals: Json[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 09 Demand Gen Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayFiredPayload {
  play_id: string;
  account_id: AccountId;
  contact_id: ContactId | null;
  play_type: string;
  tier: Tier;
  stage: AwarenessStage;
  trigger_type: string;
  trigger_signal_id: string | null;
  execution_method: string;
  crm_task_id: string | null;
  slack_message_ts: string | null;
  assigned_to: string | null;
  status: string;
  fired_at: IsoTimestamp;
}

export interface PlayOutcomeRecordedPayload {
  play_id: string;
  account_id: AccountId;
  outcome: string;
  notes: string | null;
  recorded_at: IsoTimestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10 CRM Sync Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface CrmSyncedPayload {
  sync_job_id: string;
  sync_type: string;
  records_total: number;
  records_synced: number;
  errors: number;
  record_type: string;
  status: string;
}

export interface CrmDealClosedWonPayload {
  deal_id: string;
  crm_type: CrmType;
  account_id: AccountId | null;
  domain: string;
  amount: number | null;
  stage: string;
  closed_at: IsoTimestamp;
  owner_id: string | null;
}

export interface CrmDealClosedLostPayload {
  deal_id: string;
  crm_type: CrmType;
  account_id: AccountId | null;
  domain: string;
  amount: number | null;
  stage: string;
  lost_reason: string | null;
  closed_at: IsoTimestamp;
  owner_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11 GTM Flywheel
// ─────────────────────────────────────────────────────────────────────────────

export interface FlywheelMetricsUpdatedPayload {
  pipeline_by_tier: Json;
  win_rate_by_tier: Json;
  avg_deal_size_by_tier: Json;
  days_to_close_by_tier: Json;
  snapshot_date: string; // YYYY-MM-DD
  metric_keys_changed: string[];
}

export interface IcpRefreshRecommendedPayload {
  closed_won_count: number;
  trigger_deal_id: string;
  new_closed_won_deal_ids: string[];
  account_attributes: Json;
  recommended_changes_summary: string;
}

export interface FlywheelErrorPayload {
  failed_check: string;
  deal_id: string | null;
  reason: string;
  stage: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The master event map — name → payload. This is the contract.
// ─────────────────────────────────────────────────────────────────────────────

export interface EventPayloads {
  // 01 ICP
  'icp.created': IcpCreatedPayload;
  'icp.updated': IcpUpdatedPayload;
  'icp.error': IcpErrorPayload;
  // 02 TAM
  'tam.search_completed': TamSearchCompletedPayload;
  'tam.search_failed': TamSearchFailedPayload;
  // 03 Enrichment
  'accounts.enriched': AccountsEnrichedPayload;
  'enrichment.failed': EnrichmentFailedPayload;
  // 04 Scoring
  'accounts.scored': AccountsScoredPayload;
  'scoring.failed': ScoringFailedPayload;
  // 05 TAL
  'tal.finalized': TalFinalizedPayload;
  // 06 Contact
  'contacts.mapped': ContactsMappedPayload;
  'contacts.sourcing_failed': ContactsSourcingFailedPayload;
  // 07 Signal
  'signal.received': SignalReceivedPayload;
  // 08 Awareness
  'account.score_updated': AccountScoreUpdatedPayload;
  'account.stage_changed': AccountStageChangedPayload;
  'account.hot': AccountHotPayload;
  // 09 Orchestrator
  'play.fired': PlayFiredPayload;
  'play.outcome_recorded': PlayOutcomeRecordedPayload;
  // 10 CRM Sync
  'crm.synced': CrmSyncedPayload;
  'crm.deal_closed_won': CrmDealClosedWonPayload;
  'crm.deal_closed_lost': CrmDealClosedLostPayload;
  // 11 Flywheel
  'flywheel.metrics_updated': FlywheelMetricsUpdatedPayload;
  'icp.refresh_recommended': IcpRefreshRecommendedPayload;
  'flywheel.error': FlywheelErrorPayload;
}

export type EventName = keyof EventPayloads;

/** A fully-typed event for a given name. */
export type AbmEvent<T extends EventName = EventName> = EventEnvelope<T>;
