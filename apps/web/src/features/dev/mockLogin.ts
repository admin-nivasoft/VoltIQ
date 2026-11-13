import { apiFetch } from '../../lib/api/client';

/** POST /auth/mock-login. Lives with the dev-only code so a production bundle carries no trace of it. */
export async function mockLogin(userId: string): Promise<void> {
  await apiFetch('/auth/mock-login', { method: 'POST', body: { userId } });
}
