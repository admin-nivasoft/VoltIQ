import type {
  Alert,
  Me,
  NotificationChannel,
  NotificationChannelInput,
  NotificationLogEntry,
  Page,
  PageQuery,
  Role,
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
  ping(): Promise<void>;

  /** Idempotent acknowledge with an audit event in the same transaction (D-10, D-13). */
  acknowledgeAlert(principal: Principal, alertId: string): Promise<AcknowledgeResult>;

  listChannels(principal: Principal): Promise<NotificationChannel[]>;
  /** Replaces the user's channels: upserts by type, removes types not listed, audits the change. */
  saveChannels(
    principal: Principal,
    channels: NotificationChannelInput[],
  ): Promise<NotificationChannel[]>;

  listNotificationLog(consumerId: string, q: PageQuery): Promise<Page<NotificationLogEntry>>;
  appendNotificationLog(consumerId: string, entry: NewLogEntry): Promise<void>;
}
