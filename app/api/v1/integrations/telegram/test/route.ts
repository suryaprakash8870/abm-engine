/**
 * POST /api/v1/integrations/telegram/test — send a test Telegram alert.
 * Confirms the workspace's bot token + chat id (BYO key or env) actually deliver.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { sendTelegramAlert, telegramConfigured } from '@/lib/clients/telegram';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    if (!(await telegramConfigured(workspaceId))) {
      return fail('VALIDATION_ERROR', 'No Telegram bot configured. Add a key (botToken;chatId) or set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.');
    }
    const res = await sendTelegramAlert(workspaceId, '✅ <b>ABM Engine</b> — test alert. Your Telegram channel is connected.');
    if (!res.sent) return fail('VALIDATION_ERROR', `Telegram did not accept the message: ${res.reason ?? 'unknown'}`);
    return ok({ sent: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
