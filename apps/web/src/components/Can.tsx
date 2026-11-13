import type { ReactNode } from 'react';
import type { Permission } from '@ql/contracts';
import { useCan } from '../lib/auth/session';

/**
 * Shows its children only when GET /me lists the permission. Hiding a control is a convenience: the
 * API enforces every rule. Renders the fallback (or nothing) while loading, signed out or lacking it.
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{useCan(permission) ? children : fallback}</>;
}
