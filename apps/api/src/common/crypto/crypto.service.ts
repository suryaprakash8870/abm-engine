import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for CRM tokens at rest (hard rule #6).
 *
 * Output format (base64): `iv:authTag:ciphertext`. Storing the IV alongside
 * the ciphertext is standard — IVs are not secret, just must be unique.
 *
 * Rotation: when SECRETS_ENCRYPTION_KEY rotates, a separate migration job
 * decrypts with the old key and re-encrypts with the new. Out of scope for Phase 0.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.getOrThrow<string>('SECRETS_ENCRYPTION_KEY');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'SECRETS_ENCRYPTION_KEY must be 32 bytes base64-encoded (use: openssl rand -base64 32)',
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) throw new Error('Malformed ciphertext');
    const [ivB64, tagB64, ctB64] = parts as [string, string, string];
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
