/**
 * Gives someone platform-admin access from the server shell and prints a single-use link
 * (24 h) for them to define their own password — no password ever travels in chat or argv.
 * Creates the account when it does not exist yet.
 *   docker compose -p tenace -f <release>/infra/compose/compose.prod.yaml --env-file /opt/tenace/.env \
 *     exec api node dist/cli/grant-admin.js pessoa@exemplo.com "Nome da Pessoa"
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { randomToken, sha256 } from '../common/crypto';
import { hashPassword } from '../modules/auth/password';

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  const name = (process.argv[3] ?? '').trim() || email.split('@')[0] || 'Admin';
  const webUrl = (process.env.APP_WEB_URL ?? '').replace(/\/+$/, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('uso: node dist/cli/grant-admin.js <email> ["Nome"]');
  if (!webUrl) throw new Error('APP_WEB_URL não definido');
  const prisma = new PrismaClient();
  try {
    let user = await prisma.user.findUnique({ where: { email } });
    const created = !user;
    if (!user) {
      // Random, never shown: the person defines the real password through the link.
      user = await prisma.user.create({ data: { email, name, role: 'platform_admin', avatarColor: 'violet', passwordHash: await hashPassword(randomBytes(32).toString('base64url')) } });
    } else {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: 'platform_admin', active: true } });
    }
    const token = randomToken(32);
    await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * 3600_000) } });
    await prisma.auditLog.create({ data: { action: 'grant_admin_cli', entity: 'user', entityId: user.id, meta: { created } } });
    console.log(`✓ ${email} ${created ? 'criado como' : 'promovido a'} platform_admin.`);
    console.log(`Link para definir a senha (uso único, 24 h): ${webUrl}/redefinir-senha?token=${token}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`ERRO: ${(e as Error).message}`);
  process.exit(1);
});
