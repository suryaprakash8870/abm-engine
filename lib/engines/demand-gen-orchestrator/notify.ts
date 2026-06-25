/**
 * Orchestrator alert delivery (Engine 09).
 *
 * After a play fires and is published, send a human-facing alert to the
 * workspace's delivery channel (Telegram for the MVP). Best-effort and fired
 * post-commit — it must never throw or block the play. Reads the account name
 * for a readable message (cross-engine read of tal_accounts, ADR-013).
 */

import { prisma } from '../../db/client';
import { sendTelegramAlert } from '../../clients/telegram';
import type { PlayFiredPayload } from '../../events';

const TIER_LABEL: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

/** Format + send a play-fired alert. Never throws. */
export async function notifyPlayFired(workspaceId: string, payload: PlayFiredPayload): Promise<void> {
  try {
    const acct = await prisma.talAccount.findFirst({
      where: { workspaceId, accountId: payload.account_id },
      select: { name: true, domain: true },
    });
    const who = acct?.name ?? acct?.domain ?? payload.account_id;
    const tier = payload.tier ? `${TIER_LABEL[payload.tier] ?? `Tier ${payload.tier}`} · ` : '';
    const play = payload.play_type.replace(/_/g, ' ');
    const text =
      `🔥 <b>Play fired</b>\n` +
      `${tier}<b>${escapeHtml(String(who))}</b>\n` +
      `Play: ${escapeHtml(play)}\n` +
      `Trigger: ${escapeHtml(payload.trigger_type)} · Stage: ${escapeHtml(payload.stage ?? '—')}`;
    await sendTelegramAlert(workspaceId, text);
  } catch {
    /* alerting is best-effort */
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
