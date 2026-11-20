import { Controller, Get, HttpException, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EnvService } from './common/env.service';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { InfraModule } from './common/infra.module';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';
import { Public } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { DomainModule } from './modules/domain/domain.module';

@Controller()
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly envs: EnvService,
  ) {}

  @Get('health')
  health() {
    return { ok: true, build: this.envs.env.BUILD_SHA || 'dev' };
  }

  @Get('ready')
  async ready() {
    const [db, redis] = await Promise.all([this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false), this.redis.ping()]);
    if (!db || !redis) throw new HttpException({ ok: false, db, redis, code: 'service_unavailable' }, 503);
    return { ok: true, db, redis };
  }
}

@Module({
  imports: [InfraModule, AuthModule, DomainModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
