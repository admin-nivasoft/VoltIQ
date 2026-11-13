import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from './common.js';
import { AlertPageSchema, AlertQuerySchema, AlertSchema } from './alerts.js';
import { ErrorSchema } from './error.js';
import { FleetSummarySchema, PackPageSchema, PackQuerySchema } from './fleet.js';
import { MeSchema } from './me.js';
import {
  NotificationChannelSchema,
  NotificationChannelsPutSchema,
  NotificationLogPageSchema,
  NotificationTestRequestSchema,
  NotificationTestResultSchema,
} from './notifications.js';
import { PageQuerySchema } from './page.js';

/**
 * Builds the OpenAPI document. It lists only endpoints that exist: a test compares it with the
 * registered routes. Mock login and /dev/* are deliberately not documented. Later steps add the
 * notification and admin endpoints as they are built.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'ql_session',
  });
  const security = [{ cookieAuth: [] as string[] }];
  const json = (schema: z.ZodTypeAny) => ({ 'application/json': { schema } });
  const err = (description: string) => ({ description, content: json(ErrorSchema) });
  const common = {
    401: err('Not signed in'),
    429: err('Too many requests'),
  };

  registry.registerPath({
    method: 'get',
    path: '/me',
    summary: 'Current user, consumer, branding and effective permissions',
    security,
    responses: { 200: { description: 'OK', content: json(MeSchema) }, ...common },
  });
  registry.registerPath({
    method: 'get',
    path: '/fleet/summary',
    summary: 'The four headline tiles (permission fleet.view)',
    security,
    responses: {
      200: { description: 'OK', content: json(FleetSummarySchema) },
      ...common,
      403: err('Missing permission'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/packs',
    summary: 'Pack table: search, sort and paging (permission packs.view)',
    description:
      'sort is `field` or `field:asc|desc` with field one of serial, sohPct, trend, remainingLife, warrantyStatus. Search is matched literally over serial, asset id and spec.',
    security,
    request: { query: PageQuerySchema.merge(PackQuerySchema) },
    responses: {
      200: { description: 'OK', content: json(PackPageSchema) },
      400: err('Invalid query'),
      ...common,
      403: err('Missing permission'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/alerts',
    summary: 'Alerts, filtered by status and severity (permission alerts.view)',
    description:
      'sort is `field` or `field:asc|desc` with field one of createdAt, severity, status.',
    security,
    request: { query: PageQuerySchema.merge(AlertQuerySchema) },
    responses: {
      200: { description: 'OK', content: json(AlertPageSchema) },
      400: err('Invalid query'),
      ...common,
      403: err('Missing permission'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/alerts/{id}/acknowledge',
    summary: 'Acknowledge an alert (permission alerts.acknowledge)',
    description:
      "Records who and when. Repeating it returns 200 with the original acknowledgement unchanged. A resolved alert returns 409. Another consumer's alert returns 404. Requires the header X-Requested-With: ql.",
    security,
    request: {
      params: z.object({ id: z.string().uuid() }),
      headers: z.object({ 'X-Requested-With': z.literal('ql') }),
    },
    responses: {
      200: { description: 'Acknowledged', content: json(AlertSchema) },
      400: err('Malformed alert id'),
      ...common,
      403: err('Missing permission, or the X-Requested-With header is absent'),
      404: err('No such alert'),
      409: err('The alert is resolved'),
    },
  });

  const hdr = { headers: z.object({ 'X-Requested-With': z.literal('ql') }) };
  registry.registerPath({
    method: 'get',
    path: '/notification-channels',
    summary: "The signed-in user's own notification channels (permission channels.manage_own)",
    security,
    responses: {
      200: { description: 'OK', content: json(z.array(NotificationChannelSchema)) },
      ...common,
      403: err('Missing permission'),
    },
  });
  registry.registerPath({
    method: 'put',
    path: '/notification-channels',
    summary: "Replace the signed-in user's channels (permission channels.manage_own)",
    description:
      'Targets are validated by type: an email address, an E.164 phone number, or an https URL. At most one channel per type. The user is always the signed-in user.',
    security,
    request: {
      ...hdr,
      body: { content: { 'application/json': { schema: NotificationChannelsPutSchema } } },
    },
    responses: {
      200: { description: 'OK', content: json(z.array(NotificationChannelSchema)) },
      400: err('Invalid channels'),
      ...common,
      403: err('Missing permission, or the X-Requested-With header is absent'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/notification-channels/test',
    summary:
      'Send a test message through one of your channels and report the result (permission channels.manage_own)',
    security,
    request: {
      ...hdr,
      body: { content: { 'application/json': { schema: NotificationTestRequestSchema } } },
    },
    responses: {
      200: {
        description: 'The delivery result, which may be a failure',
        content: json(NotificationTestResultSchema),
      },
      400: err('Invalid request'),
      ...common,
      403: err('Missing permission, or the X-Requested-With header is absent'),
      404: err('You have no channel of that type'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/notification-log',
    summary: 'Delivery log for the consumer, newest first (permission notifications.view_log)',
    security,
    request: { query: PageQuerySchema },
    responses: {
      200: { description: 'OK', content: json(NotificationLogPageSchema) },
      400: err('Invalid query'),
      ...common,
      403: err('Missing permission'),
    },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: '82V QualityLoop · Fleet Health API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  });
}
