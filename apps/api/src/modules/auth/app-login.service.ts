import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { AuditService } from '../../common/audit.service';
import { EnvService } from '../../common/env.service';
import { DomainBadRequest, DomainForbidden, DomainNotFound } from '../../common/errors/domain-exceptions';
import { randomToken, safeEqual, sha256 } from '../../common/crypto';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import type { AuthedRequest } from '../../common/request';
import { AuthService, type LoginResult } from './auth.service';

const TTL_MS = 3 * 60_000;
// Crockford base32 without ambiguous letters (I, L, O, U): easy to read and type.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** "abcd-efgh", "ABCDEFGH", "aBcD EfGh" → "ABCDEFGH" (O→0, I/L→1). */
export function normalizeShortCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
}

function shortCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export interface AppLoginView {
  id: string;
  status: string;
  expiresAt: string;
  choices: number[];
  deviceName: string | null;
}

/**
 * Login in the app by the portal's QR code, confirmed by a 2-digit number (vg-auth,
 * CalebePay pattern):
 * 1. Portal (signed in) creates a request → QR `tenace://entrar?c=<secret>&a=<portal>` + short code.
 * 2. App scans (public) with the SHA-256 of a random verifier that never leaves the phone; the
 *    first scan spends the QR and the app shows a 2-digit number.
 * 3. Portal asks "which number is on the phone?" (3 choices). Right → approved; wrong or
 *    "Não fui eu" → denied for good.
 * 4. App claims with the verifier → a normal mobile session. If the portal session that asked
 *    ended meanwhile, nothing is issued.
 */
