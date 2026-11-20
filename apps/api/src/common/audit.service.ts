import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import type { AuthedRequest } from './request';

/** Records platform-admin actions. Never store secret values in `meta`. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  async log(req: AuthedRequest | null, action: string, entity: string, entityId?: string, meta?: Prisma.InputJsonValue): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { actorId: req?.user?.id, action, entity, entityId, meta, ip: req?.ip } });
    } catch (e) {
      this.logger.error(`audit write failed: ${(e as Error).message}`);
    }
  }
}
