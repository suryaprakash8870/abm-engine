# Schema — table ownership map

> Every table, grouped by the engine that owns it. **No engine queries another engine's tables**
> ([ADR-010](decisions.md)). Each engine models its tables in its own multi-file Prisma schema:
> `prisma/schema/<engine-slug>.prisma`. The foundation tables live in `prisma/schema/schema.prisma`.
>
> Rules: every table has `workspace_id` + a Supabase RLS policy — **except** the shared
> `enrichment_cache`, which is public company data, written only by Engine 03 and read by others.

## Foundation (`prisma/schema/schema.prisma`)

| Table | Key columns |
|---|---|
| `workspaces` | id, name, created_at |
| `users` | id, email, full_name, created_at |
| `workspace_members` | id, workspace_id, user_id, role(owner/admin/member) |

## 01 ICP Engine

| Table | Key columns |
|---|---|
| `icp_definitions` | id, workspace_id, version, mode, firmographics(JSONB), technographics(JSONB), signals(JSONB), exclusions(JSONB), confidence_score, created_at |
| `icp_versions` | id, icp_id, version_number, snapshot(JSONB), created_at |
| `wizard_sessions` | id, workspace_id, answers(JSONB), completed_at |
| `crm_analysis_jobs` | id, workspace_id, crm_type, status, deal_count, result(JSONB) |
| `icp_confidence_history` | id, icp_id, confidence_score, recorded_at |

## 02 TAM Builder

| Table | Key columns |
|---|---|
| `tam_build_jobs` | id, workspace_id, icp_id, status, total_found, processed, started_at, completed_at |
| `apollo_search_results` | id, job_id, raw_response(JSONB), page_number |
| `raw_account_list` | id, workspace_id, job_id, domain, name, apollo_id, source, created_at · UNIQUE(workspace_id, domain) |
| `search_params_log` | id, job_id, params(JSONB), result_count |

## 03 Enrichment Engine

| Table | Key columns |
|---|---|
| `enrichment_jobs` | id, workspace_id, source_job_id, status, total, enriched, failed, started_at |
| `enriched_accounts` | id, workspace_id, domain, name, industry, headcount, revenue, geography, funding_stage, tech_stack(TEXT[]), data_quality_score, enriched_at, enrichment_sources(TEXT[]) |
| `qualification_results` | id, account_id, qualified, confidence, reason, disqualifying_factors(TEXT[]) |
| `prompt_versions` | id, prompt_key, version, content, accuracy_score, created_at |
| `enrichment_cache` ⚠️ **shared, no workspace_id** | domain(PK), firmographics(JSONB, 30d TTL), technographics(JSONB, 90d TTL), enriched_at, firmographic_expires_at, technographic_expires_at |

## 04 Scoring Engine

| Table | Key columns |
|---|---|
| `scoring_formulas` | id, workspace_id, icp_id, version, criteria(JSONB), tier_boundaries(JSONB), created_by, created_at |
| `scoring_formula_versions` | id, formula_id, version_number, snapshot(JSONB) |
| `account_scores` | id, account_id, formula_version, total_score, tier, criterion_scores(JSONB), scored_at |
| `score_history` | id, account_id, score, tier, recorded_at |
| `tier_overrides` | id, account_id, tier, reason, overridden_by, overridden_at |

## 05 TAL Manager

| Table | Key columns |
|---|---|
| `target_account_lists` | id, workspace_id, name, version, account_count, status, created_at |
| `tal_accounts` | id, tal_id, account_id, tier, added_at |
| `tal_versions` | id, tal_id, version_number, snapshot(JSONB), created_at |
| `suppression_list` | id, workspace_id, domain, reason, suppressed_until, created_at |
| `crm_audience_sync_log` | id, tal_id, platform, status, synced_at |

## 06 Contact Engine

