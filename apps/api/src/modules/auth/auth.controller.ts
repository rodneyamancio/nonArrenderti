import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BRAND_COLORS } from '@tenace/types';
import { z } from 'zod';
import { EnvService } from '../../common/env.service';
import { DomainBadRequest, DomainForbidden, DomainUnauthorized } from '../../common/errors/domain-exceptions';
import { PrismaService } from '../../common/prisma.service';
import type { AuthedRequest } from '../../common/request';
import { parseBody } from '../../common/validation';
import { CSRF_HEADER, CSRF_VALUE, Public } from './auth.guard';
import { AuthService, toSessionUser, type LoginResult } from './auth.service';
import { hashPassword, passwordProblem, verifyPassword } from './password';

const client = z.enum(['web', 'mobile']).default('web');
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200), client });
const signupSchema = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().email().max(254), password: z.string().min(1).max(200), client });
const passwordSchema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });
const profileSchema = z.object({ name: z.string().trim().min(2).max(60).optional(), avatarColor: z.enum(BRAND_COLORS).optional() });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly envs: EnvService,
    private readonly prisma: PrismaService,
  ) {}

  /** Public endpoints skip the guard, so they enforce the CSRF header themselves (login CSRF). */
  private csrf(req: AuthedRequest, isMobile: boolean) {
    if (!isMobile && req.headers[CSRF_HEADER] !== CSRF_VALUE) throw new DomainForbidden('csrf_rejected', 'Requisição recusada');
  }

  private respond(res: Response, result: LoginResult, mobile: boolean) {
    if (mobile) return { user: result.user, token: result.token };
    res.cookie(this.auth.cookieName, result.token, { httpOnly: true, secure: this.envs.isProd, sameSite: 'lax', path: '/', maxAge: result.maxAgeMs });
    return { user: result.user };
  }

  @Public()
  @Post('signup')
  async signup(@Req() req: AuthedRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(signupSchema, body);
    this.csrf(req, input.client === 'mobile');
    const result = await this.auth.signup(input, req.ip ?? 'unknown', req.headers['user-agent'], input.client);
    return this.respond(res, result, input.client === 'mobile');
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Req() req: AuthedRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(loginSchema, body);
    this.csrf(req, input.client === 'mobile');
    const result = await this.auth.login(input.email, input.password, req.ip ?? 'unknown', req.headers['user-agent'], input.client);
    return this.respond(res, result, input.client === 'mobile');
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.sessionId) await this.auth.logout(req.sessionId);
    res.clearCookie(this.auth.cookieName, { path: '/', httpOnly: true, secure: this.envs.isProd, sameSite: 'lax' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return { user: req.user };
  }

  @Patch('me')
  async updateMe(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = parseBody(profileSchema, body);
    const user = await this.prisma.user.update({ where: { id: req.user!.id }, data: input });
    return { user: toSessionUser(user) };
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(@Req() req: AuthedRequest, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(passwordSchema, body);
    const problem = passwordProblem(input.next);
    if (problem) throw new DomainBadRequest('validation_error', problem);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(user.passwordHash, input.current))) throw new DomainUnauthorized('invalid_credentials', 'Senha atual incorreta');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.next), authVersion: { increment: 1 } } });
    res.clearCookie(this.auth.cookieName, { path: '/' });
    return { ok: true };
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(200)
  async requestReset(@Req() req: AuthedRequest, @Body() body: unknown) {
    this.csrf(req, false);
    const { email } = parseBody(z.object({ email: z.string().trim().email().max(254) }), body);
    await this.auth.requestReset(email, req.ip ?? 'unknown');
    return { ok: true };
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(200)
  async confirmReset(@Req() req: AuthedRequest, @Body() body: unknown) {
    this.csrf(req, false);
    const { token, password } = parseBody(z.object({ token: z.string().min(10).max(100), password: z.string().min(1).max(200) }), body);
    await this.auth.confirmReset(token, password);
    return { ok: true };
  }
}
