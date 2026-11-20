import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface NotifyInput {
  groupId?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/** In-app notification center. Failures never break the business action. */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger('Notify');
  constructor(private readonly prisma: PrismaService) {}

  async users(userIds: string[], n: NotifyInput): Promise<void> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    try {
      await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, groupId: n.groupId, type: n.type, title: n.title, body: n.body ?? '', link: n.link })) });
    } catch (e) {
      this.logger.error(`notification failed: ${(e as Error).message}`);
    }
  }

  /** Owners and admins of a group, optionally excluding someone (e.g. the actor). */
  async admins(groupId: string, n: NotifyInput, exceptUserId?: string): Promise<void> {
    const admins = await this.prisma.member.findMany({ where: { groupId, role: { in: ['owner', 'admin'] }, status: { in: ['active', 'leaving'] } }, select: { userId: true } });
    await this.users(
      admins.map((a) => a.userId).filter((id) => id !== exceptUserId),
      { ...n, groupId },
    );
  }

  async feed(groupId: string, type: string, text: string, actorMemberId?: string | null, checkInId?: string | null): Promise<void> {
    try {
      await this.prisma.feedEvent.create({ data: { groupId, type, text, actorMemberId: actorMemberId ?? null, checkInId: checkInId ?? null } });
    } catch (e) {
      this.logger.error(`feed failed: ${(e as Error).message}`);
    }
  }
}
