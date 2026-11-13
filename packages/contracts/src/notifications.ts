import { z, Uuid, IsoTimestamp, SeveritySchema } from './common.js';
import { pageOf } from './page.js';

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
        const host = u.hostname.toLowerCase().replace(/\.+$/, '');
        const ipLiteral = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[');
        // Cheap contract-level SSRF guards; DNS-time blocking of private ranges comes later (D-07).
        return (
          u.protocol === 'https:' &&
          !u.username &&
          !u.password &&
          !ipLiteral &&
          host.includes('.') &&
          host !== 'localhost' &&
          !/\.(localhost|local|internal|localdomain)$/.test(host) &&
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

/** PUT /notification-channels: the user's whole set, at most one channel per type. */
export const NotificationChannelsPutSchema = z
  .object({ channels: z.array(NotificationChannelInputSchema).max(ChannelTypes.length) })
  .superRefine((b, ctx) => {
    const types = b.channels.map((c) => c.type);
    if (new Set(types).size !== types.length) {
      ctx.addIssue({ code: 'custom', path: ['channels'], message: 'At most one channel per type' });
    }
  })
  .openapi('NotificationChannelsPut');
export type NotificationChannelsPut = z.infer<typeof NotificationChannelsPutSchema>;

export const NotificationTestRequestSchema = z
  .object({ type: ChannelTypeSchema })
  .openapi('NotificationTestRequest');

export const NotificationTestResultSchema = z
  .object({
    channel: ChannelTypeSchema,
    status: z.enum(['sent', 'failed']),
    error: z.string().nullable(),
    at: IsoTimestamp,
  })
  .openapi('NotificationTestResult');
export type NotificationTestResult = z.infer<typeof NotificationTestResultSchema>;

export const NotificationLogPageSchema = pageOf(NotificationLogEntrySchema).openapi(
  'NotificationLogPage',
);

/** POST /dev/simulate-alert (mock mode only, platform_admin). The one place a consumer id is accepted in a body (D-04). */
export const SimulateAlertRequestSchema = z
  .object({ consumerId: Uuid, severity: SeveritySchema.default('high') })
  .strict();
export const SimulateAlertResultSchema = z.object({
  alertId: Uuid,
  jobsQueued: z.number().int().min(0),
});
