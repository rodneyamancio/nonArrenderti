/**
 * Shared contracts between api, web and (later) mobile. Zero dependencies.
 */

// ------------------------------------------------------------------ errors
export type ErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'invalid_credentials'
  | 'session_expired'
  | 'forbidden'
  | 'csrf_rejected'
  | 'insufficient_permission'
  | 'not_found'
  | 'group_not_found'
  | 'conflict'
  | 'email_taken'
  | 'payload_too_large'
  | 'rate_limited'
  | 'service_unavailable'
  | 'internal_error'
  | 'invite_invalid'
  | 'invite_email_mismatch'
  | 'already_member'
  | 'checkin_outside_window'
  | 'goal_not_participant'
  | 'group_not_started'
  | 'goal_archived'
  | 'payment_already_decided'
  | 'self_approval'
  | 'owner_cannot_leave'
  | 'last_goal'
  | 'token_invalid'
  | 'plan_limit'
  | 'account_blocked'
  | 'group_blocked'
  | 'billing_unavailable'
  | 'invoice_not_payable';

export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  params?: Record<string, unknown>;
}

// ------------------------------------------------------------------ auth
export type SystemRole = 'user' | 'platform_admin';
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  avatarColor: string;
}

// ------------------------------------------------------------------ group roles & permissions
export type GroupRole = 'owner' | 'admin' | 'member';

export const GROUP_PERMISSIONS = [
  'group:group:read',
  'group:settings:update',
  'group:group:delete',
  'group:owner:transfer',
  'group:member:invite',
  'group:member:remove',
  'group:member:approve',
  'group:role:update',
  'goal:goal:manage',
  'checkin:checkin:create',
  'checkin:contest:create',
  'checkin:contest:resolve',
  'ledger:payment:declare',
  'ledger:payment:confirm',
  'ledger:adjustment:create',
  'fund:expense:create',
] as const;
export type GroupPermission = (typeof GROUP_PERMISSIONS)[number];

const MEMBER: GroupPermission[] = ['group:group:read', 'checkin:checkin:create', 'checkin:contest:create', 'ledger:payment:declare'];
const ADMIN: GroupPermission[] = [
  ...MEMBER,
  'group:settings:update',
  'group:member:invite',
  'group:member:remove',
  'group:member:approve',
  'goal:goal:manage',
  'checkin:contest:resolve',
  'ledger:payment:confirm',
  'ledger:adjustment:create',
  'fund:expense:create',
];
export const GROUP_ROLE_PERMISSIONS: Record<GroupRole, readonly GroupPermission[]> = {
  member: MEMBER,
  admin: ADMIN,
  owner: [...ADMIN, 'group:group:delete', 'group:owner:transfer', 'group:role:update'],
};
export const GROUP_ROLE_LABELS: Record<GroupRole, string> = { owner: 'Dono', admin: 'Admin', member: 'Membro' };

// ------------------------------------------------------------------ domain DTOs
export type GoalPeriod = 'daily' | 'weekly';
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface Destination {
  label: string;
  holderName: string;
  pixKeyType: PixKeyType | null;
  pixKey: string;
  bankInfo: string;
  city: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface GroupDetail extends GroupSummary {
  description: string;
  timezone: string;
  closeGraceHours: number;
  startsOn: string;
  destination: Destination;
  createdAt: string;
  me: { memberId: string; role: GroupRole; status: MemberStatus; permissions: GroupPermission[]; startsOnWeek: string };
  memberCount: number;
  pendingJoinRequests: number;
  pendingPayments: number;
  openContests: number;
  /** The owner's plan does not cover this group: no week runs until the owner picks it or upgrades. */
  planPaused: boolean;
}

export type MemberStatus = 'active' | 'leaving' | 'left' | 'removed';

export interface MemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: GroupRole;
  status: MemberStatus;
  joinedAt: string;
  startsOnWeek: string;
  endsAfterWeek: string | null;
  streak: number;
}

