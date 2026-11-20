#!/usr/bin/env node
// Generates .env from .env.example with fresh random secrets (vg-segredos). Never overwrites.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../../.env', import.meta.url);
if (existsSync(target)) {
  console.log('.env já existe — nada foi alterado.');
  process.exit(0);
}
const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const pg = randomBytes(18).toString('base64url');
const admin = `${randomBytes(9).toString('base64url')}A7`;
const out = example
  .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${pg}`)
  .replace(/(DATABASE_URL=postgresql:\/\/[^:]+:)__generated__@/, `$1${pg}@`)
  .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`)
  .replace(/^SEED_ADMIN_PASSWORD=.*$/m, `SEED_ADMIN_PASSWORD=${admin}`);
if (out.includes('__generated__')) throw new Error('placeholder não substituído');
writeFileSync(target, out, { mode: 0o600 });
console.log('✓ .env criado com segredos aleatórios (permissão 600).');
