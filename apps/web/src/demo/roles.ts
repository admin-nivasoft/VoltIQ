// Demo-only roles and permissions for the BPTE screens. config/permissions.json (shared with the API)
// still holds the SCR-04 consumer roles and is not changed in this pass. The proposed roles table is
// in bpte/docs/requirements.md section 2 (still "proposed, to confirm").
import type { DemoPermission, DemoRole } from './types';

export const DEMO_POLICY: Record<DemoRole, DemoPermission[]> = {
  battery_manager: ['fleet.view', 'batteries.view', 'imports.view', 'connection.view'],
  admin: [
    'fleet.view',
    'batteries.view',
    'imports.view',
    'imports.run',
    'connection.view',
    'connection.manage',
  ],
};

export const ROLE_LABEL: Record<DemoRole, string> = {
  battery_manager: 'Battery manager',
  admin: 'Admin',
};
