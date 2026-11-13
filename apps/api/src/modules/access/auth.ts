import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { RoleSchema, type Role } from '@ql/contracts';
import type { Config } from '../../config.ts';
import type { AppStateRepository, UserRef } from '../../data/index.ts';
import { forbidden, unauthenticated } from '../../errors.ts';

export const COOKIE_NAME = 'ql_session';
const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours (D-08); not configurable.
const ISSUER = 'ql';

export interface AuthContext {
  userId: string;
  /** From the verified token and re-checked against the database. Never from the request. */
  consumerId: string | null;
  role: Role;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

const isLocalHost = (hostname: string) =>
  ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname) || hostname.endsWith('.localhost');

/**
 * Cookie Secure flag (D-08). Always on in production; elsewhere only localhost may go without,
 * so local development over plain http works.
 */
export function cookieSecure(nodeEnv: Config['nodeEnv'], hostname: string): boolean {
  return nodeEnv === 'production' || !isLocalHost(hostname.replace(/:\d+$/, ''));
}

export function createTokens(secret: string) {
  const key = new TextEncoder().encode(secret);
  return {
    sign(user: UserRef): Promise<string> {
      return new SignJWT({ cid: user.consumerId, role: user.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
        .sign(key);
    },
    async verify(token: string): Promise<{ sub: string; cid: string | null; role: Role } | null> {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: ISSUER,
          requiredClaims: ['exp', 'iat', 'sub'],
          maxTokenAge: `${TOKEN_TTL_SECONDS}s`,
        });
        const role = RoleSchema.safeParse(payload.role);
        const cid =
          payload.cid === null || typeof payload.cid === 'string'
            ? (payload.cid as string | null)
            : undefined;
        if (
          !payload.sub ||
          !z.string().uuid().safeParse(payload.sub).success ||
          !role.success ||
          cid === undefined
        )
          return null;
        return { sub: payload.sub, cid, role: role.data };
      } catch {
        return null;
      }
    },
  };
}

export type Tokens = ReturnType<typeof createTokens>;

export function setSessionCookie(
  req: FastifyRequest,
  reply: FastifyReply,
  token: string,
  nodeEnv: Config['nodeEnv'],
): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: cookieSecure(nodeEnv, req.hostname),
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export function clearSessionCookie(
  req: FastifyRequest,
  reply: FastifyReply,
  nodeEnv: Config['nodeEnv'],
): void {
  reply.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: cookieSecure(nodeEnv, req.hostname),
    path: '/',
  });
}

/**
 * Decorates every request with `auth`, taken only from a verified session cookie. The user is
 * looked up again so a deleted user, or claims that disagree with the database, never pass.
 */
export function registerAuth(
  app: FastifyInstance,
  config: Config,
  repo: AppStateRepository,
  tokens: Tokens,
): void {
  app.decorateRequest('auth', null);

  // D-08: a state-changing request must carry a header a cross-site form cannot send.
  app.addHook('onRequest', async (req) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.headers['x-requested-with'] !== 'ql'
    ) {
      throw forbidden('Missing X-Requested-With header');
    }
  });

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return;
    const claims = await tokens.verify(token);
    if (!claims) return;
    const user = await repo.findUser(claims.sub);
    if (!user || user.role !== claims.role || user.consumerId !== claims.cid) return;
    req.auth = { userId: user.id, consumerId: user.consumerId, role: user.role, name: user.name };
  });
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}
