import { Global, Module } from '@nestjs/common';
import { IntegrationsService } from '../modules/integrations/integrations.service';
import { PaymentsService } from '../modules/integrations/payments.service';
import { AuditService } from './audit.service';
import { CipherService } from './cipher.service';
import { EnvService } from './env.service';
import { MailService } from './mail.service';
import { NotifyService } from './notify.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { StorageService } from './storage.service';

const SHARED = [EnvService, PrismaService, RedisService, CipherService, IntegrationsService, PaymentsService, MailService, StorageService, NotifyService, AuditService];

@Global()
@Module({ providers: SHARED, exports: SHARED })
export class InfraModule {}
