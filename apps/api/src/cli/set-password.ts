/**
 * Emergency password definition from the server shell (e.g. the platform admin forgot it):
 *   docker compose -p tenace -f <release>/infra/compose/compose.prod.yaml --env-file /opt/tenace/.env \
 *     exec -e NEW_PASSWORD='…' api node dist/cli/set-password.js pessoa@exemplo.com [--admin]
 * The password comes from NEW_PASSWORD (never argv, which shows up in `ps`).
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword, passwordProblem } from '../modules/auth/password';

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  const password = process.env.NEW_PASSWORD ?? '';
  const makeAdmin = process.argv.includes('--admin');
  if (!email) throw new Error('uso: NEW_PASSWORD=… node dist/cli/set-password.js <email> [--admin]');
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`usuário não encontrado: ${email}`);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), authVersion: { increment: 1 }, active: true, ...(makeAdmin ? { role: 'platform_admin' } : {}) },
    });
    await prisma.auditLog.create({ data: { action: 'set_password_cli', entity: 'user', entityId: user.id, meta: { admin: makeAdmin } } });
    console.log(`✓ senha definida para ${email}${makeAdmin ? ' (agora platform_admin)' : ''}; sessões anteriores encerradas.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`ERRO: ${(e as Error).message}`);
  process.exit(1);
});