export interface GoalView {
  id: string;
  name: string;
  emoji: string;
  period: GoalPeriod;
  target: number;
  unit: string;
  slotsPerWeek: number;
  stakeCents: number;
  activeWeekdays: number[];
  excludedMemberIds: string[];
  archivedAt: string | null;
  createdAt: string;
}

export interface GoalInput {
  name: string;
  emoji: string;
  period: GoalPeriod;
  target: number;
  unit: string;
  slotsPerWeek?: number;
  stakeCents: number;
  activeWeekdays: number[];
  excludedMemberIds?: string[];
}

export interface WeekGoalView {
  id: string;
  goalId: string;
  name: string;
  emoji: string;
  period: GoalPeriod;
  target: number;
  unit: string;
  slotsPerWeek: number;
  stakeCents: number;
  activeWeekdays: number[];
  slotsAchieved: number;
  creditedCents: number;
  totalQuantity: number;
  toNext: number | null;
  /** daily goals: quantity per local date */
  byDate: Record<string, number>;
}

export interface WeekInfo {
  id: string | null;
  weekStart: string;
  weekEnd: string;
  endsAt: string;
  closesAt: string;
  status: 'open' | 'closed' | 'not_started';
}

export interface MemberWeekView {
  memberId: string;
  name: string;
  avatarColor: string;
  streak: number;
  charged: boolean;
  commitmentCents: number;
  creditedCents: number;
  penaltyCents: number | null;
  goals: WeekGoalView[];
}

export interface WeekBoard {
  week: WeekInfo;
  today: string;
  members: MemberWeekView[];
  previousWeekStart: string | null;
  nextWeekStart: string | null;
}

export interface OverviewGroup {
  group: GroupSummary;
  role: GroupRole;
  week: WeekInfo;
  today: string;
  charged: boolean;
  startsOnWeek: string;
  goals: WeekGoalView[];
  /** goals the member can check in to (current, not archived, participating) */
  checkinGoals: { id: string; name: string; emoji: string; unit: string; period: GoalPeriod; target: number }[];
  weekBalanceCents: number;
  openDebtCents: number;
  memberCount: number;
  pendingActions: number;
  /** The owner's subscription is blocked: the group is paused and read-only. */
  blocked: boolean;
  /** The owner's plan does not cover this group: weeks are paused (still readable). */
  planPaused: boolean;
}

export type LedgerEntryType = 'COMMITMENT' | 'SLOT_CREDIT' | 'SLOT_REVERSAL' | 'PAYMENT' | 'ADJUSTMENT';
export type FundEntryType = 'PENALTY_ASSESSED' | 'PENALTY_ADJUSTED' | 'PAYMENT_RECEIVED' | 'WAIVER' | 'EXPENSE';

export interface LedgerEntryView {
  id: string;
  type: LedgerEntryType;
  amountCents: number;
  description: string;
  weekStart: string | null;
  createdAt: string;
  balanceAfterCents: number;
}

export interface AccountView {
  member: { id: string; name: string; avatarColor: string };
  balanceCents: number;
  weekCents: number;
  openDebtCents: number;
  pendingPaymentCents: number;
  entries: LedgerEntryView[];
}