| Table | Key columns |
|---|---|
| `contacts` | id, workspace_id, account_id, crm_contact_id, full_name, title, seniority, department, linkedin_url, email, email_status, stakeholder_role, role_confidence, engagement_score, sourced_at |
| `stakeholder_maps` | id, account_id, dm_contact_ids(TEXT[]), champion_contact_ids(TEXT[]), influencer_contact_ids(TEXT[]) |
| `email_verification_results` | id, contact_id, status, bounce_risk, verified_at |
| `contact_crm_sync_log` | id, contact_id, status, synced_at |
| `sourcing_jobs` | id, workspace_id, account_id, status, contacts_found, started_at |

## 07 Signal Engine

| Table | Key columns |
|---|---|
| `signals` | id, workspace_id, account_id, contact_id, signal_type, signal_source, points_awarded, decay_rate_per_week, page_url, metadata(JSONB), dedup_key, occurred_at, received_at |
| `signal_sources` | id, workspace_id, source_type, config(JSONB), is_active |
| `webhook_log` | id, source, payload(JSONB), signature_valid, processed_at |
| `tracking_tokens` | id, workspace_id, token, created_at |
| `visitor_sessions` | id, workspace_id, session_id, account_id, ip_hash, first_seen, last_seen |

## 08 Awareness Engine

| Table | Key columns |
|---|---|
| `awareness_scores` | id, workspace_id, account_id(UNIQUE), current_score, stage, score_7d_change, score_30d_change, last_calculated_at, last_signal_at |
| `score_snapshots` | id, account_id, date, score, dominant_signal_type |
| `routing_rules` | id, workspace_id, name, is_active, trigger_config(JSONB), actions(TEXT[]), priority, cooldown_days, max_per_month |
| `routing_rule_evaluations` | id, rule_id, account_id, matched, fired_at |
| `stage_change_log` | id, account_id, from_stage, to_stage, score, changed_at |

## 09 Demand Gen Orchestrator

| Table | Key columns |
|---|---|
| `plays_log` | id, workspace_id, account_id, contact_id, play_type, trigger_type, trigger_signal_id, execution_method, status, crm_task_id, slack_message_ts, assigned_to, outcome, fired_at |
| `play_templates` | id, workspace_id, play_type, tier, stage, template_config(JSONB) |
| `play_outcomes` | id, play_id, outcome, notes, recorded_at |
| `suppression_rules` | id, workspace_id, rule_type, cooldown_days, max_per_month |
| `sequence_mappings` | id, workspace_id, tier, industry, role, sequence_id |
| `ai_draft_log` | id, play_id, subject_lines(TEXT[]), body, model_used, generated_at |

## 10 CRM Sync Engine

| Table | Key columns |
|---|---|
| `crm_connections` | id, workspace_id, crm_type, access_token_enc, refresh_token_enc, expires_at, portal_id, instance_url, is_active, connected_at |
| `sync_jobs` | id, workspace_id, sync_type, status, records_total, records_synced, errors |
| `sync_log` | id, workspace_id, record_type, record_id, operation, outcome, api_response(JSONB), synced_at |
| `field_mappings` | id, workspace_id, crm_type, abm_field, crm_field |
| `webhook_subscriptions` | id, workspace_id, crm_type, event_type, subscription_id |

## 11 GTM Flywheel

| Table | Key columns |
|---|---|
| `pipeline_snapshots` | id, workspace_id, date, pipeline_by_tier(JSONB), win_rate_by_tier(JSONB), avg_deal_size_by_tier(JSONB) |
| `attribution_events` | id, workspace_id, account_id, deal_id, touch_type, signal_id, occurred_before_pipeline, recorded_at |
| `win_loss_analysis` | id, workspace_id, deal_id, outcome, account_attributes(JSONB), analyzed_at |
| `flywheel_metrics` | id, workspace_id, metric_key, value, period, calculated_at |
| `signal_correlation_data` | id, workspace_id, signal_combination(TEXT[]), correlation_score, sample_size, calculated_at |

---

### Cross-engine identifiers

Engines refer to accounts/contacts by **id only**, across event payloads — never by joining another
engine's tables. The canonical account identity originates in Engine 02's `raw_account_list` and is
carried forward in every event's payload (`account_id`). If your engine needs an account's industry or
score, it listens to `accounts.enriched` / `accounts.scored` and stores what it needs locally.
