import { describe, expect, it } from 'vitest';
import { cookieSecure } from './auth.ts';

describe('cookie Secure flag (D-08)', () => {
  it('is always on in production, whatever the Host header says', () => {
    for (const host of [
      'localhost',
      'localhost:8080',
      'x.localhost',
      '127.0.0.1',
      'portal.example.com',
    ]) {
      expect(cookieSecure('production', host), host).toBe(true);
    }
  });
  it('is off only for localhost outside production', () => {
    expect(cookieSecure('development', 'localhost:8080')).toBe(false);
    expect(cookieSecure('test', '127.0.0.1')).toBe(false);
    expect(cookieSecure('development', 'portal.example.com')).toBe(true);
  });
});
