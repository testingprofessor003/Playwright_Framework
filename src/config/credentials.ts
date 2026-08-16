import fs from 'fs';
import path from 'path';
import { env } from './env';
import { ConfigurationError } from '../errors/errors';
import {
  decryptSecret,
  encryptSecret,
  generateEncryptionKey,
  isEncryptedSecret,
} from '../utils/secretCrypto';
import { logger } from '../logger/logger';

const ENV_FILE = path.resolve(process.cwd(), '.env');

function upsertEnv(key: string, value: string): void {
  let contents = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) {
    contents = contents.replace(pattern, line);
  } else {
    contents = `${contents.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(ENV_FILE, contents, 'utf8');
}

function persistEncryptedPassword(plainText: string): string {
  let key = env.appEncryptionKey;
  if (!key) {
    key = generateEncryptionKey();
    env.appEncryptionKey = key;
    upsertEnv('APP_ENCRYPTION_KEY', key);
    logger.info('Generated APP_ENCRYPTION_KEY and saved it to .env');
  }

  const encrypted = encryptSecret(plainText, key);
  env.appPassword = encrypted;
  upsertEnv('APP_PASSWORD', encrypted);
  logger.info('APP_PASSWORD was stored in encrypted form in .env');
  return plainText;
}

export function getAppUsername(): string {
  return env.appUsername;
}

export function getAppPassword(): string {
  const stored = env.appPassword;
  if (!stored) {
    throw new ConfigurationError('APP_PASSWORD is missing in .env', { action: 'getAppPassword' });
  }

  if (isEncryptedSecret(stored)) {
    logger.info('Decrypting APP_PASSWORD from .env for login');
    return decryptSecret(stored, env.appEncryptionKey);
  }

  return persistEncryptedPassword(stored);
}

export function requireAppCredentials(): { email: string; password: string } {
  const email = getAppUsername();
  if (!email) {
    throw new ConfigurationError('APP_USERNAME is missing in .env', { action: 'requireAppCredentials' });
  }
  return { email, password: getAppPassword() };
}
