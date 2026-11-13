// What each sign-in group is called in the stakeholder demo (fictional companies, see data.ts).
// Demo builds only: the picker reads this behind the VITE_DEMO flag, so it is not in other bundles.
export const DEMO_GROUP_NAME: Record<string, string> = {
  'Consumer A · OEM': 'Aurora Motors · vehicle maker',
  'Consumer B · ESS integrator': 'Meridian Storage Systems · energy storage',
  'Consumer C · Fleet operator': 'Northgate Logistics · delivery fleet',
  Platform: 'Platform administration',
};
