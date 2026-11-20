import { Global, Module } from '@nestjs/common';
import { EnvService } from './env.service';
import { MailService } from './mail.service';
import { NotifyService } from './notify.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [EnvService, PrismaService, RedisService, MailService, StorageService, NotifyService],
  exports: [EnvService, PrismaService, RedisService, MailService, StorageService, NotifyService],
})
export class InfraModule {}
