import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from './common.js';
import { AlertSchema } from './alerts.js';
import { ErrorSchema } from './error.js';
import { FleetSummarySchema, PackSummarySchema } from './fleet.js';
import { MeSchema } from './me.js';
import { NotificationChannelSchema, NotificationLogEntrySchema } from './notifications.js';
import { pageOf } from './page.js';
import { RolePolicySchema } from './policy.js';

/** Builds the OpenAPI document. Route registration grows as endpoints land (steps 3, 5, 6). */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const errorResponse = {
    description: 'Error',
    content: { 'application/json': { schema: ErrorSchema } },
  };
  const json = (schema: z.ZodTypeAny) => ({ 'application/json': { schema } });

  registry.registerPath({
    method: 'get',
    path: '/me',
    summary: 'Current user, consumer, branding and permissions',
    responses: { 200: { description: 'OK', content: json(MeSchema) }, 401: errorResponse },
  });
  registry.registerPath({
    method: 'get',
    path: '/fleet/summary',
    summary: 'Headline tiles',
    responses: {
      200: { description: 'OK', content: json(FleetSummarySchema) },
      403: errorResponse,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/packs',
    summary: 'Pack table',
    responses: {
      200: { description: 'OK', content: json(pageOf(PackSummarySchema)) },
      403: errorResponse,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/alerts',
    summary: 'Alerts',
    responses: {
      200: { description: 'OK', content: json(pageOf(AlertSchema)) },
      403: errorResponse,
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/alerts/{id}/acknowledge',
    summary: 'Acknowledge an alert',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'OK', content: json(AlertSchema) },
      404: errorResponse,
      409: errorResponse,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/notification-channels',
    summary: "The user's own channels",
    responses: { 200: { description: 'OK', content: json(z.array(NotificationChannelSchema)) } },
  });
  registry.registerPath({
    method: 'get',
    path: '/notification-log',
    summary: 'Delivery log',
    responses: {
      200: { description: 'OK', content: json(pageOf(NotificationLogEntrySchema)) },
      403: errorResponse,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/admin/permissions',
    summary: 'Latest role policy',
    responses: { 200: { description: 'OK', content: json(RolePolicySchema) }, 403: errorResponse },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: '82V QualityLoop · Fleet Health API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  });
}
