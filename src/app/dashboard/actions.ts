'use server';

import { requireAdmin } from '@/lib/roles';
import { getDb } from '@/db';
import { advanceStoredAlert, createAlert } from '@/core/alerts/service';
import type { AlertStatus } from '@/core/alerts/state';

type Result = { ok: true; id: string; status: AlertStatus } | { ok: false; reason: string };

const SEVERITIES = ['normal', 'watch', 'warning', 'severe', 'unknown'] as const;

/** Admin only. Records a SIMULATED alert as `detected`. Nothing is sent to anyone. */
export async function createSimulatedAlertAction(input: {
  place: string;
  lat: number;
  lng: number;
  severity: string;
  returnPeriod: number | null;
}): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, reason: admin.reason };
  const severity = SEVERITIES.find((s) => s === input.severity);
  if (
    !severity ||
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng) ||
    Math.abs(input.lat) > 90 ||
    Math.abs(input.lng) > 180
  ) {
    return { ok: false, reason: 'invalid' };
  }
  const alert = await createAlert(
    getDb(),
    { userId: admin.userId, isAdmin: true },
    {
      kind: 'simulated',
      place: input.place.trim().slice(0, 120) || 'Selected location',
      lat: input.lat,
      lng: input.lng,
      severity,
      returnPeriod: input.returnPeriod,
    },
  );
  return { ok: true, id: alert.id, status: alert.status };
}

/** Admin only. Moves one step along detected, verified, notified, acknowledged. */
export async function advanceAlertAction(id: string, to: AlertStatus): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, reason: admin.reason };
  const result = await advanceStoredAlert(getDb(), id, to, { userId: admin.userId, isAdmin: true });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, id, status: to };
}
