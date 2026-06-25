/**
 * Telegram alert client — delivery channel for the Orchestrator (Engine 09).
 *
 * Sends a bot message when a play fires (hot account, demo request, new lead).
 * Config resolves per workspace:
 *   1. integration_keys provider='telegram', stored as "<botToken>;<chatId>"
 *      (encrypted, BYO via the Integrations hub), else
 *   2. env TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (workspace-wide default).
 * No config → no-op (returns {sent:false}). Never throws — alerting is
 * best-effort and must never break the play that triggered it.
 */

import { prisma } from '../db/client';
import { decryptToken } from '../engines/crm-sync-engine/crypto';

interface TelegramConfig {
  token: string;
  chatId: string;
}

async function resolveConfig(workspaceId: string): Promise<TelegramConfig | null> {
  // 1) Per-workspace BYO key (format "botToken;chatId").
  try {
    const rows = await prisma.$queryRaw<{ key_enc: string }[]>`
      SELECT key_enc FROM integration_keys WHERE workspace_id = ${workspaceId} AND provider = 'telegram' LIMIT 1`;
    if (rows[0]?.key_enc) {
      const [token, chatId] = decryptToken(rows[0].key_enc).split(';');
      if (token?.trim() && chatId?.trim()) return { token: token.trim(), chatId: chatId.trim() };
    }
  } catch {
    /* table missing / decrypt failure → fall through to env */
  }
  // 2) Env default.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) return { token, chatId };
  return null;
}

export async function telegramConfigured(workspaceId: string): Promise<boolean> {
  return (await resolveConfig(workspaceId)) !== null;
}

/** Send an HTML-formatted alert. Best-effort: returns a result, never throws. */
export async function sendTelegramAlert(workspaceId: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  const cfg = await resolveConfig(workspaceId);
  if (!cfg) return { sent: false, reason: 'not configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) return { sent: false, reason: `telegram ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : 'network error' };
  }
}
