/**
 * BullMQ queue names. Centralized so producers and workers can't drift.
 *
 * Hard rule #2: enrichment + scoring + signal ingest never run inside a web
 * request. The controller enqueues; the worker processes.
 */
export const QUEUES = {
  ENRICHMENT: 'enrichment',
  SCORING: 'scoring',
  SIGNAL_INGEST: 'signal-ingest',
  ORCHESTRATOR: 'orchestrator',
  CRM_SYNC: 'crm-sync',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
