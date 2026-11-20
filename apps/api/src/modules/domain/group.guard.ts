import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GROUP_ROLE_PERMISSIONS, type GroupPermission } from '@tenace/types';
import { DomainForbidden, DomainNotFound } from '../../common/errors/domain-exceptions';
import { PrismaService } from '../../common/prisma.service';
import type { AuthedRequest, MemberContext } from '../../common/request';

export const GROUP_PERMISSION = 'tenace:group-permission';
/** Requires the caller's role in `:groupId` to grant this permission. */
export const NeedGroup = (p: GroupPermission) => SetMetadata(GROUP_PERMISSION, p);

/**
 * Isolation by membership (docs/spec.md §5): loads the caller's active membership in
 * `:groupId`. Not a member → 404 (existence never leaks). Runs after the global AuthGuard.
 */
@Injectable()
export class GroupGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const groupId = String(req.params.groupId ?? '');
    if (!req.user || !groupId || groupId.length > 40) throw new DomainNotFound('group_not_found', 'Grupo não encontrado');
    const member = await this.prisma.member.findUnique({ where: { groupId_userId: { groupId, userId: req.user.id } }, include: { group: true } });
    if (!member || !['active', 'leaving'].includes(member.status) || member.group.archivedAt) throw new DomainNotFound('group_not_found', 'Grupo não encontrado');
    const ctxMember: MemberContext = {
      id: member.id,
      groupId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      startsOnWeek: member.startsOnWeek,
      permissions: GROUP_ROLE_PERMISSIONS[member.role],
    };
    req.member = ctxMember;
    req.group = member.group;
    const needed = this.reflector.getAllAndOverride<GroupPermission | undefined>(GROUP_PERMISSION, [ctx.getHandler(), ctx.getClass()]) ?? 'group:group:read';
    if (!ctxMember.permissions.includes(needed)) throw new DomainForbidden('insufficient_permission', 'Você não tem permissão para esta ação', { permission: needed });
    return true;
  }
}
