import { Controller, Get, HttpCode, Param, Post, Req, Module } from '@nestjs/common';
import type { NotificationView } from '@tenace/types';
import { PrismaService } from '../../common/prisma.service';
import type { AuthedRequest } from '../../common/request';
import { AllowBlocked } from '../billing/billing.guard';
import { CheckInsController } from './checkins.controller';
import { GoalsWeeksController } from './goals-weeks.controller';
import { GroupGuard } from './group.guard';
import { GroupsController } from './groups.controller';
import { LedgerController } from './ledger.controller';
import { ViewsService } from './views.service';
import { WeeksService } from './weeks.service';

@Controller('notifications')
@AllowBlocked()
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: AuthedRequest): Promise<{ notifications: NotificationView[]; unread: number }> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 60 }),
      this.prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    const groups = new Map((await this.prisma.group.findMany({ where: { id: { in: rows.flatMap((r) => (r.groupId ? [r.groupId] : [])) } }, select: { id: true, emoji: true } })).map((g) => [g.id, g.emoji]));
    return {
      unread,
      notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString(), groupEmoji: n.groupId ? (groups.get(n.groupId) ?? null) : null })),
    };
  }

  @Get('unread')
  async unread(@Req() req: AuthedRequest) {
    return { unread: await this.prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }) };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@Req() req: AuthedRequest) {
    await this.prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: req.user!.id }, data: { readAt: new Date() } });
    return { ok: true };
  }
}

@Module({
  controllers: [GroupsController, GoalsWeeksController, CheckInsController, LedgerController, NotificationsController],
  providers: [WeeksService, ViewsService, GroupGuard],
  exports: [WeeksService],
})
export class DomainModule {}
