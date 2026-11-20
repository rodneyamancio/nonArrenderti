import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { addDays, localDate, normalizeGoal, weekStartOf } from '@tenace/rules';
import { AppModule } from './app.module';
import { loadEnv } from './config/env.schema';
import { PrismaService } from './common/prisma.service';
import { toDbDate } from './common/request';
import { hashPassword } from './modules/auth/password';
import { WeeksService } from './modules/domain/weeks.service';

/**
 * Idempotent seed: platform admin (SEED_ADMIN_*) and, outside production,
 * a demo group (SEED_DEMO_DATA=true) so the app is not empty on first run.
 */
async function main() {
  process.env.SCHEDULER = 'off';
  const env = loadEnv();
  const log = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const weeks = app.get(WeeksService);

  if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
    const email = env.SEED_ADMIN_EMAIL.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (!exists) {
      await prisma.user.create({ data: { email, name: 'Admin Tenace', role: 'platform_admin', passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD), avatarColor: 'ink' } });
      log.log(`platform admin criado: ${email}`);
    }
  }

  if (env.SEED_DEMO_DATA && env.NODE_ENV !== 'production' && !(await prisma.group.findFirst({ where: { name: 'Clube do Foco' } }))) {
    const password = await hashPassword(env.SEED_ADMIN_PASSWORD || 'tenace123');
    const people = [
      { email: 'ana@demo.tenace', name: 'Ana Souza', avatarColor: 'rose' },
      { email: 'bruno@demo.tenace', name: 'Bruno Lima', avatarColor: 'sky' },
      { email: 'carla@demo.tenace', name: 'Carla Mendes', avatarColor: 'mint' },
    ];
    const users = [];
    for (const p of people) users.push(await prisma.user.upsert({ where: { email: p.email }, create: { ...p, passwordHash: password }, update: {} }));
    const tz = 'America/Sao_Paulo';
    const lastWeek = addDays(weekStartOf(localDate(new Date(), tz)), -7);
    const g = await prisma.group.create({
      data: {
        name: 'Clube do Foco',
        emoji: '🔥',
        color: 'violet',
        description: 'Leitura e treino toda semana. Quem falhar paga o churrasco!',
        timezone: tz,
        startsOn: toDbDate(lastWeek),
        createdAt: new Date(Date.now() - 10 * 86_400_000),
        destLabel: 'Caixinha do churrasco',
        destHolderName: 'Ana Souza',
        destPixKeyType: 'email',
        destPixKey: 'ana@demo.tenace',
        destCity: 'Sao Paulo',
        createdById: users[0]!.id,
      },
    });
    const members: { id: string }[] = [];
    for (const [i, u] of users.entries()) members.push(await prisma.member.create({ data: { groupId: g.id, userId: u.id, role: i === 0 ? 'owner' : i === 1 ? 'admin' : 'member', startsOnWeek: toDbDate(lastWeek) } }));
    const goals = [
      normalizeGoal({ name: 'Academia', emoji: '🏋️', period: 'weekly' as const, target: 3, unit: 'times', stakeCents: 500, activeWeekdays: [] }),
      normalizeGoal({ name: 'Leitura', emoji: '📚', period: 'daily' as const, target: 10, unit: 'páginas', stakeCents: 200, activeWeekdays: [1, 2, 3, 4, 5] }),
    ];
    const created: { id: string }[] = [];
    for (const goal of goals) created.push(await prisma.goal.create({ data: { ...goal, groupId: g.id, createdAt: new Date(Date.now() - 10 * 86_400_000) } }));

    // Last week: open, add check-ins, close (so the fund has history).
    const w1 = await weeks.openWeek(g.id, lastWeek);
    const add = async (memberIdx: number, goalIdx: number, day: number, qty: number, weekId: string, note = '') => {
      const week = await prisma.week.findUniqueOrThrow({ where: { id: weekId } });
      const date = new Date(week.weekStart.getTime() + day * 86_400_000);
      await prisma.$transaction(async (tx) => {
        const c = await tx.checkIn.create({ data: { groupId: g.id, memberId: members[memberIdx]!.id, goalId: created[goalIdx]!.id, date, quantity: qty, note } });
        await weeks.attachCheckIn(tx, c.id, weekId);
      });
    };
    for (const d of [0, 2, 4]) await add(0, 0, d, 1, w1);
    for (const d of [0, 1, 2, 3, 4]) await add(0, 1, d, 12, w1);
    for (const d of [1, 3]) await add(1, 0, d, 1, w1);
    for (const d of [0, 1, 2]) await add(1, 1, d, 10, w1);
    for (const d of [0, 2, 5]) await add(2, 0, d, 1, w1);
    for (const d of [0, 1, 2, 3, 4]) await add(2, 1, d, 15, w1);
    await weeks.closeWeek(w1);

    // Current week: partial progress.
    const w2 = await weeks.ensureCurrentWeek(g);
    if (w2) {
      const todayIdx = Math.max(0, Math.min(4, (new Date().getDay() + 6) % 7));
      await add(0, 0, 0, 1, w2, 'Treino de perna 🦵');
      await add(0, 1, 0, 14, w2, 'Hábitos Atômicos, cap. 3');
      await add(1, 1, 0, 10, w2);
      await add(2, 0, 0, 1, w2);
      if (todayIdx >= 1) await add(2, 1, 1, 20, w2, 'Terminei o livro! 🎉');
    }
    for (const m of members) await prisma.feedEvent.create({ data: { groupId: g.id, type: 'member_joined', text: `${users[members.indexOf(m)]!.name} entrou no grupo 👋`, actorMemberId: m.id, createdAt: new Date(Date.now() - 9 * 86_400_000) } });
    log.log(`grupo de demonstração criado (logins: ${people.map((p) => p.email).join(', ')} — senha = SEED_ADMIN_PASSWORD)`);
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
