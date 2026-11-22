import { Controller, Get, HttpException, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EnvService } from './common/env.service';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { InfraModule } from './common/infra.module';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';
import { Public } from './modules/auth/auth.guard';
import { BillingModule } from './modules/billing/billing.module';
import { AllowBlocked } from './modules/billing/billing.guard';
import { AuthModule } from './modules/auth/auth.module';
import { AdminController, PlatformAdminGuard } from './modules/admin/admin.controller';
import { DomainModule } from './modules/domain/domain.module';
import { WebhooksController } from './modules/integrations/webhooks.controller';
import { MailService } from './common/mail.service';

@Controller()
@AllowBlocked()
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly envs: EnvService,
    private readonly mail: MailService,
  ) {}

  @Get('health')
  health() {
    return { ok: true, build: this.envs.env.BUILD_SHA || 'dev' };
  }

  /** What the public screens can offer (e.g. "forgot password" needs an e-mail provider). */
  @Get('auth/capabilities')
  async capabilities() {
    return { passwordResetByEmail: await this.mail.enabled() };
  }

  @Get('ready')
  async ready() {
    const [db, redis] = await Promise.all([this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false), this.redis.ping()]);
    if (!db || !redis) throw new HttpException({ ok: false, db, redis, code: 'service_unavailable' }, 503);
    return { ok: true, db, redis };
  }
}

@Module({
  imports: [InfraModule, AuthModule, BillingModule, DomainModule],
  controllers: [HealthController, AdminController, WebhooksController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }, PlatformAdminGuard],
})
export class AppModule {}
