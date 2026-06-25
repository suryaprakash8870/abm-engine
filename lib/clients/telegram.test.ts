/**
 * Telegram alert client test (Engine 09 delivery).
 * Mocks prisma (no BYO key) + global fetch; covers the not-configured no-op,
 * env-based config, and a successful send.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db/client', () => ({
  prisma: { $queryRaw: async () => [] as { key_enc: string }[] },
}));

import { sendTelegramAlert, telegramConfigured } from './telegram';

const ENV = { ...process.env };

describe('telegram client', () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env = { ...ENV }; });

  it('is a no-op when nothing is configured', async () => {
    const res = await sendTelegramAlert('ws_1', 'hi');
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('not configured');
    expect(await telegramConfigured('ws_1')).toBe(false);
  });

  it('sends via the bot API when env config is present', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchMock);

    expect(await telegramConfigured('ws_1')).toBe(true);
    const res = await sendTelegramAlert('ws_1', 'hello');
    expect(res.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/bot123:ABC/sendMessage');
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: '999', text: 'hello' });
  });

  it('reports a delivery failure without throwing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 }) as Response));
    const res = await sendTelegramAlert('ws_1', 'hello');
    expect(res.sent).toBe(false);
    expect(res.reason).toContain('401');
  });
});
