import { z, Uuid, IsoTimestamp } from './common.js';

export const ChannelTypes = ['email', 'sms', 'webhook'] as const;
export const ChannelTypeSchema = z.enum(ChannelTypes);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

const E164 = /^\+[1-9]\d{6,14}$/;
const Email = z.string().email().max(254);

/** Target validation by channel type (D-07): email address, E.164 phone number, or https URL. */
export function isValidTarget(type: ChannelType, target: string): boolean {
  switch (type) {
    case 'email':
      return Email.safeParse(target).success;
    case 'sms':
      return E164.test(target);
    case 'webhook':
      try {
        const u = new URL(target);
        const host = u.hostname.toLowerCase();
        const ipLiteral = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[');
        // Cheap contract-level SSRF guards; DNS-time blocking of private ranges comes later (D-07).
        return (
          u.protocol === 'https:' &&
          !u.username &&
          !u.password &&
          !ipLiteral &&
          host !== 'localhost' &&
          !host.endsWith('.localhost')
        );
      } catch {
        return false;
      }
  }
}

const channelFields = {
  type: ChannelTypeSchema,
  target: z.string().min(1).max(2048),
  enabled: z.boolean(),
};

const checkTarget = (c: { type: ChannelType; target: string }, ctx: z.RefinementCtx) => {
  if (!isValidTarget(c.type, c.target)) {
    ctx.addIssue({ code: 'custom', path: ['target'], message: `Invalid target for ${c.type}` });
  }
};

/** Request body. No client-supplied id: the server upserts by (user from token, type) (D-14). */
export const NotificationChannelInputSchema = z
  .object(channelFields)
  .superRefine(checkTarget)
  .openapi('NotificationChannelInput');
export type NotificationChannelInput = z.infer<typeof NotificationChannelInputSchema>;

/** Response shape. */
export const NotificationChannelSchema = z
  .object({ id: Uuid, ...channelFields })
  .openapi('NotificationChannel');
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationLogEntrySchema = z
  .object({
    id: Uuid,
    alertId: Uuid.nullable(),
    kind: z.enum(['alert', 'test']),
    channel: ChannelTypeSchema,
    status: z.enum(['sent', 'failed']),
    attempt: z.number().int().min(1),
    error: z.string().nullable(),
    at: IsoTimestamp,
  })
  .openapi('NotificationLogEntry');
export type NotificationLogEntry = z.infer<typeof NotificationLogEntrySchema>;
