import type { Request } from 'express';
import type { GroupPermission, GroupRole, SessionUser } from '@tenace/types';
import type { Group, MemberStatus } from '@prisma/client';

export interface MemberContext {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  status: MemberStatus;
  startsOnWeek: Date;
  permissions: readonly GroupPermission[];
}

export interface AuthedRequest extends Request {
  user?: SessionUser;
  sessionId?: string;
  member?: MemberContext;
  group?: Group;
}

/** @db.Date helpers — local dates travel as "YYYY-MM-DD" strings. */
export const toDbDate = (d: string): Date => new Date(`${d}T00:00:00Z`);
export const fromDbDate = (d: Date): string => d.toISOString().slice(0, 10);
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function shortDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}
