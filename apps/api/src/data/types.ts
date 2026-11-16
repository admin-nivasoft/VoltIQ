import type {
  Alert,
  Me,
  NotificationChannel,
  NotificationChannelInput,
  NotificationLogEntry,
  Page,
  PageQuery,
  Role,
  RolePolicyUpdate,
} from '@ql/contracts';

export interface UserRef {
  id: string;
  consumerId: string | null;
  role: Role;
  name: string;
}

/**
 * Who is acting, built only from the verified token. Repository methods that act on behalf of a
 * user take this single object so a user id from a path or body can never be passed by mistake.
 */
export interface Principal {
  consumerId: string;
  userId: string;
}

export type AcknowledgeResult =
  | { kind: 'acknowledged'; alert: Alert }
  /** Already acknowledged: the original acknowledgement is returned unchanged (D-10). */
  | { kind: 'already_acknowledged'; alert: Alert }
  | { kind: 'resolved' }
  /** Missing, or another consumer's alert: the caller answers 404 for both. */
  | { kind: 'not_found' };

export interface ClaimedJob {
  id: string;
  alertId: string;
  userId: string;
  channel: NotificationChannel['type'];
  target: string;
  attempts: number;
  severity: Alert['severity'];
  title: string;
  description: string;
  recommendedAction: string;
}

export interface NewAlert {
  /** Optional: an in-service pack of the consumer. When omitted one is chosen. */
  packId?: string;
  severity: Alert['severity'];
  title: string;
  description: string;
  recommendedAction: string;
  modelVersion: string;
  confidence: number | null;
}

export interface AttemptPlan {
  status: 'sent' | 'retry' | 'failed';
  /** Wait before the next attempt, from the database's now(). Null unless status is 'retry'. */
  retryAfterMs: number | null;
}

export interface ClaimOptions {
  limit: number;
  leaseMs: number;
  maxAttempts: number;
  /**
   * Test hook: shifts the effective "now" from the database clock. Always 0 in production, so
   * due times, leases and backoff all use one clock (the database's), even with several replicas.
   */
  shiftMs?: number;
}

export interface NewLogEntry {
  alertId: string | null;
  kind: 'alert' | 'test';
  channel: NotificationChannel['type'];
  status: 'sent' | 'failed';
  attempt: number;
  error: string | null;
}

/**
 * The app's own state, always Postgres (D-05). Consumer-scoped methods take consumerId first,
 * from the verified token. The outbox (D-07) is added in step 6.
 */
export interface AppStateRepository {
  /** Login lookup through the SECURITY DEFINER function (D-04). */
  findUser(userId: string): Promise<UserRef | null>;
  listConsumerIds(): Promise<string[]>;
  getMe(consumerId: string, userId: string): Promise<Omit<Me, 'permissions' | 'asOf'> | null>;
  getPlatformMe(userId: string): Promise<Omit<Me, 'permissions' | 'asOf'> | null>;
  /** Raw stored policy with its version; the policy service validates it with the contracts schema. */
  getLatestPolicy(): Promise<unknown>;
  recordAudit(consumerId: string, userId: string, action: string, object: string): Promise<void>;
  recordPlatformAudit(userId: string, action: string, object: string): Promise<void>;
  /**
   * Publishes a new role-policy version and writes the platform audit event in one transaction (D-01,
   * D-13). Only a platform_admin may be the actor, and never from inside a tenant context: both
   * database functions refuse otherwise. Old versions are never overwritten. Returns the new version.
   */
  publishPolicy(userId: string, roles: RolePolicyUpdate['roles']): Promise<number>;
  ping(): Promise<void>;

  /** Idempotent acknowledge with an audit event in the same transaction (D-10, D-13). */
  acknowledgeAlert(principal: Principal, alertId: string): Promise<AcknowledgeResult>;

  listChannels(principal: Principal): Promise<NotificationChannel[]>;
  /** Replaces the user's channels: upserts by type, removes types not listed, audits the change. */
  saveChannels(
    principal: Principal,
    channels: NotificationChannelInput[],
  ): Promise<NotificationChannel[]>;

  /**
   * Outbox (D-07). The alert and its jobs are written in one transaction. Only users whose role is in
   * notifyRoles (those holding alerts.view) and who have an enabled channel get a job.
   * Returns null when the consumer has no in-service pack to attach the alert to.
   */
  createAlertWithJobs(
    consumerId: string,
    alert: NewAlert,
    notifyRoles: Role[],
  ): Promise<{ alertId: string; jobsQueued: number } | null>;
  /** Idempotent: a second call for the same alert creates no duplicates (UNIQUE alert, user, channel). */
  enqueueJobsForAlert(consumerId: string, alertId: string, notifyRoles: Role[]): Promise<number>;
  /**
   * Claims due jobs with FOR UPDATE SKIP LOCKED, counts the attempt and leases them in one step,
   * so a crash after sending still uses up an attempt. Jobs out of attempts, or whose channel was
   * disabled or removed, are failed here instead of being sent. The target is the channel's current one.
   */
  claimDueJobs(consumerId: string, opts: ClaimOptions): Promise<ClaimedJob[]>;
  /**
   * Gives back jobs that were claimed but never started (the worker stopped early, or is shutting
   * down): the attempt counted at claim is returned and the job is due again at once.
   */
  releaseJobs(consumerId: string, jobs: ClaimedJob[], shiftMs?: number): Promise<void>;
  /** Writes the attempt to notification_log and updates the job in one transaction. No-op if already handled. */
  recordAttempt(
    consumerId: string,
    job: ClaimedJob,
    result: { ok: boolean; error: string | null },
    plan: AttemptPlan,
    shiftMs?: number,
  ): Promise<void>;
  /** A test send: the log entry and its audit event in one transaction (D-13). */
  recordTestSend(
    principal: Principal,
    entry: {
      channel: NotificationChannel['type'];
      status: 'sent' | 'failed';
      error: string | null;
    },
  ): Promise<void>;

  listNotificationLog(consumerId: string, q: PageQuery): Promise<Page<NotificationLogEntry>>;
  appendNotificationLog(consumerId: string, entry: NewLogEntry): Promise<void>;
}
