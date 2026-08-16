import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  decryptSecret,
  encryptSecret,
  generateEncryptionKey,
  isEncryptedSecret,
} from '../src/utils/secretCrypto';

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

function upsertEnv(key: string, value: string): void {
  let contents = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) {
    contents = contents.replace(pattern, line);
  } else {
    contents = `${contents.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, contents, 'utf8');
}

function usage(): void {
  console.log(`Encrypt a password for .env:

  npm run secret:encrypt -- yourPlainPassword
  npm run secret:encrypt -- --migrate-env

--migrate-env reads APP_PASSWORD from .env, encrypts it, and writes it back.
Never commit APP_ENCRYPTION_KEY or APP_PASSWORD.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    usage();
    return;
  }

  let key = process.env.APP_ENCRYPTION_KEY || '';
  if (!key) {
    key = generateEncryptionKey();
    upsertEnv('APP_ENCRYPTION_KEY', key);
    console.log('Generated APP_ENCRYPTION_KEY and saved it to .env');
  }

  if (args.includes('--migrate-env')) {
    const current = process.env.APP_PASSWORD || '';
    if (!current) {
      throw new Error('APP_PASSWORD is empty in .env');
    }
    if (isEncryptedSecret(current)) {
      decryptSecret(current, key);
      console.log('APP_PASSWORD is already encrypted.');
      return;
    }
    const encrypted = encryptSecret(current, key);
    upsertEnv('APP_PASSWORD', encrypted);
    console.log('APP_PASSWORD was encrypted and updated in .env');
    return;
  }

  const plain = args.filter((arg) => arg !== '--migrate-env').join(' ');
  const encrypted = encryptSecret(plain, key);
  console.log(encrypted);
  console.log('Copy this value into APP_PASSWORD in .env');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
