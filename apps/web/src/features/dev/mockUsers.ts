// Seeded demo users (db/seed/seed.sql). Mock mode only: this file is imported only by the
// development switcher, so it never reaches a production bundle (D-08).
export interface MockUser {
  id: string;
  group: string;
  label: string;
}

const role = (n: number, c: number) => `e000000${c}-0000-4000-8000-00000000000${n}`;

export const MOCK_USERS: MockUser[] = [
  ...(
    [
      ['Consumer A · OEM', 1],
      ['Consumer B · ESS integrator', 2],
      ['Consumer C · Fleet operator', 3],
    ] as const
  ).flatMap(([group, c]) => [
    { id: role(1, c), group, label: 'Fleet manager' },
    { id: role(2, c), group, label: 'Technician' },
    { id: role(3, c), group, label: 'Consumer admin' },
  ]),
  { id: 'd0000000-0000-4000-8000-000000000001', group: 'Platform', label: 'Platform admin' },
];
