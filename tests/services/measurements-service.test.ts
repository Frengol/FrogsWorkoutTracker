jest.mock('@/src/shared/db/database', () => ({
  createEntityBase: jest.fn(() => ({
    id: 'measurement-1',
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
    version: 1,
    schemaVersion: 3,
    syncState: 'local_only',
    originDeviceId: 'device-1',
  })),
  database: {
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  },
  getAppUser: jest.fn(() => ({ id: 'user-1' })),
  writeAuditLog: jest.fn(),
}));

import {
  createQuickWeightEntry,
  deleteBodyMeasurement,
  getBodyMeasurement,
  listBodyMeasurements,
  listBodyMeasurementsWithContext,
  saveBodyMeasurement,
} from '@/src/modules/measurements/service';
import { database, getAppUser, writeAuditLog } from '@/src/shared/db/database';

const measurementRow = {
  id: 'measurement-1',
  created_at: '2026-03-27T10:00:00.000Z',
  updated_at: '2026-03-27T10:00:00.000Z',
  deleted_at: null,
  version: 1,
  schema_version: 3,
  remote_id: null,
  sync_state: 'local_only',
  last_exported_at: null,
  origin_device_id: 'device-1',
  user_id: 'user-1',
  recorded_at: '2026-03-27T10:00:00.000Z',
  weight_kg: 82.5,
  chest_cm: 101,
  waist_cm: 81,
  hips_cm: 96,
  arm_cm: 39,
  thigh_cm: 60,
  note: 'Medida completa',
};

describe('measurements service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists and maps body measurements by period without workout context', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([measurementRow]);

    expect(listBodyMeasurements('30d')).toEqual([
      expect.objectContaining({
        id: 'measurement-1',
        weightKg: 82.5,
        chestCm: 101,
        note: 'Medida completa',
      }),
    ]);
    expect((database.getAllSync as jest.Mock).mock.calls[0][0]).toContain('BETWEEN ? AND ?');
  });

  it('lists timeline measurements without treino relacionado and loads one measurement by id', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([measurementRow]);
    (database.getFirstSync as jest.Mock).mockReturnValue(measurementRow);

    expect(listBodyMeasurementsWithContext('all')).toEqual([
      expect.objectContaining({
        id: 'measurement-1',
        weightKg: 82.5,
        note: 'Medida completa',
      }),
    ]);
    expect(getBodyMeasurement('measurement-1')).toEqual(
      expect.objectContaining({
        id: 'measurement-1',
        recordedAt: '2026-03-27T10:00:00.000Z',
      }),
    );
  });

  it('creates, updates and deletes measurements without persisting related workouts', () => {
    const createdId = saveBodyMeasurement({
      recordedAt: '2026-03-27T10:00:00.000Z',
      weightKg: 82.5,
      chestCm: 101,
      waistCm: 81,
      hipsCm: 96,
      armCm: 39,
      thighCm: 60,
      note: '  Medida completa  ',
    });

    saveBodyMeasurement(
      {
        recordedAt: '2026-03-28T11:00:00.000Z',
        weightKg: null,
        chestCm: null,
        waistCm: null,
        hipsCm: null,
        armCm: null,
        thighCm: null,
        note: '   ',
      },
      'measurement-1',
    );

    createQuickWeightEntry(81.8);
    deleteBodyMeasurement('measurement-1');

    expect(createdId).toBe('measurement-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO body_measurements'),
      'measurement-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'user-1',
      '2026-03-27T10:00:00.000Z',
      82.5,
      101,
      81,
      96,
      39,
      60,
      'Medida completa',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE body_measurements'),
      '2026-03-28T11:00:00.000Z',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      expect.any(String),
      'measurement-1',
    );
    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM body_measurements WHERE id = ?', 'measurement-1');
    expect(writeAuditLog).toHaveBeenCalledWith('body_measurement', 'measurement-1', 'deleted', {});
  });

  it('supports the all-period listing path and fails when no user is initialized', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([]);

    expect(listBodyMeasurements('all')).toEqual([]);

    (getAppUser as jest.Mock).mockReturnValueOnce(null);
    expect(() =>
      saveBodyMeasurement({
        recordedAt: '2026-03-27T10:00:00.000Z',
        weightKg: 80,
        note: null,
      }),
    ).toThrow('User not initialized');
  });
});
