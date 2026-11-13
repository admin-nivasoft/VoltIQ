import {
  z,
  Uuid,
  IsoTimestamp,
  RoleSchema,
  PermissionSchema,
  ConsumerTypeSchema,
} from './common.js';

/** GET /me. platform_admin belongs to no consumer, so `consumer` is null for that role (D-01). */
export const MeSchema = z
  .object({
    user: z.object({ id: Uuid, name: z.string(), role: RoleSchema }),
    consumer: z.object({ id: Uuid, name: z.string(), type: ConsumerTypeSchema }).nullable(),
    manufacturer: z.object({ name: z.string(), logoUrl: z.string().nullable() }).nullable(),
    permissions: z.array(PermissionSchema),
    asOf: IsoTimestamp,
  })
  .openapi('Me');
export type Me = z.infer<typeof MeSchema>;
