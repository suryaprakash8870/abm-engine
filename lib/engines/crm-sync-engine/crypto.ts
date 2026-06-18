/**
 * AES-256-GCM at-rest encryption for CRM OAuth tokens (engine 10).
 *
 * Tokens are NEVER stored in plaintext (doc step 4). The 32-byte key is derived
 * from ENCRYPTION_KEY via scrypt. Blob format: base64(iv).base64(tag).base64(ct).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const RAW_KEY = process.env.ENCRYPTION_KEY;
// Fail closed in production — never silently fall back to a weak dev key for
// real CRM tokens. Dev/test may use the constant.
if (!RAW_KEY && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_KEY must be set in production — CRM OAuth tokens are encrypted with it.');
}
const KEY = scryptSync(RAW_KEY ?? 'dev-insecure-encryption-key-change-me', 'abm-crm-sync-salt', 32);

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptToken(blob: string): string {
  const [ivB, tagB, ctB] = blob.split('.');
  if (!ivB || !tagB || !ctB) throw new Error('malformed encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
}
