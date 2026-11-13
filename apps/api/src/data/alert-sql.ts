import { AlertSchema, type Alert } from '@ql/contracts';
import type { Tx } from './tenant.ts';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Allow-listed ORDER BY fragments. User input only ever selects a key; it is never interpolated. */
export const ALERT_ORDER = {
  createdAt: 'a.created_at',
  severity: "CASE a.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END",
  status: "CASE a.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END",
} as const;

/**
 * Consumer-facing columns only. Joins carry the consumer id too (D-03), so a row can never be
 * stitched to another consumer's pack or user even if RLS were misconfigured.
 */
export const ALERT_FROM = `
  FROM alerts a
  JOIN packs p ON p.id = a.pack_id AND p.consumer_id = a.consumer_id
  LEFT JOIN users u ON u.id = a.acknowledged_by AND u.consumer_id = a.consumer_id`;

export const ALERT_COLUMNS = `
  a.id, a.pack_id, p.serial AS pack_serial, a.severity, a.title, a.description,
  a.recommended_action, a.status, a.created_at, u.name AS acknowledged_by_name,
  a.acknowledged_at, a.model_version, a.confidence, a.signals`;

export interface AlertRow extends Record<string, unknown> {
  id: string;
  pack_id: string;
  pack_serial: string;
  severity: Alert['severity'];
  title: string;
  description: string;
  recommended_action: string;
  status: Alert['status'];
  created_at: Date;
  acknowledged_by_name: string | null;
  acknowledged_at: Date | null;
  model_version: string;
  confidence: string | null;
  signals: Record<string, unknown> | null;
}

/** Row to DTO, field by field (never a spread), then through the contracts schema (D-09, rule 6). */
export function toAlert(r: AlertRow): Alert {
  return AlertSchema.parse({
    id: r.id,
    packId: r.pack_id,
    packSerial: r.pack_serial,
    severity: r.severity,
    title: r.title,
    description: r.description,
    recommendedAction: r.recommended_action,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    acknowledgedBy: r.acknowledged_by_name,
    acknowledgedAt: r.acknowledged_at ? r.acknowledged_at.toISOString() : null,
    modelVersion: r.model_version,
    confidence: r.confidence === null ? null : Number(r.confidence),
    signals: r.signals,
  });
}

export async function selectAlert(
  tx: Tx,
  consumerId: string,
  alertId: string,
): Promise<Alert | null> {
  if (!UUID_RE.test(alertId)) return null;
  const r = await tx.query<AlertRow>(
    `SELECT ${ALERT_COLUMNS} ${ALERT_FROM} WHERE a.consumer_id = $1 AND a.id = $2`,
    [consumerId, alertId],
  );
  return r.rows[0] ? toAlert(r.rows[0]) : null;
}
