import type { GroupDetail, GroupPermission } from '@tenace/types';
import { createContext, useContext } from 'react';

export interface GroupContextValue {
  group: GroupDetail;
  reload: () => Promise<void> | void;
  can: (p: GroupPermission) => boolean;
}

export const GroupCtx = createContext<GroupContextValue | null>(null);

export function useGroup(): GroupContextValue {
  const v = useContext(GroupCtx);
  if (!v) throw new Error('useGroup outside group screen');
  return v;
}
