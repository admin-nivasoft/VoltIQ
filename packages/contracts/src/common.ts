import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { z };

export const Uuid = z.string().uuid();
/** ISO 8601 timestamp (timestamptz serialised as a string). */
export const IsoTimestamp = z.string().datetime({ offset: true });

export const Roles = ['fleet_manager', 'technician', 'consumer_admin', 'platform_admin'] as const;
export const RoleSchema = z.enum(Roles).openapi('Role');
export type Role = z.infer<typeof RoleSchema>;

export const Permissions = [
  'fleet.view',
  'alerts.view',
  'alerts.acknowledge',
  'packs.view',
  'channels.manage_own',
  'notifications.view_log',
  'permissions.manage',
] as const;
export const PermissionSchema = z.enum(Permissions).openapi('Permission');
export type Permission = z.infer<typeof PermissionSchema>;

export const ConsumerTypes = ['oem', 'ess_integrator', 'fleet_operator'] as const;
export const ConsumerTypeSchema = z.enum(ConsumerTypes);

export const Severities = ['high', 'medium', 'low'] as const;
export const SeveritySchema = z.enum(Severities).openapi('Severity');
export type Severity = z.infer<typeof SeveritySchema>;

export const WarrantyStatuses = ['active', 'expiring', 'expired'] as const;
export const WarrantyStatusSchema = z.enum(WarrantyStatuses);

export const PackStatuses = ['in_service', 'out_of_service', 'retired'] as const;
export const PackStatusSchema = z.enum(PackStatuses);

/** Model transparency (D-09, NFR-09). */
export const Confidence = z.number().min(0).max(1);