export interface FundEntryView {
  id: string;
  type: FundEntryType;
  receivableDeltaCents: number;
  cashDeltaCents: number;
  description: string;
  memberName: string | null;
  receiptUploadId: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface FundView {
  receivableCents: number;
  cashCents: number;
  totalCollectedCents: number;
  totalSpentCents: number;
  debtors: { memberId: string; name: string; avatarColor: string; openDebtCents: number }[];
  entries: FundEntryView[];
}

export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';
export interface PaymentView {
  id: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  status: PaymentStatus;
  note: string;
  receiptUploadId: string | null;
  declaredAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
}

export interface CheckInView {
  id: string;
  memberId: string;
  memberName: string;
  avatarColor: string;
  goalId: string;
  goalName: string;
  goalEmoji: string;
  unit: string;
  date: string;
  quantity: number;
  note: string;
  photoUploadId: string | null;
  status: 'valid' | 'invalidated' | 'deleted';
  counted: boolean;
  createdAt: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  contests: ContestView[];
}

export interface ContestView {
  id: string;
  openedByName: string;
  reason: string;
  status: 'open' | 'upheld' | 'dismissed';
  resolutionNote: string;
  resolvedByName: string | null;
  createdAt: string;
}

export type FeedEventType = 'checkin' | 'member_joined' | 'week_closed' | 'payment_confirmed' | 'contest_opened' | 'contest_resolved' | 'goal_changed' | 'expense';
export interface FeedItem {
  id: string;
  type: FeedEventType;
  createdAt: string;
  actorName: string | null;
  actorColor: string | null;
  text: string;
  checkIn: CheckInView | null;
}

export interface CheckInResult {
  checkIn: CheckInView;
  counted: boolean;
  slotDeltaCents: number;
  goal: WeekGoalView | null;
}

export interface InvitePreview {
  group: GroupSummary & { memberCount: number; description: string };
  kind: 'email' | 'link';
  email: string | null;
  invitedBy: string;
  valid: boolean;
}

export interface InviteView {
  id: string;
  kind: 'email' | 'link';
  email: string | null;
  token: string;
  uses: number;
  maxUses: number | null;
  expiresAt: string;
  createdByName: string;
  createdAt: string;
}

export interface JoinRequestView {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  createdAt: string;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  groupEmoji: string | null;
}

export interface WeekHistoryItem {
  weekStart: string;
  weekEnd: string;
  status: 'open' | 'closed';
  members: { memberId: string; name: string; commitmentCents: number; creditedCents: number; penaltyCents: number | null; allMet: boolean }[];
}

// ------------------------------------------------------------------ plans & billing
/** A plan the platform admin defines. `null` limits mean unlimited; price 0 = free. */
export interface PlanView {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  intervalMonths: number;
  maxGroups: number | null;
  maxMembersPerGroup: number | null;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
}

export type PlanInput = Omit<PlanView, 'id'>;

export type BillingMethod = 'pix' | 'boleto';
/** ok = nothing open · due = open, not late · past_due = late, inside the grace days · blocked. */
export type BillingStatus = 'ok' | 'due' | 'past_due' | 'blocked';
export type InvoiceStatus = 'open' | 'paid' | 'void';

export interface InvoiceView {
  id: string;
  amountCents: number;
  dueDate: string;
  status: InvoiceStatus;
  paidAt: string | null;
  paidVia: string | null;
  /** Late invoices are paid through a fresh checkout (Pix, boleto or card). */
  overdue: boolean;
}

export interface BillingAddress {
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

export interface BillingProfile {
  name: string;
  document: string;
  email: string;
  phone: string;
  address: BillingAddress;
}

export interface BillingView {
  plan: PlanView | null;
  status: BillingStatus;
  /** Days left before the block when past_due; 0 when blocked. */
  daysToBlock: number | null;
  graceDays: number;
  subscription: { method: BillingMethod; nextDueDate: string | null; livemode: boolean; cancelledAt: string | null } | null;
  invoices: InvoiceView[];
  usage: { groups: number; largestGroup: number };
  plans: PlanView[];
  /** Calebe Pay configured: paid plans can be subscribed. */
  paymentsReady: boolean;
  profile: BillingProfile | null;
  /** Trial granted by the team: `plan` above is the trial plan until `until` (inclusive). */
  trial: { plan: PlanView; until: string; daysLeft: number } | null;
  /** Groups the user owns, to pick which stay active when the plan does not cover all. */
  ownedGroups: OwnedGroupView[];
}

export interface OwnedGroupView {
  id: string;
  name: string;
  emoji: string;
  members: number;
  planPaused: boolean;
  /** Fits the plan's per-group member limit (only those can be active). */
  fits: boolean;
}

export const BRAND_COLORS = ['violet', 'spark', 'mint', 'sky', 'rose', 'sun', 'ink'] as const;
export type BrandColor = (typeof BRAND_COLORS)[number];
