import { z, PermissionSchema, RoleSchema, Roles, IsoTimestamp } from './common.js';

const rolesShape = Object.fromEntries(Roles.map((r) => [r, z.array(PermissionSchema)])) as Record<
  (typeof Roles)[number],
  z.ZodArray<typeof PermissionSchema>
>;

type RolesInput = { platform_admin: string[] } & Record<string, string[]>;
/** D-01: only platform_admin holds permissions.manage, and it holds nothing else. */
const checkRoles = (roles: RolesInput, ctx: z.RefinementCtx) => {
  for (const [role, perms] of Object.entries(roles)) {
    if (role !== 'platform_admin' && perms.includes('permissions.manage')) {
      ctx.addIssue({
        code: 'custom',
        path: ['roles', role],
        message: 'permissions.manage is platform_admin only',
      });
    }
  }
  const pa = roles.platform_admin;
  if (pa.length !== 1 || pa[0] !== 'permissions.manage') {
    ctx.addIssue({
      code: 'custom',
      path: ['roles', 'platform_admin'],
      message: 'platform_admin holds only permissions.manage',
    });
  }
};

/** The role policy (D-01). Stored as versioned rows in `role_policies`. */
export const RolePolicySchema = z
  .object({
    version: z.number().int().min(1),
    roles: z.object(rolesShape),
  })
  .superRefine((p, ctx) => checkRoles(p.roles, ctx))
  .openapi('RolePolicy');
export type RolePolicy = z.infer<typeof RolePolicySchema>;

/** Body of PUT /admin/permissions: the server assigns the next version. */
export const RolePolicyUpdateSchema = z
  .object({ roles: z.object(rolesShape) })
  .superRefine((p, ctx) => checkRoles(p.roles, ctx));
export type RolePolicyUpdate = z.infer<typeof RolePolicyUpdateSchema>;

export const RolePolicyResponseSchema = z.object({
  policy: RolePolicySchema,
  createdAt: IsoTimestamp.optional(),
  asOf: IsoTimestamp,
});

export { RoleSchema };
