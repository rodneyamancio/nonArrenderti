import { Injectable } from '@nestjs/common';
import type { SessionUser } from '@tenace/types';
import type { User } from '@prisma/client';
import { randomToken, sha256 } from '../../common/crypto';
import { EnvService } from '../../common/env.service';
import { DomainBadRequest, DomainConflict, DomainUnauthorized } from '../../common/errors/domain-exceptions';
import { MailService } from '../../common/mail.service';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from './password';

const TOUCH_EVERY_MS = 5 * 60 * 1000;
const AVATAR_COLORS = ['violet', 'spark', 'mint', 'sky', 'rose', 'sun'];

export interface LoginResult {
  token: string;
  maxAgeMs: number;
  user: SessionUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly envs: EnvService,
    private readonly mail: MailService,
  ) {}

  get cookieName(): string {
    // __Host- prefix: Secure, Path=/, no Domain.
    return this.envs.isProd ? '__Host-tenace_session' : 'tenace_session';
  }

  async signup(input: { name: string; email: string; password: string }, ip: string, userAgent: string | undefined, client: string): Promise<LoginResult> {
    await this.redis.hit({ key: `signup:ip:${ip}`, limit: 10, windowSec: 3600, onFailure: 'closed' });
    const email = input.email.trim().toLowerCase();
    const problem = passwordProblem(input.password);
    if (problem) throw new DomainBadRequest('validation_error', problem);
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new DomainConflict('email_taken', 'Já existe uma conta com este e-mail');
    const user = await this.prisma.user.create({
      data: { email, name: input.name.trim(), passwordHash: await hashPassword(input.password), avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]! },
    });
    return this.createSession(user, ip, userAgent, client);
  }

  async login(emailRaw: string, password: string, ip: string, userAgent: string | undefined, client: string): Promise<LoginResult> {
    const email = emailRaw.trim().toLowerCase();
    await this.redis.hit({ key: `login:ip:${ip}`, limit: 30, windowSec: 900, onFailure: 'closed' });
    await this.redis.hit({ key: `login:email:${sha256(email)}`, limit: 8, windowSec: 900, onFailure: 'closed' });
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(await dummyHash(), password), false);
    if (!user || !ok || !user.active) throw new DomainUnauthorized('invalid_credentials', 'E-mail ou senha incorretos');
    await this.redis.reset(`login:email:${sha256(email)}`);
    return this.createSession(user, ip, userAgent, client);
  }

  async createSession(user: User, ip: string, userAgent: string | undefined, client: string): Promise<LoginResult> {
    const token = randomToken(32);
    const now = Date.now();
    const maxAgeMs = this.envs.env.SESSION_TTL_HOURS * 3600_000;
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: { tokenHash: sha256(token), userId: user.id, authVersion: user.authVersion, client, ip, userAgent: userAgent?.slice(0, 300), expiresAt: new Date(now + maxAgeMs) },
      }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(now) } }),
    ]);
    return { token, maxAgeMs, user: toSessionUser(user) };
  }

  async resolve(token: string | undefined): Promise<{ user: SessionUser; sessionId: string } | null> {
    if (!token || token.length > 100) return null;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session || session.revokedAt) return null;
    const now = Date.now();
    const idleLimit = session.lastSeenAt.getTime() + this.envs.env.SESSION_IDLE_HOURS * 3600_000;
    if (session.expiresAt.getTime() < now || idleLimit < now) return null;
    if (!session.user.active || session.user.authVersion !== session.authVersion) return null;
    if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } }).catch(() => undefined);
    }
    return { user: toSessionUser(session.user), sessionId: session.id };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Always answers the same way, so it does not reveal which e-mails have accounts. */
  async requestReset(emailRaw: string, ip: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase();
    await this.redis.hit({ key: `reset:ip:${ip}`, limit: 10, windowSec: 3600, onFailure: 'closed' });
    await this.redis.hit({ key: `reset:email:${sha256(email)}`, limit: 3, windowSec: 3600, onFailure: 'closed' });
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) return;
    const token = randomToken(32);
    await this.prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } });
    const url = `${this.envs.env.APP_WEB_URL}/redefinir-senha?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'Redefinir sua senha do Tenace',
      text: `Olá, ${user.name}! Para criar uma nova senha, abra: ${url}\nO link vale por 1 hora. Se não foi você, ignore este e-mail.`,
      html: this.mail.html('Redefinir senha', `Olá, ${escapeHtml(user.name)}! Recebemos um pedido para trocar sua senha. O link vale por 1 hora.`, { label: 'Criar nova senha', url }),
    });
  }

  async confirmReset(token: string, password: string): Promise<void> {
    const problem = passwordProblem(password);
    if (problem) throw new DomainBadRequest('validation_error', problem);
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) throw new DomainBadRequest('token_invalid', 'Link inválido ou expirado. Peça um novo.');
    // Single use + bumping authVersion ends every existing session.
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(password), authVersion: { increment: 1 } } }),
    ]);
  }
}

export function toSessionUser(u: Pick<User, 'id' | 'email' | 'name' | 'role' | 'avatarColor'>): SessionUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, avatarColor: u.avatarColor };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