@Injectable()
export class AppLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly envs: EnvService,
  ) {}

  private view(r: { id: string; status: string; expiresAt: Date; choices: number[]; deviceName: string | null }): AppLoginView {
    const expired = r.expiresAt < new Date() && ['pending', 'scanned', 'approved'].includes(r.status);
    return { id: r.id, status: expired ? 'expired' : r.status, expiresAt: r.expiresAt.toISOString(), choices: r.status === 'scanned' && !expired ? r.choices : [], deviceName: r.deviceName };
  }

  /** Portal: new QR (cancels the previous open ones of this portal session). */
  async create(req: AuthedRequest): Promise<AppLoginView & { qr: string; shortCode: string }> {
    const user = req.user!;
    await this.redis.hit({ key: `app-login:create:${user.id}`, limit: 30, windowSec: 900, onFailure: 'closed' });
    const now = new Date();
    await this.prisma.appLoginRequest.updateMany({ where: { originSessionId: req.sessionId!, status: { in: ['pending', 'scanned'] } }, data: { status: 'cancelled' } });
    await this.prisma.appLoginRequest.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } });
    const secret = randomToken(32);
    const code = shortCode();
    const r = await this.prisma.appLoginRequest.create({
      data: { userId: user.id, originSessionId: req.sessionId!, secretHash: sha256(secret), shortCodeHash: sha256(code), expiresAt: new Date(now.getTime() + TTL_MS) },
    });
    const portal = this.envs.env.APP_WEB_URL.replace(/\/+$/, '');
    return { ...this.view(r), qr: `tenace://entrar?c=${encodeURIComponent(secret)}&a=${encodeURIComponent(portal)}`, shortCode: `${code.slice(0, 4)}-${code.slice(4)}` };
  }

  /** Portal: status of its own request (polled while the dialog is open). */
  async status(req: AuthedRequest, id: string): Promise<AppLoginView> {
    const r = await this.prisma.appLoginRequest.findFirst({ where: { id, userId: req.user!.id, originSessionId: req.sessionId! } });
    if (!r) throw new DomainNotFound('not_found', 'Pedido não encontrado');
    return this.view(r);
  }

  /** Portal: the person picks the number shown on the phone. */
  async decide(req: AuthedRequest, id: string, decision: { approve: true; code: number } | { approve: false }): Promise<AppLoginView> {
    const r = await this.prisma.appLoginRequest.findFirst({ where: { id, userId: req.user!.id, originSessionId: req.sessionId! } });
    if (!r) throw new DomainNotFound('not_found', 'Pedido não encontrado');
    if (r.status !== 'scanned' || r.expiresAt < new Date()) throw new DomainBadRequest('bad_request', 'Este pedido não está mais aguardando confirmação. Gere um novo QR.');
    const ok = decision.approve && decision.code === r.matchCode;
    const updated = await this.prisma.appLoginRequest.update({ where: { id: r.id }, data: { status: ok ? 'approved' : 'denied', decidedAt: new Date() } });
    await this.audit.log(req, ok ? 'auth.app_login.approved' : 'auth.app_login.denied', 'user', req.user!.id, { requestId: r.id, reason: decision.approve ? (ok ? null : 'wrong_number') : 'not_me' });
    return this.view(updated);
  }

  /** App (public): first scan spends the QR; returns the number to show on the phone. */
  async scan(ip: string, input: { secret?: string; code?: string; verifierHash: string; deviceName?: string; platform?: string }): Promise<{ id: string; matchCode: number; expiresAt: string }> {
    await this.redis.hit({ key: `app-login:scan:${ip}`, limit: 20, windowSec: 900, onFailure: 'closed' });
    const where = input.secret ? { secretHash: sha256(input.secret) } : input.code ? { shortCodeHash: sha256(normalizeShortCode(input.code)) } : null;
    if (!where) throw new DomainBadRequest('validation_error', 'Leia o QR Code ou digite o código.');
    const r = await this.prisma.appLoginRequest.findUnique({ where });
    if (!r || r.status !== 'pending' || r.expiresAt < new Date()) throw new DomainBadRequest('token_invalid', 'Código inválido ou expirado. Gere um novo no portal.');
    const match = randomInt(10, 100);
    const others = new Set<number>([match]);
    while (others.size < 3) others.add(randomInt(10, 100));
    const choices = [...others].sort(() => randomInt(3) - 1);
    // Conditional update: two phones scanning at once → only one wins.
    const won = await this.prisma.appLoginRequest.updateMany({
      where: { id: r.id, status: 'pending' },
      data: { status: 'scanned', verifierHash: input.verifierHash, matchCode: match, choices, scannedAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS), deviceName: input.deviceName?.slice(0, 80) ?? null, devicePlatform: input.platform ?? null },
    });
    if (!won.count) throw new DomainBadRequest('token_invalid', 'Este QR já foi lido. Gere um novo no portal.');
    return { id: r.id, matchCode: match, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
  }

  /** App (public): polls with the verifier; once approved, gets a normal mobile session. */
  async claim(ip: string, userAgent: string | undefined, input: { id: string; verifier: string }): Promise<{ status: 'waiting' } | ({ status: 'ok' } & Pick<LoginResult, 'user' | 'token'>)> {
    await this.redis.hit({ key: `app-login:claim:${ip}`, limit: 240, windowSec: 900, onFailure: 'closed' });
    const r = await this.prisma.appLoginRequest.findUnique({ where: { id: input.id } });
    if (!r || !r.verifierHash || !safeEqual(sha256(input.verifier), r.verifierHash)) throw new DomainNotFound('not_found', 'Pedido não encontrado');
    if (r.status === 'denied') throw new DomainForbidden('forbidden', 'O acesso foi recusado no portal.');
    if (r.expiresAt < new Date() || ['expired', 'cancelled', 'completed'].includes(r.status)) throw new DomainBadRequest('token_invalid', 'O pedido expirou. Gere um novo QR no portal.');
    if (r.status !== 'approved') return { status: 'waiting' };
    // The portal session that asked must still be alive (logout / password change / block cancel it).
    const origin = await this.prisma.session.findUnique({ where: { id: r.originSessionId }, include: { user: true } });
    if (!origin || origin.revokedAt || origin.expiresAt < new Date() || !origin.user.active || origin.user.authVersion !== origin.authVersion) {
      await this.prisma.appLoginRequest.update({ where: { id: r.id }, data: { status: 'cancelled' } });
      throw new DomainBadRequest('token_invalid', 'A sessão do portal que gerou o QR terminou. Gere um novo.');
    }
    const done = await this.prisma.appLoginRequest.updateMany({ where: { id: r.id, status: 'approved' }, data: { status: 'completed', completedAt: new Date() } });
    if (!done.count) throw new DomainBadRequest('token_invalid', 'Este pedido já foi usado.');
    const result = await this.auth.createSession(origin.user, ip, userAgent, 'mobile');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(result.token) }, select: { id: true } });
    await this.prisma.appLoginRequest.update({ where: { id: r.id }, data: { sessionId: session?.id } });
    await this.prisma.auditLog.create({ data: { actorId: origin.userId, action: 'auth.login', entity: 'user', entityId: origin.userId, meta: { via: 'app_qr', requestId: r.id, device: r.deviceName }, ip } });
    return { status: 'ok', user: result.user, token: result.token };
  }
}
