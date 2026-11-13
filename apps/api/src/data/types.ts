import type { Me, Role } from '@ql/contracts';

export interface UserRef {
  id: string;
  consumerId: string | null;
  role: Role;
  name: string;
}

/** Base of the AppStateRepository (D-05). Step 4 adds alerts, channels and the outbox. */
export interface AppStateRepository {
  /** Login lookup through the SECURITY DEFINER function (D-04). */
  findUser(userId: string): Promise<UserRef | null>;
  listConsumerIds(): Promise<string[]>;
  /** Consumer, user and manufacturer branding for a tenant user. consumerId comes from the token. */
  getMe(consumerId: string, userId: string): Promise<Omit<Me, 'permissions' | 'asOf'> | null>;
  getPlatformMe(userId: string): Promise<Omit<Me, 'permissions' | 'asOf'> | null>;
  /** Raw stored policy with its version; the policy service validates it with the contracts schema. */
  getLatestPolicy(): Promise<unknown>;
  recordAudit(consumerId: string, userId: string, action: string, object: string): Promise<void>;
  recordPlatformAudit(userId: string, action: string, object: string): Promise<void>;
  ping(): Promise<void>;
}
