import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from './session';

describe('session token', () => {
  const s = { userId: 'u1', workspaceId: 'w1', email: 'a@b.com' };

  it('round-trips a valid session', () => {
    expect(verifySession(signSession(s))).toEqual(s);
  });

  it('rejects a tampered signature', () => {
    const [body] = signSession(s).split('.');
    expect(verifySession(`${body}.deadbeef`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySession('garbage')).toBeNull();
    expect(verifySession('')).toBeNull();
  });
});
