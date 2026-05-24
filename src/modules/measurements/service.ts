import { z } from 'zod';

import { BodyMeasurement } from '@/src/shared/types/domain';
import { database, createEntityBase, getAppUser, writeAuditLog } from '@/src/shared/db/database';
import { nowIso } from '@/src/shared/utils/date';
import { getPeriodWindow } from '@/src/modules/progress/analytics';

const optionalMetric = z.number().min(0).max(1000).nullable().optional();

const bodyMeasurementSchema = z.object({
  recordedAt: z.string().datetime(),
  weightKg: optionalMetric,
  chestCm: optionalMetric,
  waistCm: optionalMetric,
  hipsCm: optionalMetric,
  armCm: optionalMetric,
  thighCm: optionalMetric,
  note: z.string().max(500).nullable().optional(),
});

const mapMeasurementRow = (row: Record<string, unknown>): BodyMeasurement => ({
  id: String(row.id),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  version: Number(row.version),
  schemaVersion: Number(row.schema_version),
  remoteId: row.remote_id == null ? null : String(row.remote_id),
  syncState: String(row.sync_state) as BodyMeasurement['syncState'],
  lastExportedAt: row.last_exported_at == null ? null : String(row.last_exported_at),
  originDeviceId: String(row.origin_device_id),
  userId: String(row.user_id),
  recordedAt: String(row.recorded_at),
  weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
  chestCm: row.chest_cm == null ? null : Number(row.chest_cm),
  waistCm: row.waist_cm == null ? null : Number(row.waist_cm),
  hipsCm: row.hips_cm == null ? null : Number(row.hips_cm),
  armCm: row.arm_cm == null ? null : Number(row.arm_cm),
  thighCm: row.thigh_cm == null ? null : Number(row.thigh_cm),
  note: row.note == null ? null : String(row.note),
});

export const listBodyMeasurements = (period: '7d' | '30d' | '3m' | '1y' | 'all' = 'all') => {
  const window = getPeriodWindow(period);
  const rows = window.startDayKey
    ? database.getAllSync<Record<string, unknown>>(
        `
          SELECT bm.*
          FROM body_measurements bm
          WHERE SUBSTR(bm.recorded_at, 1, 10) BETWEEN ? AND ?
          ORDER BY bm.recorded_at DESC
        `,
        window.startDayKey,
        window.endDayKey,
      )
    : database.getAllSync<Record<string, unknown>>(
        `
          SELECT bm.*
          FROM body_measurements bm
          ORDER BY bm.recorded_at DESC
        `,
      );

  return rows.map(mapMeasurementRow);
};

export const listBodyMeasurementsWithContext = (period: '7d' | '30d' | '3m' | '1y' | 'all' = 'all') => {
  const window = getPeriodWindow(period);
  const params = window.startDayKey ? [window.startDayKey, window.endDayKey] : [];
  const rows = database.getAllSync<{
    id: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    version: number;
    schema_version: number;
    remote_id: string | null;
    sync_state: string;
    last_exported_at: string | null;
    origin_device_id: string;
    user_id: string;
    recorded_at: string;
    weight_kg: number | null;
    chest_cm: number | null;
    waist_cm: number | null;
    hips_cm: number | null;
    arm_cm: number | null;
    thigh_cm: number | null;
    note: string | null;
  }>(
    `
      SELECT
        bm.*
      FROM body_measurements bm
      ${window.startDayKey ? 'WHERE SUBSTR(bm.recorded_at, 1, 10) BETWEEN ? AND ?' : ''}
      ORDER BY bm.recorded_at DESC
    `,
    ...params,
  );

  return rows.map(mapMeasurementRow);
};

export const getBodyMeasurement = (measurementId: string) => {
  const row = database.getFirstSync<Record<string, unknown>>(
    `
      SELECT *
      FROM body_measurements
      WHERE id = ?
      LIMIT 1
    `,
    measurementId,
  );

  return row ? mapMeasurementRow(row) : null;
};

export const saveBodyMeasurement = (
  input: z.input<typeof bodyMeasurementSchema>,
  measurementId?: string,
) => {
  const parsed = bodyMeasurementSchema.parse(input);
  const user = getAppUser();

  if (!user) {
    throw new Error('User not initialized');
  }

  if (measurementId) {
    database.runSync(
      `
        UPDATE body_measurements
        SET recorded_at = ?, weight_kg = ?, chest_cm = ?, waist_cm = ?, hips_cm = ?, arm_cm = ?, thigh_cm = ?, note = ?, updated_at = ?
        WHERE id = ?
      `,
      parsed.recordedAt,
      parsed.weightKg ?? null,
      parsed.chestCm ?? null,
      parsed.waistCm ?? null,
      parsed.hipsCm ?? null,
      parsed.armCm ?? null,
      parsed.thighCm ?? null,
      parsed.note?.trim() || null,
      nowIso(),
      measurementId,
    );

    writeAuditLog('body_measurement', measurementId, 'updated', parsed);
    return measurementId;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO body_measurements (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        user_id, recorded_at, weight_kg, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    base.id,
    base.createdAt,
    base.updatedAt,
    null,
    base.version,
    base.schemaVersion,
    null,
    base.syncState,
    null,
    base.originDeviceId,
    user.id,
    parsed.recordedAt,
    parsed.weightKg ?? null,
    parsed.chestCm ?? null,
    parsed.waistCm ?? null,
    parsed.hipsCm ?? null,
    parsed.armCm ?? null,
    parsed.thighCm ?? null,
    parsed.note?.trim() || null,
  );

  writeAuditLog('body_measurement', base.id, 'created', parsed);
  return base.id;
};

export const createQuickWeightEntry = (weightKg: number) =>
  saveBodyMeasurement({
    recordedAt: nowIso(),
    weightKg,
    note: null,
  });

export const deleteBodyMeasurement = (measurementId: string) => {
  database.runSync('DELETE FROM body_measurements WHERE id = ?', measurementId);
  writeAuditLog('body_measurement', measurementId, 'deleted', {});
};
