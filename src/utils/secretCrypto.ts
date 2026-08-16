import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { ConfigurationError } from '../errors/errors';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc.v1';
const KEY_SALT = 'playwright-bdd-framework-secrets';

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, KEY_SALT, 32);
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

export function encryptSecret(plainText: string, secret: string): string {
  if (!plainText) {
    throw new ConfigurationError('Cannot encrypt an empty secret', { action: 'encryptSecret' });
  }
  if (!secret) {
    throw new ConfigurationError('APP_ENCRYPTION_KEY is required to encrypt secrets', { action: 'encryptSecret' });
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, secret: string): string {
  if (!isEncryptedSecret(payload)) {
    return payload;
  }
  if (!secret) {
    throw new ConfigurationError('APP_ENCRYPTION_KEY is required to decrypt APP_PASSWORD', {
      action: 'decryptSecret',
    });
  }

  const parts = payload.split('.');
  if (parts.length !== 5) {
    throw new ConfigurationError('Encrypted secret format is invalid', { action: 'decryptSecret' });
  }

  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const data = Buffer.from(parts[4], 'base64url');
  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
