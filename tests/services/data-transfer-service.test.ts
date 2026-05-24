jest.mock('@/src/shared/db/database', () => ({
  clearTable: jest.fn(),
  createEntityBase: jest.fn(() => ({
    id: 'entity-1',
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
    version: 1,
    schemaVersion: 3,
    syncState: 'local_only',
    originDeviceId: 'device-1',
  })),
  database: {
    execSync: jest.fn(),
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  },
  getAppUser: jest.fn(() => ({ id: 'user-1' })),
  getDeviceId: jest.fn(() => 'device-1'),
  getUserPreferences: jest.fn(() => ({
    id: 'prefs-1',
    auto_backup_enabled: 0,
    auto_backup_last_exported_at: null,
  })),
  getTableRows: jest.fn(() => []),
  initializeDatabase: jest.fn(),
  insertRow: jest.fn(),
  mapExerciseRow: jest.fn((row) => ({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version,
    schemaVersion: row.schema_version,
    remoteId: row.remote_id,
    syncState: row.sync_state,
    lastExportedAt: row.last_exported_at,
    originDeviceId: row.origin_device_id,
    slug: row.slug,
    name: row.name,
    muscleGroup: row.muscle_group,
    secondaryMuscles: JSON.parse(row.secondary_muscles_json ?? '[]'),
    equipment: row.equipment,
    modality: row.modality,
    isCustom: row.is_custom === 1,
    instructions: row.instructions,
  })),
  resetSeededDatabase: jest.fn(),
  runInTransaction: jest.fn((callback) => callback()),
  writeAuditLog: jest.fn(),
}));

jest.mock('@/src/modules/progress/service', () => ({
  refreshAnalyticsCaches: jest.fn(),
}));

jest.mock('@/src/modules/media/service', () => ({
  clearAllWorkoutMediaFiles: jest.fn(async () => undefined),
}));

const mockLegacyContentByUri = new Map<string, string>();

jest.mock('expo-file-system/legacy', () => {
  const FileSystem = require('expo-file-system');
  const { File } = FileSystem;

  return {
    cacheDirectory: 'file:///mock-cache/',
    copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
      const source = new File(from);
      FileSystem.__writeMockFileForTests(to, mockLegacyContentByUri.get(from) ?? source.__getContentForTests());
    }),
    deleteAsync: jest.fn(async (uri: string) => {
      new File(uri).delete();
    }),
  };
});

import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import {
  createBackupEnvelopeForTests,
  getAutoBackupStatus,
  decodeUtf8TextForTests,
  discardImport,
  exportBackupJson,
  exportMeasurementsCsv,
  exportRoutineJson,
  exportRoutinesJson,
  exportWorkoutCsv,
  exportWorkoutsCsv,
  getImportReview,
  importExternalDataFile,
  importCsvTextForTests,
  pickAndImportCsvData,
  pickAndImportRoutineJson,
  pickAndImportWorkoutCsvData,
  pickAndRestoreBackup,
  repairUtf8MojibakeForTests,
  replaceImportExercise,
  resetLocalAppData,
  restoreBackupTextForTests,
  saveImportReview,
  setAutoBackupEnabled,
  syncAutoBackupSnapshotIfEnabled,
  updateImportedExercise,
  writeAutoBackupSnapshot,
} from '@/src/modules/data-transfer/service';
import { measurementCsvHeaders, workoutCsvHeaders } from '@/src/modules/data-transfer/adapters';
import {
  clearTable,
  database,
  getAppUser,
  getUserPreferences,
  getTableRows,
  insertRow,
  resetSeededDatabase,
} from '@/src/shared/db/database';
import { clearAllWorkoutMediaFiles } from '@/src/modules/media/service';
import { refreshAnalyticsCaches } from '@/src/modules/progress/service';
import { toCsv } from '@/src/shared/utils/csv';

let mockExistingSuccessfulImport: { id: string } | null = null;
let mockLastImportJob: {
  source_type: string;
  file_name: string;
  status: string;
  created_at: string;
} | null = null;

const essentialBackupTables = [
  'users',
  'user_preferences',
  'notification_preferences',
  'exercises',
  'routine_folders',
  'routines',
  'routine_exercises',
  'workouts',
  'workout_exercises',
  'set_entries',
  'body_measurements',
  'pr_records',
  'workout_draft_snapshots',
].sort();

const excludedBackupTables = [
  'workout_media',
  'audit_logs',
  'import_jobs',
  'sync_queue_items',
  'exercise_history_snapshots',
  'analytics_daily',
  'muscle_period_snapshots',
  'monthly_reports',
  'yearly_reviews',
];

const excludedBackupPayloadFragments = [
  'workout-media',
  'photo.jpg',
  'thumbnail',
  'mediaType',
  'audit-media',
  'import-history',
  'sync-queue',
  'snapshot-1',
  '"snapshot":"history"',
  '"snapshot":"muscle"',
  'analytics-cache',
  'monthly-report',
  'yearly-review',
];

const expectEssentialBackupTables = (backup: { tables: Record<string, unknown[]> }) => {
  expect(Object.keys(backup.tables).sort()).toEqual(essentialBackupTables);
  excludedBackupTables.forEach((tableName) => {
    expect(backup.tables).not.toHaveProperty(tableName);
  });
};

const createWorkoutCsvRow = (overrides: Record<string, string> = {}) =>
  Object.fromEntries(
    workoutCsvHeaders.map((header) => [
      header,
      {
        workout_id: 'workout-import-review-1',
        workout_title: 'Treino importado pelo perfil',
        workout_started_at: '2026-03-27T10:00:00.000Z',
        workout_ended_at: '2026-03-27T10:30:00.000Z',
        workout_duration_seconds: '1800',
        workout_status: 'completed',
        workout_source: 'empty',
        workout_note: '',
        workout_exercise_id: 'we-import-review-1',
        exercise_id: 'exercise-import-review-1',
        exercise_name: 'Remada importada nova',
        exercise_sort_order: '0',
        exercise_note: '',
        rest_seconds: '90',
        previous_performance: '',
        superset_group: '',
        muscle_group: 'back',
        secondary_muscles_json: '["biceps"]',
        equipment: 'machine',
        modality: 'strength',
        instructions: 'Manter postura neutra.',
        set_id: 'set-import-review-1',
        set_index: '0',
        set_type: 'normal',
        reps: '10',
        weight_kg: '50',
        duration_seconds: '',
        distance_meters: '',
        speed: '',
        elevation: '',
        rpe: '',
        is_completed: '1',
        ...overrides,
      }[header] ?? '',
    ]),
  );

const createExerciseRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'exercise-existing-supino',
  created_at: '2026-03-27T10:00:00.000Z',
  updated_at: '2026-03-27T10:00:00.000Z',
  deleted_at: null,
  version: 1,
  schema_version: 3,
  remote_id: null,
  sync_state: 'local_only',
  last_exported_at: null,
  origin_device_id: 'device-1',
  slug: 'supino-reto',
  name: 'Supino reto',
  muscle_group: 'chest',
  secondary_muscles_json: '["triceps"]',
  equipment: 'barbell',
  modality: 'strength',
  is_custom: 0,
  instructions: 'Mantenha escápulas firmes.',
  ...overrides,
});

const externalImportUnsupportedError =
  'Este arquivo não é um CSV de treino Frogs/Hevy, um JSON de rotina Frogs ou uma cópia de segurança do Frogs.';

const getLastImportJobInsertCall = () =>
  (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
    String(sql).includes('INSERT INTO import_jobs'),
  );

describe('data transfer service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLegacyContentByUri.clear();
    (getAppUser as jest.Mock).mockReturnValue({ id: 'user-1' });
    (getUserPreferences as jest.Mock).mockReturnValue({
      id: 'prefs-1',
      auto_backup_enabled: 0,
      auto_backup_last_exported_at: null,
    });
    mockExistingSuccessfulImport = null;
    mockLastImportJob = {
      source_type: 'frog_workouts_csv',
      file_name: 'frog-workouts.csv',
      status: 'success',
      created_at: '2026-03-27T10:00:00.000Z',
    };
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM workouts w')) {
        return [
          {
            workout_id: 'workout-1',
            workout_title: 'Treino A',
            workout_started_at: '2026-03-27T10:00:00.000Z',
            workout_ended_at: '2026-03-27T10:30:00.000Z',
            workout_duration_seconds: 1800,
            workout_status: 'completed',
            workout_source: 'empty',
            workout_note: '',
            workout_visibility: 'private',
            workout_exercise_id: 'we-1',
            exercise_id: 'exercise-1',
            exercise_name: 'Supino reto',
            exercise_sort_order: 0,
            exercise_note: '',
            rest_seconds: 90,
            previous_performance: '',
            superset_group: '',
            muscle_group: 'chest',
            set_id: 'set-1',
            set_index: 0,
            set_type: 'normal',
            reps: 8,
            weight_kg: 60,
            duration_seconds: null,
            distance_meters: null,
            speed: null,
            elevation: null,
            rpe: null,
            is_completed: 1,
          },
        ];
      }

      if (sql.includes('FROM body_measurements')) {
        return [
          {
            measurement_id: 'measurement-1',
            recorded_at: '2026-03-27T10:00:00.000Z',
            weight_kg: 82.5,
            chest_cm: null,
            waist_cm: null,
            hips_cm: null,
            arm_cm: null,
            thigh_cm: null,
            note: '',
          },
        ];
      }

      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return mockExistingSuccessfulImport;
      }

      if (sql.includes('FROM import_jobs')) {
        return mockLastImportJob;
      }

      return null;
    });
  });

  it('exports workouts, measurements and backup files locally', async () => {
    await exportWorkoutsCsv();
    await exportMeasurementsCsv();
    await exportBackupJson();

    expect(Sharing.shareAsync).toHaveBeenCalledTimes(3);
  });

  it('preserves plate equipment in manual and Android auto backup payloads', async () => {
    const plateExerciseRow = {
      id: 'exercise-plate-1',
      slug: 'plate-pinch-hold',
      name: 'Pinça com anilhas',
      muscle_group: 'forearms',
      secondary_muscles_json: '[]',
      equipment: 'plate',
      modality: 'strength',
    };
    (getTableRows as jest.Mock).mockImplementation((tableName: string) =>
      tableName === 'exercises' ? [plateExerciseRow] : [],
    );

    const manualBackupUri = await exportBackupJson();
    const manualBackup = JSON.parse(await new File(manualBackupUri).text());

    await writeAutoBackupSnapshot();
    const autoBackupFile = new File('file:///mock-documents/frog-auto-backup/frog-backup-v1.json');
    const autoBackup = JSON.parse(await autoBackupFile.text());

    expectEssentialBackupTables(manualBackup);
    expectEssentialBackupTables(autoBackup);
    expect(manualBackup.tables.exercises).toEqual([expect.objectContaining({ equipment: 'plate' })]);
    expect(autoBackup.tables.exercises).toEqual([expect.objectContaining({ equipment: 'plate' })]);
  });

  it('creates and removes the Android auto backup payload only after opt-in', async () => {
    const rowsByTable: Record<string, Record<string, unknown>[]> = {
      users: [{ id: 'user-1', display_name: 'Frog Athlete' }],
      user_preferences: [
        {
          id: 'prefs-1',
          auto_backup_enabled: 1,
          auto_backup_last_exported_at: null,
        },
      ],
      workouts: [{ id: 'workout-1', title: 'Treino A' }],
      workout_media: [
        {
          id: 'media-1',
          workout_id: 'workout-1',
          local_uri: 'file:///mock-documents/workout-media/workout-1/photo.jpg',
          thumbnail_uri: 'file:///mock-documents/workout-media/workout-1/thumb.jpg',
          media_type: 'photo',
          file_name: 'photo.jpg',
          file_size_bytes: 1234,
        },
      ],
      audit_logs: [
        {
          id: 'audit-media',
          entity_type: 'workout_media',
          payload_json: '{"mediaType":"photo","localUri":"file:///mock-documents/workout-media/workout-1/photo.jpg"}',
        },
      ],
      import_jobs: [
        {
          id: 'import-history',
          file_name: 'old-import.csv',
          summary_json: '{"source":"import-history"}',
        },
      ],
      sync_queue_items: [
        {
          id: 'sync-queue',
          entity_type: 'workouts',
          payload_json: '{"queue":"sync-queue"}',
        },
      ],
      exercise_history_snapshots: [
        {
          id: 'snapshot-1',
          exercise_id: 'exercise-1',
          payload_json: '{"snapshot":"history"}',
        },
      ],
      analytics_daily: [{ day_key: '2026-03-27', payload_json: '{"analytics":"analytics-cache"}' }],
      muscle_period_snapshots: [{ id: 'muscle-snapshot', payload_json: '{"snapshot":"muscle"}' }],
      monthly_reports: [{ month_key: '2026-03', payload_json: '{"report":"monthly-report"}' }],
      yearly_reviews: [{ year_key: '2026', payload_json: '{"report":"yearly-review"}' }],
    };
    (getTableRows as jest.Mock).mockImplementation((tableName: string) => rowsByTable[tableName] ?? []);

    const enabledStatus = await setAutoBackupEnabled(true);
    const backupFile = new File('file:///mock-documents/frog-auto-backup/frog-backup-v1.json');
    const backupContent = await backupFile.text();
    const backup = JSON.parse(backupContent);

    expect(enabledStatus.enabled).toBe(true);
    expect(backupFile.exists).toBe(true);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE user_preferences'),
      1,
      expect.any(String),
      expect.any(String),
      'prefs-1',
    );
    expectEssentialBackupTables(backup);
    expect(backupContent).toContain('"users"');
    expect(backupContent).toContain('"workouts"');
    excludedBackupTables.forEach((tableName) => {
      expect(backupContent).not.toContain(`"${tableName}"`);
    });
    excludedBackupPayloadFragments.forEach((fragment) => {
      expect(backupContent).not.toContain(fragment);
    });

    const disabledStatus = await setAutoBackupEnabled(false);

    expect(disabledStatus.enabled).toBe(false);
    expect(backupFile.exists).toBe(false);
  });

  it('reviews backup exercise rows before restoring and refreshing the Android auto backup snapshot', async () => {
    const plateExerciseRow = {
      id: 'exercise-plate-restore',
      created_at: '2026-03-27T10:00:00.000Z',
      updated_at: '2026-03-27T10:00:00.000Z',
      deleted_at: null,
      version: 1,
      schema_version: 3,
      remote_id: null,
      sync_state: 'local_only',
      last_exported_at: null,
      origin_device_id: 'device-1',
      slug: 'plate-pinch-hold',
      name: 'Pinça com anilhas',
      muscle_group: 'forearms',
      secondary_muscles_json: '[]',
      equipment: 'plate',
      modality: 'strength',
      is_custom: 1,
      instructions: 'Segure as anilhas pela borda.',
    };
    (getUserPreferences as jest.Mock).mockReturnValue({
      id: 'prefs-1',
      auto_backup_enabled: 1,
      auto_backup_last_exported_at: '2026-03-27T10:00:00.000Z',
    });
    (getTableRows as jest.Mock).mockImplementation((tableName: string) =>
      tableName === 'exercises' ? [plateExerciseRow] : [],
    );
    let currentSummary: Record<string, unknown> | null = null;
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_backup_json',
          file_name: 'frog-backup-v1.json',
          status: 'pending_review',
          summary_json: JSON.stringify(currentSummary),
        };
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return value === 'exercise-plate-restore' ? { id: 'exercise-plate-restore' } : null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE slug = ? LIMIT 1')) {
        return null;
      }
      return null;
    });
    (database.runSync as jest.Mock).mockImplementation((sql: string, ...params: unknown[]) => {
      if (String(sql).includes('INSERT INTO import_jobs')) {
        currentSummary = JSON.parse(params[7] as string);
      }
    });

    const result = restoreBackupTextForTests(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        deviceId: 'device-1',
        tables: {
          exercises: [plateExerciseRow],
        },
      }),
    );

    expect(result.status).toBe('pending_review');
    expect(clearTable).not.toHaveBeenCalled();
    expect(insertRow).not.toHaveBeenCalled();

    const restored = saveImportReview(result.reviewJobId!, { allowUnresolved: true });
    const autoBackup = JSON.parse(await new File('file:///mock-documents/frog-auto-backup/frog-backup-v1.json').text());

    expect(restored.status).toBe('success');
    expect(insertRow).toHaveBeenCalledWith(
      'exercises',
      expect.not.objectContaining({ is_archived: expect.anything() }),
    );
    expect(insertRow).toHaveBeenCalledWith('exercises', expect.objectContaining({ equipment: 'plate' }));
    expect(autoBackup.tables.exercises).toEqual([expect.objectContaining({ equipment: 'plate' })]);
  });

  it('syncs the Android auto backup payload only when the preference is enabled', async () => {
    (getUserPreferences as jest.Mock).mockReturnValueOnce({
      id: 'prefs-1',
      auto_backup_enabled: 0,
      auto_backup_last_exported_at: null,
    });

    await expect(syncAutoBackupSnapshotIfEnabled()).resolves.toEqual({
      enabled: false,
      lastUpdatedAt: null,
      fileSizeBytes: 0,
    });
    expect(getTableRows).not.toHaveBeenCalled();

    (getUserPreferences as jest.Mock).mockReturnValue({
      id: 'prefs-1',
      auto_backup_enabled: 1,
      auto_backup_last_exported_at: null,
    });

    await syncAutoBackupSnapshotIfEnabled();

    expect(new File('file:///mock-documents/frog-auto-backup/frog-backup-v1.json').exists).toBe(true);
  });

  it('reports and refreshes Android auto backup status from local preferences', async () => {
    (getUserPreferences as jest.Mock).mockReturnValue({
      id: 'prefs-1',
      auto_backup_enabled: 1,
      auto_backup_last_exported_at: '2026-03-27T10:00:00.000Z',
    });

    expect(getAutoBackupStatus()).toEqual({
      enabled: true,
      lastUpdatedAt: '2026-03-27T10:00:00.000Z',
      fileSizeBytes: 0,
    });

    const refreshedStatus = await writeAutoBackupSnapshot();

    expect(refreshedStatus.enabled).toBe(true);
    expect(refreshedStatus.lastUpdatedAt).toEqual(expect.any(String));
    expect(refreshedStatus.fileSizeBytes).toBeGreaterThan(0);
  });

  it('decodes imported UTF-8 bytes with accents without mojibake', () => {
    const bytes = new TextEncoder().encode('Elevação lateral\nTríceps corda\nTreino rápido');

    expect(decodeUtf8TextForTests(bytes)).toBe('Elevação lateral\nTríceps corda\nTreino rápido');
  });

  it('decodes imported UTF-8 bytes without depending on the runtime TextDecoder', () => {
    const originalTextDecoder = globalThis.TextDecoder;
    const bytes = new TextEncoder().encode('Elevação lateral\nTríceps corda\nTreino rápido');

    try {
      (globalThis as unknown as { TextDecoder?: typeof TextDecoder }).TextDecoder = undefined;

      expect(decodeUtf8TextForTests(bytes)).toBe('Elevação lateral\nTríceps corda\nTreino rápido');
    } finally {
      (globalThis as unknown as { TextDecoder?: typeof TextDecoder }).TextDecoder = originalTextDecoder;
    }
  });

  it('removes UTF-8 BOM before CSV parsing sees the header row', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('workout_id,exercise_name\n1,Remada')]);

    expect(decodeUtf8TextForTests(bytes)).toBe('workout_id,exercise_name\n1,Remada');
  });

  it('repairs conservative UTF-8 mojibake from text fallbacks', () => {
    expect(repairUtf8MojibakeForTests('ElevaÃ§Ã£o lateral\nTrÃ­ceps corda\nTreino rÃ¡pido')).toBe(
      'Elevação lateral\nTríceps corda\nTreino rápido',
    );
  });

  it('exports one completed workout CSV by id for sharing', async () => {
    const workoutRow = Object.fromEntries(
      workoutCsvHeaders.map((header) => [
        header,
        {
          workout_id: 'workout-1',
          workout_title: 'Treino A',
          workout_started_at: '2026-03-27T10:00:00.000Z',
          workout_ended_at: '2026-03-27T10:30:00.000Z',
          workout_duration_seconds: 1800,
          workout_status: 'completed',
          workout_source: 'empty',
          workout_note: '',
          workout_exercise_id: 'we-1',
          exercise_id: 'exercise-1',
          exercise_name: 'Supino reto',
          exercise_sort_order: 0,
          exercise_note: '',
          rest_seconds: 90,
          previous_performance: '',
          superset_group: '',
          muscle_group: 'chest',
          secondary_muscles_json: '["triceps"]',
          equipment: 'barbell',
          modality: 'strength',
          instructions: 'Mantenha escápulas firmes.',
          set_id: 'set-1',
          set_index: 0,
          set_type: 'normal',
          reps: 8,
          weight_kg: 60,
          duration_seconds: null,
          distance_meters: null,
          speed: null,
          elevation: null,
          rpe: null,
          is_completed: 1,
        }[header],
      ]),
    );
    (database.getAllSync as jest.Mock).mockReturnValueOnce([workoutRow]);

    const uri = await exportWorkoutCsv('workout-1');
    const content = await new File(uri).text();

    expect(database.getAllSync).toHaveBeenCalledWith(expect.stringContaining('w.id = ?'), 'workout-1');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'text/csv' }));
    expect(content.split('\n')[0]).toBe(workoutCsvHeaders.join(','));
    expect(content).toContain('workout-1');
    expect(content).toContain('Supino reto');
    expect(content).toContain('triceps');
    expect(content).toContain('barbell');
    expect(content).toContain('Mantenha escápulas firmes.');
  });

  it('exports selected completed workouts CSV by id list', async () => {
    const selectedRow = Object.fromEntries(
      workoutCsvHeaders.map((header) => [
        header,
        {
          workout_id: 'workout-2',
          workout_title: 'Treino B',
          workout_started_at: '2026-03-28T10:00:00.000Z',
          workout_ended_at: '2026-03-28T10:30:00.000Z',
          workout_duration_seconds: 1800,
          workout_status: 'completed',
          workout_source: 'routine',
          workout_note: '',
          workout_exercise_id: 'we-2',
          exercise_id: 'exercise-2',
          exercise_name: 'Puxada alta',
          exercise_sort_order: 0,
          exercise_note: '',
          rest_seconds: 60,
          previous_performance: '',
          superset_group: '',
          muscle_group: 'back',
          secondary_muscles_json: '["biceps"]',
          equipment: 'machine',
          modality: 'strength',
          instructions: 'Puxar com controle.',
          set_id: 'set-2',
          set_index: 0,
          set_type: 'normal',
          reps: 10,
          weight_kg: 45,
          duration_seconds: null,
          distance_meters: null,
          speed: null,
          elevation: null,
          rpe: null,
          is_completed: 1,
        }[header],
      ]),
    );
    (database.getAllSync as jest.Mock).mockReturnValueOnce([selectedRow]);

    const uri = await exportWorkoutsCsv({ workoutIds: ['workout-2'] });
    const content = await new File(uri).text();

    expect(database.getAllSync).toHaveBeenCalledWith(expect.stringContaining('w.id IN (?)'), 'workout-2');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'text/csv' }));
    expect(content).toContain('workout-2');
    expect(content).toContain('Puxada alta');
    expect(content).not.toContain('workout-1');
  });

  it('does not share selected workouts when the selection has no exportable rows', async () => {
    (database.getAllSync as jest.Mock).mockReturnValueOnce([]);

    await expect(exportWorkoutsCsv({ workoutIds: ['missing-workout'] })).rejects.toThrow(
      'Nenhum treino encontrado para exportar.',
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('does not share an individual workout when there are no exportable set rows', async () => {
    (database.getAllSync as jest.Mock).mockReturnValueOnce([]);

    await expect(exportWorkoutCsv('workout-empty')).rejects.toThrow('Este treino ainda não tem séries para compartilhar.');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('exports one saved routine JSON with ordered exercises for sharing', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM routines r')) {
        return {
          id: 'routine-1',
          name: 'Upper Blue',
          description: 'Peito e costas',
          source: 'custom',
          estimated_minutes: 45,
          folder_name: 'Push',
        };
      }

      return null;
    });
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM routine_exercises re')) {
        return [
          {
            id: 're-1',
            exercise_id: 'exercise-1',
            target_sets: 4,
            target_reps_label: '8-10',
            rest_seconds: 90,
            cardio_duration_seconds: null,
            cardio_distance_meters: null,
            cardio_speed: null,
            cardio_elevation: null,
            note: 'controlar descida',
            private_link: 'https://exemplo.local/supino',
            superset_group: 'A',
            warmup_enabled: 1,
            exercise_slug: 'plate-pinch-hold',
            exercise_name: 'Pinça com anilhas',
            muscle_group: 'forearms',
            secondary_muscles_json: '["biceps"]',
            equipment: 'plate',
            modality: 'strength',
            is_custom: 1,
            instructions: 'Segure as anilhas pela borda.',
          },
        ];
      }

      return [];
    });

    const uri = await exportRoutineJson('routine-1');
    const content = JSON.parse(await new File(uri).text());

    expect(database.getFirstSync).toHaveBeenCalledWith(expect.stringContaining('FROM routines r'), 'routine-1');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'application/json' }));
    expect(content).toEqual(
      expect.objectContaining({
        kind: 'frog_routine',
        version: 1,
        routine: expect.objectContaining({
          id: 'routine-1',
          name: 'Upper Blue',
          folderName: 'Push',
          exercises: [
            expect.objectContaining({
              targetSets: 4,
              targetRepsLabel: '8-10',
              warmupEnabled: true,
              exercise: expect.objectContaining({
                id: 'exercise-1',
                slug: 'plate-pinch-hold',
                name: 'Pinça com anilhas',
                secondaryMuscles: ['biceps'],
                equipment: 'plate',
              }),
            }),
          ],
        }),
      }),
    );
  });

  it('exports all active saved routines as a batch JSON', async () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string, routineId?: string) => {
      if (sql.includes('SELECT id') && sql.includes('FROM routines') && !sql.includes('FROM routines r')) {
        return [{ id: 'routine-1' }, { id: 'routine-2' }];
      }

      if (sql.includes('FROM routine_exercises re') && routineId === 'routine-1') {
        return [
          {
            id: 're-1',
            exercise_id: 'exercise-1',
            target_sets: 4,
            target_reps_label: '8-10',
            rest_seconds: 90,
            cardio_duration_seconds: null,
            cardio_distance_meters: null,
            cardio_speed: null,
            cardio_elevation: null,
            note: '',
            private_link: '',
            superset_group: '',
            warmup_enabled: 0,
            exercise_slug: 'supino-reto',
            exercise_name: 'Supino reto',
            muscle_group: 'chest',
            secondary_muscles_json: '[]',
            equipment: 'barbell',
            modality: 'strength',
            is_custom: 0,
            instructions: '',
          },
        ];
      }

      if (sql.includes('FROM routine_exercises re') && routineId === 'routine-2') {
        return [
          {
            id: 're-2',
            exercise_id: 'exercise-2',
            target_sets: 3,
            target_reps_label: '12',
            rest_seconds: 60,
            cardio_duration_seconds: null,
            cardio_distance_meters: null,
            cardio_speed: null,
            cardio_elevation: null,
            note: '',
            private_link: '',
            superset_group: '',
            warmup_enabled: 1,
            exercise_slug: 'plate-pinch-hold',
            exercise_name: 'Pinça com anilhas',
            muscle_group: 'forearms',
            secondary_muscles_json: '["biceps"]',
            equipment: 'plate',
            modality: 'strength',
            is_custom: 1,
            instructions: 'Segure as anilhas pela borda.',
          },
        ];
      }

      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, routineId?: string) => {
      if (sql.includes('FROM routines r') && routineId === 'routine-1') {
        return {
          id: 'routine-1',
          name: 'Upper Blue',
          description: '',
          source: 'custom',
          estimated_minutes: 45,
          folder_name: 'Push',
        };
      }

      if (sql.includes('FROM routines r') && routineId === 'routine-2') {
        return {
          id: 'routine-2',
          name: 'Pull Blue',
          description: '',
          source: 'custom',
          estimated_minutes: 40,
          folder_name: 'Pull',
        };
      }

      return null;
    });

    const uri = await exportRoutinesJson();
    const content = JSON.parse(await new File(uri).text());

    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'application/json' }));
    expect(content).toEqual(
      expect.objectContaining({
        kind: 'frog_routines',
        version: 1,
        routines: [
          expect.objectContaining({ id: 'routine-1', name: 'Upper Blue', folderName: 'Push' }),
          expect.objectContaining({
            id: 'routine-2',
            name: 'Pull Blue',
            folderName: 'Pull',
            exercises: [
              expect.objectContaining({
                exercise: expect.objectContaining({
                  equipment: 'plate',
                }),
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('exports only selected saved routines as a batch JSON', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, routineId?: string) => {
      if (sql.includes('FROM routines r') && routineId === 'routine-2') {
        return {
          id: 'routine-2',
          name: 'Pull Blue',
          description: '',
          source: 'custom',
          estimated_minutes: 40,
          folder_name: 'Pull',
        };
      }

      return null;
    });
    (database.getAllSync as jest.Mock).mockImplementation((sql: string, routineId?: string) => {
      if (sql.includes('FROM routine_exercises re') && routineId === 'routine-2') {
        return [
          {
            id: 're-2',
            exercise_id: 'exercise-2',
            target_sets: 3,
            target_reps_label: '12',
            rest_seconds: 60,
            cardio_duration_seconds: null,
            cardio_distance_meters: null,
            cardio_speed: null,
            cardio_elevation: null,
            note: '',
            private_link: '',
            superset_group: '',
            warmup_enabled: 0,
            exercise_slug: 'puxada-alta',
            exercise_name: 'Puxada alta',
            muscle_group: 'back',
            secondary_muscles_json: '[]',
            equipment: 'machine',
            modality: 'strength',
            is_custom: 0,
            instructions: '',
          },
        ];
      }

      return [];
    });

    const uri = await exportRoutinesJson({ routineIds: ['routine-2'] });
    const content = JSON.parse(await new File(uri).text());

    expect(content.routines).toHaveLength(1);
    expect(content.routines[0].id).toBe('routine-2');
    expect(content.routines[0].name).toBe('Pull Blue');
  });

  it('does not export a batch when there are no saved routines', async () => {
    (database.getAllSync as jest.Mock).mockReturnValue([]);
    (database.getFirstSync as jest.Mock).mockReturnValue(null);

    await expect(exportRoutinesJson()).rejects.toThrow('Nenhuma rotina encontrada para exportar.');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('does not export a missing routine JSON', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation(() => null);

    await expect(exportRoutineJson('missing-routine')).rejects.toThrow('Treino salvo não encontrado.');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('opens a pending review for a Frogs routine JSON even when exercises already exist', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routine.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routine',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routine: {
          id: 'routine-source',
          name: 'Upper importado',
          description: 'Rotina compartilhada',
          folderName: 'Push',
          exercises: [
            {
              exerciseId: 'exercise-existing',
              targetSets: 4,
              targetRepsLabel: '8-10',
              restSeconds: 90,
              cardioDurationSeconds: null,
              cardioDistanceMeters: null,
              cardioSpeed: null,
              cardioElevation: null,
              note: 'manter técnica',
              privateLink: '',
              supersetGroup: 'A',
              warmupEnabled: true,
              exercise: {
                id: 'exercise-existing',
                slug: 'supino-reto',
                name: 'Supino reto',
                muscleGroup: 'chest',
                secondaryMuscles: [],
                equipment: 'barbell',
                modality: 'strength',
                instructions: '',
                isCustom: false,
              },
            },
            {
              exerciseId: 'exercise-new',
              targetSets: 3,
              targetRepsLabel: '12',
              restSeconds: 60,
              note: '',
              privateLink: '',
              supersetGroup: '',
              warmupEnabled: false,
              exercise: {
                id: 'exercise-new',
                slug: 'rosca-alien',
                name: 'Rosca alien',
                muscleGroup: 'biceps',
                secondaryMuscles: ['forearms'],
                equipment: 'dumbbell',
                modality: 'strength',
                instructions: 'Criado pelo compartilhamento.',
                isCustom: true,
              },
            },
          ],
        },
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'upper-importado.json', mimeType: 'application/json' }],
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM exercises WHERE id = ?') && value === 'exercise-existing') {
        return { id: 'exercise-existing' };
      }
      if (sql.includes('FROM exercises WHERE id = ?') && value === 'exercise-new') {
        return { id: 'exercise-new' };
      }

      return null;
    });

    const result = await pickAndImportRoutineJson();

    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'upper-importado.json',
        status: 'pending_review',
        insertedCount: 1,
        skippedCount: 0,
        errors: [],
        reviewJobId: importJobCall[1],
      }),
    );
    expect(database.runSync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO routines'), expect.any(String), expect.any(String), expect.any(String), null, expect.any(Number), expect.any(Number), null, expect.any(String), null, expect.any(String), expect.any(String), 'Upper importado', 'Rotina compartilhada', 'copied', expect.any(Number), 1);
    expect(summary.routineExerciseIds).toHaveLength(2);
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        routineExerciseIds: [expect.any(String)],
        status: 'pending',
      }),
      expect.objectContaining({
        importedName: 'Rosca alien',
        routineExerciseIds: [expect.any(String)],
        status: 'pending',
      }),
    ]);
  });

  it('auto-matches exact standard Frogs routine exercises and points routine rows to the existing base exercise', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routine-match.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routine',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routine: {
          id: 'routine-source',
          name: 'Upper match',
          description: '',
          folderName: 'Push',
          exercises: [
            {
              exerciseId: 'exercise-imported-supino',
              targetSets: 4,
              targetRepsLabel: '8-10',
              restSeconds: 90,
              note: '',
              privateLink: '',
              supersetGroup: '',
              warmupEnabled: false,
              exercise: {
                id: 'exercise-imported-supino',
                slug: 'supino-importado',
                name: 'Supino reto',
                muscleGroup: 'chest',
                secondaryMuscles: ['triceps'],
                equipment: 'barbell',
                modality: 'strength',
                instructions: 'Mantenha escápulas firmes.',
                isCustom: false,
              },
            },
          ],
        },
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'upper-match.json', mimeType: 'application/json' }],
    });
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return [createExerciseRow()];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('FROM exercises WHERE id = ?')) {
        return null;
      }
      return null;
    });

    const result = await pickAndImportRoutineJson();
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);
    const routineExerciseInsert = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO routine_exercises'),
    );

    expect(result).toEqual(expect.objectContaining({ status: 'pending_review' }));
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        status: 'auto_matched',
        differenceCount: 0,
        matchedExerciseId: 'exercise-existing-supino',
        resolvedExerciseId: 'exercise-existing-supino',
      }),
    ]);
    expect(routineExerciseInsert[12]).toBe('exercise-existing-supino');
  });

  it('keeps exact custom Frogs routine exercise matches visible for review', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routine-custom-match.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routine',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routine: {
          id: 'routine-source',
          name: 'Upper custom match',
          description: '',
          folderName: 'Push',
          exercises: [
            {
              exerciseId: 'exercise-imported-supino',
              targetSets: 4,
              targetRepsLabel: '8-10',
              restSeconds: 90,
              note: '',
              privateLink: '',
              supersetGroup: '',
              warmupEnabled: false,
              exercise: {
                id: 'exercise-imported-supino',
                slug: 'supino-importado',
                name: 'Supino reto',
                muscleGroup: 'chest',
                secondaryMuscles: ['triceps'],
                equipment: 'barbell',
                modality: 'strength',
                instructions: 'Mantenha escápulas firmes.',
                isCustom: true,
              },
            },
          ],
        },
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'upper-custom-match.json', mimeType: 'application/json' }],
    });
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return [createExerciseRow()];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('FROM exercises WHERE id = ?')) {
        return null;
      }
      return null;
    });

    await pickAndImportRoutineJson();

    const importJobCall = getLastImportJobInsertCall();
    const summary = JSON.parse(importJobCall[8]);

    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        status: 'matched',
        differenceCount: 0,
        matchedExerciseId: 'exercise-existing-supino',
        resolvedExerciseId: 'exercise-existing-supino',
      }),
    ]);
  });

  it('imports a Frogs routines batch JSON with multiple saved workouts', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routines.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routines',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routines: [
          {
            id: 'routine-source-1',
            name: 'Upper importado',
            description: '',
            folderName: 'Push',
            exercises: [
              {
                exerciseId: 'exercise-existing',
                targetSets: 4,
                targetRepsLabel: '8-10',
                restSeconds: 90,
                note: '',
                privateLink: '',
                supersetGroup: '',
                warmupEnabled: false,
                exercise: {
                  id: 'exercise-existing',
                  slug: 'supino-reto',
                  name: 'Supino reto',
                  muscleGroup: 'chest',
                  secondaryMuscles: [],
                  equipment: 'barbell',
                  modality: 'strength',
                  instructions: '',
                  isCustom: false,
                },
              },
            ],
          },
          {
            id: 'routine-source-2',
            name: 'Pull importado',
            description: '',
            folderName: 'Pull',
            exercises: [
              {
                exerciseId: 'exercise-existing',
                targetSets: 3,
                targetRepsLabel: '12',
                restSeconds: 60,
                note: '',
                privateLink: '',
                supersetGroup: '',
                warmupEnabled: false,
                exercise: {
                  id: 'exercise-existing',
                  slug: 'supino-reto',
                  name: 'Supino reto',
                  muscleGroup: 'chest',
                  secondaryMuscles: [],
                  equipment: 'barbell',
                  modality: 'strength',
                  instructions: '',
                  isCustom: false,
                },
              },
            ],
          },
        ],
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'rotinas.json', mimeType: 'application/json' }],
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM exercises WHERE id = ?') && value === 'exercise-existing') {
        return { id: 'exercise-existing' };
      }

      return null;
    });

    const result = await pickAndImportRoutineJson();
    const insertedRoutineCalls = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO routines'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'rotinas.json',
        status: 'pending_review',
        insertedCount: 2,
        skippedCount: 0,
        errors: [],
      }),
    );
    expect(insertedRoutineCalls).toHaveLength(2);
  });

  it('opens a pending review for Frogs routines batch imports with unknown exercises', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routines-review.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routines',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routines: [
          {
            id: 'routine-source-1',
            name: 'Upper com revisão',
            description: '',
            folderName: 'Push',
            exercises: [
              {
                exerciseId: 'exercise-new',
                targetSets: 3,
                targetRepsLabel: '12',
                restSeconds: 60,
                note: '',
                privateLink: '',
                supersetGroup: '',
                warmupEnabled: false,
                exercise: {
                  id: 'exercise-new',
                  slug: 'rosca-alien',
                  name: 'Rosca alien',
                  muscleGroup: 'biceps',
                  secondaryMuscles: ['forearms'],
                  equipment: 'dumbbell',
                  modality: 'strength',
                  instructions: 'Criado pelo compartilhamento.',
                  isCustom: true,
                },
              },
            ],
          },
          {
            id: 'routine-source-2',
            name: 'Pull com revisão',
            description: '',
            folderName: 'Pull',
            exercises: [
              {
                exerciseId: 'exercise-new',
                targetSets: 2,
                targetRepsLabel: '15',
                restSeconds: 45,
                note: '',
                privateLink: '',
                supersetGroup: '',
                warmupEnabled: false,
                exercise: {
                  id: 'exercise-new',
                  slug: 'rosca-alien',
                  name: 'Rosca alien',
                  muscleGroup: 'biceps',
                  secondaryMuscles: ['forearms'],
                  equipment: 'dumbbell',
                  modality: 'strength',
                  instructions: 'Criado pelo compartilhamento.',
                  isCustom: true,
                },
              },
            ],
          },
        ],
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'rotinas-revisao.json', mimeType: 'application/json' }],
    });
    (database.getFirstSync as jest.Mock).mockImplementation(() => null);

    const result = await pickAndImportRoutineJson();
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'rotinas-revisao.json',
        status: 'pending_review',
        insertedCount: 2,
        reviewJobId: importJobCall[1],
      }),
    );
    expect(summary.routineIds).toHaveLength(2);
    expect(summary.routineExerciseIds).toHaveLength(2);
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Rosca alien',
        routineExerciseIds: [expect.any(String), expect.any(String)],
        status: 'pending',
      }),
    ]);
  });

  it('opens a pending review for routine JSON imports with unknown exercises', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routine-review.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routine',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routine: {
          id: 'routine-source',
          name: 'Upper com revisão',
          description: 'Rotina compartilhada',
          folderName: 'Push',
          exercises: [
            {
              exerciseId: 'exercise-existing',
              targetSets: 4,
              targetRepsLabel: '8-10',
              restSeconds: 90,
              note: '',
              privateLink: '',
              supersetGroup: '',
              warmupEnabled: false,
              exercise: {
                id: 'exercise-existing',
                slug: 'supino-reto',
                name: 'Supino reto',
                muscleGroup: 'chest',
                secondaryMuscles: [],
                equipment: 'barbell',
                modality: 'strength',
                instructions: '',
                isCustom: false,
              },
            },
            {
              exerciseId: 'exercise-new',
              targetSets: 3,
              targetRepsLabel: '12',
              restSeconds: 60,
              note: '',
              privateLink: '',
              supersetGroup: '',
              warmupEnabled: false,
              exercise: {
                id: 'exercise-new',
                slug: 'rosca-alien',
                name: 'Rosca alien',
                muscleGroup: 'biceps',
                secondaryMuscles: ['forearms'],
                equipment: 'dumbbell',
                modality: 'strength',
                instructions: 'Criado pelo compartilhamento.',
                isCustom: true,
              },
            },
          ],
        },
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'upper-revisao.json', mimeType: 'application/json' }],
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM exercises WHERE id = ?') && value === 'exercise-existing') {
        return { id: 'exercise-existing' };
      }

      return null;
    });

    const result = await pickAndImportRoutineJson();
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'upper-revisao.json',
        status: 'pending_review',
        insertedCount: 1,
        reviewJobId: importJobCall[1],
      }),
    );
    expect(database.runSync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO routines'), expect.any(String), expect.any(String), expect.any(String), null, expect.any(Number), expect.any(Number), null, expect.any(String), null, expect.any(String), expect.any(String), 'Upper com revisão', 'Rotina compartilhada', 'copied', expect.any(Number), 1);
    expect(summary.routineIds).toEqual([expect.any(String)]);
    expect(summary.routineExerciseIds).toEqual([expect.any(String), expect.any(String)]);
    expect(summary.createdRoutineFolderIds).toEqual([expect.any(String)]);
    expect(summary.placeholderExerciseIds).toEqual([expect.any(String), expect.any(String)]);
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        placeholderExerciseId: expect.any(String),
        workoutExerciseIds: [],
        routineExerciseIds: [expect.any(String)],
        status: 'pending',
      }),
      expect.objectContaining({
        importedName: 'Rosca alien',
        placeholderExerciseId: expect.any(String),
        workoutExerciseIds: [],
        routineExerciseIds: [expect.any(String)],
        status: 'pending',
      }),
    ]);
  });

  it('preserves plate and falls back invalid plates equipment in Frogs routine JSON imports', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routine-plate-review.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routine',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routine: {
          id: 'routine-plate-source',
          name: 'Grip com anilhas',
          description: '',
          folderName: 'Antebraço',
          exercises: [
            {
              exerciseId: 'exercise-plate-import',
              targetSets: 3,
              targetRepsLabel: '30s',
              restSeconds: 60,
              exercise: {
                id: 'exercise-plate-import',
                slug: 'plate-pinch-hold',
                name: 'Pinça com anilhas',
                muscleGroup: 'forearms',
                secondaryMuscles: [],
                equipment: 'plate',
                modality: 'strength',
                instructions: 'Segure as anilhas pela borda.',
                isCustom: true,
              },
            },
            {
              exerciseId: 'exercise-plates-import',
              targetSets: 2,
              targetRepsLabel: '12',
              restSeconds: 45,
              exercise: {
                id: 'exercise-plates-import',
                slug: 'equipamento-plural',
                name: 'Equipamento plural',
                muscleGroup: 'forearms',
                secondaryMuscles: [],
                equipment: 'plates',
                modality: 'strength',
                instructions: '',
                isCustom: true,
              },
            },
          ],
        },
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'rotina-anilhas.json', mimeType: 'application/json' }],
    });
    (database.getFirstSync as jest.Mock).mockImplementation(() => null);

    const result = await pickAndImportRoutineJson();
    const exerciseInsertCalls = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );

    expect(result).toEqual(expect.objectContaining({ status: 'pending_review' }));
    expect(exerciseInsertCalls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['Pinça com anilhas', 'forearms', '[]', 'plate', 'strength']),
        expect.arrayContaining(['Equipamento plural', 'forearms', '[]', 'other', 'strength']),
      ]),
    );
  });

  it('preserves plate equipment in Frogs routines batch JSON imports', async () => {
    const pickedFile = new File('file:///mock-documents/picked-routines-plate-review.json');
    pickedFile.create();
    pickedFile.write(
      JSON.stringify({
        kind: 'frog_routines',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routines: [
          {
            id: 'routine-plate-batch-source',
            name: 'Antebraço importado',
            description: '',
            folderName: 'Grip',
            exercises: [
              {
                exerciseId: 'exercise-plate-batch-import',
                targetSets: 3,
                targetRepsLabel: '30s',
                restSeconds: 60,
                exercise: {
                  id: 'exercise-plate-batch-import',
                  slug: 'plate-pinch-hold',
                  name: 'Pinça com anilhas',
                  muscleGroup: 'forearms',
                  secondaryMuscles: [],
                  equipment: 'plate',
                  modality: 'strength',
                  instructions: 'Segure as anilhas pela borda.',
                  isCustom: true,
                },
              },
            ],
          },
        ],
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'rotinas-anilhas.json', mimeType: 'application/json' }],
    });
    (database.getFirstSync as jest.Mock).mockImplementation(() => null);

    const result = await pickAndImportRoutineJson();
    const exerciseInsertCalls = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );

    expect(result).toEqual(expect.objectContaining({ status: 'pending_review' }));
    expect(exerciseInsertCalls).toEqual(
      expect.arrayContaining([expect.arrayContaining(['Pinça com anilhas', 'forearms', '[]', 'plate', 'strength'])]),
    );
  });

  it('rejects invalid routine JSON without inserting a routine', async () => {
    const pickedFile = new File('file:///mock-documents/invalid-routine.json');
    pickedFile.create();
    pickedFile.write(JSON.stringify({ kind: 'frog_backup', version: 1 }));
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: pickedFile.uri, name: 'invalid-routine.json', mimeType: 'application/json' }],
    });

    const result = await pickAndImportRoutineJson();

    expect(result).toEqual(expect.objectContaining({ sourceType: 'frog_routine_json', status: 'failed', insertedCount: 0 }));
    expect(database.runSync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO routines'), expect.anything());
  });

  it('imports an external Frogs workout CSV file into pending review', async () => {
    const externalFile = new File('file:///mock-documents/external-frogs-workout.csv');
    externalFile.create();
    externalFile.write(
      toCsv([
        createWorkoutCsvRow({
          workout_id: 'workout-external-frogs-1',
          workout_title: 'Treino recebido',
          workout_exercise_id: 'we-external-frogs-1',
          exercise_id: 'exercise-external-frogs-1',
          exercise_name: 'Remada recebida',
          set_id: 'set-external-frogs-1',
        }),
      ]),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'treino-recebido.csv' });
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_workouts_csv',
        fileName: 'treino-recebido.csv',
        status: 'pending_review',
        reviewJobId: importJobCall[1],
      }),
    );
  });

  it('imports an external legacy Frogs workout CSV without new exercise metadata using safe defaults', async () => {
    const legacyRow = createWorkoutCsvRow({
      workout_id: 'workout-external-legacy-1',
      workout_title: 'Upper B',
      workout_started_at: '2026-05-06T22:21:59.214Z',
      workout_ended_at: '2026-05-06T23:36:59.214Z',
      workout_duration_seconds: '4500',
      workout_source: 'routine',
      workout_exercise_id: 'we-external-legacy-1',
      exercise_id: 'exercise-external-legacy-1',
      exercise_name: 'Remada curvada no trilho',
      muscle_group: 'back',
      set_id: 'set-external-legacy-1',
      set_type: 'warmup',
      reps: '10',
      weight_kg: '20',
    });
    delete legacyRow.secondary_muscles_json;
    delete legacyRow.equipment;
    delete legacyRow.modality;
    delete legacyRow.instructions;
    const externalFile = new File('file:///mock-documents/frog-workouts-legacy.csv');
    externalFile.create();
    externalFile.write(toCsv([legacyRow]));

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'frog-workouts-legacy.csv' });
    const exerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_workouts_csv',
        fileName: 'frog-workouts-legacy.csv',
        status: 'pending_review',
        insertedCount: 1,
      }),
    );
    expect(exerciseInsertCall).toEqual(
      expect.arrayContaining([
        'Remada curvada no trilho',
        'back',
        '[]',
        'other',
        'strength',
        'Exercicio importado localmente.',
      ]),
    );
  });

  it('copies external content URI files to cache before importing legacy Frogs workout CSVs', async () => {
    const contentUri = 'content://com.whatsapp.provider/document/frog-workouts-legacy.csv';
    const legacyRow = createWorkoutCsvRow({
      workout_id: 'workout-external-content-legacy-1',
      workout_title: 'Upper B',
      workout_started_at: '2026-05-06T22:21:59.214Z',
      workout_ended_at: '2026-05-06T23:36:59.214Z',
      workout_duration_seconds: '4500',
      workout_source: 'routine',
      workout_exercise_id: 'we-external-content-legacy-1',
      exercise_id: 'exercise-external-content-legacy-1',
      exercise_name: 'Remada curvada no trilho',
      muscle_group: 'back',
      set_id: 'set-external-content-legacy-1',
    });
    delete legacyRow.secondary_muscles_json;
    delete legacyRow.equipment;
    delete legacyRow.modality;
    delete legacyRow.instructions;
    const csvContent = toCsv([legacyRow]);
    const contentFile = new File(contentUri);
    contentFile.create();
    contentFile.write(csvContent);
    mockLegacyContentByUri.set(contentUri, csvContent);
    (contentFile as any).__setBytesFailureForTests(new Error('content bytes unavailable'));
    (contentFile as any).__setTextFailureForTests(new Error('content text unavailable'));

    const result = await importExternalDataFile({ uri: contentUri, fileName: 'frog-workouts-legacy.csv' });

    expect(LegacyFileSystem.copyAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        from: contentUri,
        to: expect.stringContaining('frog-workouts-legacy.csv'),
      }),
    );
    expect(LegacyFileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringContaining('frog-workouts-legacy.csv'), {
      idempotent: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_workouts_csv',
        fileName: 'frog-workouts-legacy.csv',
        status: 'pending_review',
        insertedCount: 1,
      }),
    );
  });

  it('imports an external Hevy CSV file into pending review', async () => {
    const externalFile = new File('file:///mock-documents/external-hevy-workout.csv');
    externalFile.create();
    externalFile.write(
      [
        'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
        'Pull,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,Puxada neutra,,,0,normal,70,10,,,',
      ].join('\n'),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'hevy.csv' });

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'hevy_csv',
        fileName: 'hevy.csv',
        status: 'pending_review',
        insertedCount: 1,
      }),
    );
  });

  it('imports an external Frogs routine JSON file into pending review', async () => {
    const externalFile = new File('file:///mock-documents/external-frogs-routine.json');
    externalFile.create();
    externalFile.write(
      JSON.stringify({
        kind: 'frog_routine',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routine: {
          id: 'routine-external-source',
          name: 'Upper recebido',
          description: '',
          folderName: 'Push',
          exercises: [
            {
              exerciseId: 'exercise-external-routine-1',
              targetSets: 3,
              targetRepsLabel: '10',
              restSeconds: 60,
              note: '',
              privateLink: '',
              supersetGroup: '',
              warmupEnabled: false,
              exercise: {
                id: 'exercise-external-routine-1',
                slug: 'remada-recebida',
                name: 'Remada recebida',
                muscleGroup: 'back',
                secondaryMuscles: ['biceps'],
                equipment: 'cable',
                modality: 'strength',
                instructions: 'Puxar com controle.',
                isCustom: true,
              },
            },
          ],
        },
      }),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'upper-recebido.json' });

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'upper-recebido.json',
        status: 'pending_review',
        insertedCount: 1,
      }),
    );
  });

  it('imports an external Frogs routines batch JSON file into pending review', async () => {
    const externalFile = new File('file:///mock-documents/external-frogs-routines.json');
    externalFile.create();
    externalFile.write(
      JSON.stringify({
        kind: 'frog_routines',
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        routines: [
          {
            id: 'routine-external-batch-source',
            name: 'Pull recebido',
            description: '',
            folderName: 'Pull',
            exercises: [
              {
                exerciseId: 'exercise-external-batch-1',
                targetSets: 3,
                targetRepsLabel: '12',
                restSeconds: 60,
                note: '',
                privateLink: '',
                supersetGroup: '',
                warmupEnabled: false,
                exercise: {
                  id: 'exercise-external-batch-1',
                  slug: 'puxada-recebida',
                  name: 'Puxada recebida',
                  muscleGroup: 'back',
                  secondaryMuscles: [],
                  equipment: 'machine',
                  modality: 'strength',
                  instructions: '',
                  isCustom: true,
                },
              },
            ],
          },
        ],
      }),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'rotinas.json' });

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'rotinas.json',
        status: 'pending_review',
        insertedCount: 1,
      }),
    );
  });

  it('restores legacy external backup JSON files while discarding extra technical tables', async () => {
    const externalFile = new File('file:///mock-documents/external-backup.json');
    externalFile.create();
    externalFile.write(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        deviceId: 'device-1',
        tables: {
          users: [{ id: 'user-from-backup' }],
          workouts: [{ id: 'workout-from-backup', title: 'Treino antigo' }],
          workout_media: [{ id: 'media-from-backup', file_name: 'photo.jpg' }],
          audit_logs: [{ id: 'audit-from-backup', entity_type: 'workouts' }],
          import_jobs: [{ id: 'import-from-backup', file_name: 'old-import.csv' }],
          analytics_daily: [{ day_key: '2026-03-27' }],
        },
      }),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'frog-backup-v1.json' });

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_backup_json',
        fileName: 'frog-backup-v1.json',
        status: 'success',
        insertedCount: 2,
        skippedCount: 0,
        errors: [],
      }),
    );
    expect(insertRow).toHaveBeenCalledWith('users', { id: 'user-from-backup' });
    expect(insertRow).toHaveBeenCalledWith('workouts', { id: 'workout-from-backup', title: 'Treino antigo' });
    expect(insertRow).not.toHaveBeenCalledWith('workout_media', expect.anything());
    expect(insertRow).not.toHaveBeenCalledWith('audit_logs', expect.anything());
    expect(insertRow).not.toHaveBeenCalledWith('import_jobs', expect.anything());
    expect(insertRow).not.toHaveBeenCalledWith('analytics_daily', expect.anything());
    expect(refreshAnalyticsCaches).toHaveBeenCalled();
  });

  it('stages external backup JSON files with exercises for review before replacing local data', async () => {
    const externalFile = new File('file:///mock-documents/external-backup-review.json');
    const backupExercise = createExerciseRow({
      id: 'exercise-backup-puxada',
      slug: 'puxada-backup',
      name: 'Puxada backup',
      muscle_group: 'back',
      equipment: 'machine',
      is_archived: 1,
    });
    externalFile.create();
    externalFile.write(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        deviceId: 'device-1',
        tables: {
          users: [{ id: 'user-from-backup' }],
          exercises: [backupExercise],
          workouts: [{ id: 'workout-from-backup', title: 'Treino antigo' }],
          workout_exercises: [{ id: 'we-from-backup', workout_id: 'workout-from-backup', exercise_id: 'exercise-backup-puxada' }],
          routine_exercises: [{ id: 're-from-backup', routine_id: 'routine-from-backup', exercise_id: 'exercise-backup-puxada' }],
          pr_records: [{ id: 'pr-from-backup', exercise_id: 'exercise-backup-puxada', metric: 'estimated_1rm' }],
          import_jobs: [{ id: 'import-from-backup', file_name: 'old-import.csv' }],
        },
      }),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'frog-backup-v1.json' });
    const importJobCall = getLastImportJobInsertCall();
    const summary = JSON.parse(importJobCall[8]);

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_backup_json',
        fileName: 'frog-backup-v1.json',
        status: 'pending_review',
        insertedCount: 6,
        skippedCount: 0,
        errors: [],
        reviewJobId: importJobCall[1],
      }),
    );
    expect(clearTable).not.toHaveBeenCalled();
    expect(insertRow).not.toHaveBeenCalled();
    expect(summary.backupRestore.exerciseIdsByGroupKey).toEqual({
      'puxada-backup': ['exercise-backup-puxada'],
    });
    expect(summary.backupRestore.envelope.tables.exercises[0]).toEqual(
      expect.not.objectContaining({ is_archived: expect.anything() }),
    );
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Puxada backup',
        status: 'pending',
        workoutExerciseIds: [],
        routineExerciseIds: [],
      }),
    ]);
  });

  it('auto-matches exact standard backup exercises and restores references to the existing base exercise', async () => {
    const externalFile = new File('file:///mock-documents/external-backup-auto-match.json');
    const backupExercise = createExerciseRow({
      id: 'exercise-backup-supino',
      slug: 'supino-backup',
      is_custom: 0,
    });
    externalFile.create();
    externalFile.write(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        deviceId: 'device-1',
        tables: {
          users: [{ id: 'user-from-backup' }],
          exercises: [backupExercise],
          workouts: [{ id: 'workout-from-backup', title: 'Treino antigo' }],
          workout_exercises: [{ id: 'we-from-backup', workout_id: 'workout-from-backup', exercise_id: 'exercise-backup-supino' }],
          routine_exercises: [{ id: 're-from-backup', routine_id: 'routine-from-backup', exercise_id: 'exercise-backup-supino' }],
          pr_records: [{ id: 'pr-from-backup', exercise_id: 'exercise-backup-supino', metric: 'estimated_1rm' }],
        },
      }),
    );
    let currentSummary: Record<string, unknown> | null = null;
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return [createExerciseRow()];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_backup_json',
          file_name: 'frog-backup-v1.json',
          status: 'pending_review',
          summary_json: JSON.stringify(currentSummary),
        };
      }
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT * FROM exercises WHERE id = ?') && value === 'exercise-existing-supino') {
        return createExerciseRow();
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return value === 'exercise-backup-supino' ? { id: 'exercise-backup-supino' } : null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE slug = ? LIMIT 1')) {
        return null;
      }
      return null;
    });
    (database.runSync as jest.Mock).mockImplementation((sql: string, ...params: unknown[]) => {
      if (String(sql).includes('INSERT INTO import_jobs')) {
        currentSummary = JSON.parse(params[7] as string);
      }
    });

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'frog-backup-v1.json' });
    const importJobCall = getLastImportJobInsertCall();
    const summary = JSON.parse(importJobCall[8]);

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_backup_json',
        status: 'pending_review',
        reviewJobId: importJobCall[1],
      }),
    );
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        status: 'auto_matched',
        differenceCount: 0,
        matchedExerciseId: 'exercise-existing-supino',
        resolvedExerciseId: 'exercise-existing-supino',
      }),
    ]);

    saveImportReview(result.reviewJobId!, { allowUnresolved: false });

    expect(insertRow).toHaveBeenCalledWith('exercises', expect.objectContaining({ id: 'exercise-existing-supino' }));
    expect(insertRow).not.toHaveBeenCalledWith('exercises', expect.objectContaining({ id: 'exercise-backup-supino' }));
    expect(insertRow).toHaveBeenCalledWith(
      'workout_exercises',
      expect.objectContaining({ id: 'we-from-backup', exercise_id: 'exercise-existing-supino' }),
    );
    expect(insertRow).toHaveBeenCalledWith(
      'routine_exercises',
      expect.objectContaining({ id: 're-from-backup', exercise_id: 'exercise-existing-supino' }),
    );
    expect(insertRow).toHaveBeenCalledWith(
      'pr_records',
      expect.objectContaining({ id: 'pr-from-backup', exercise_id: 'exercise-existing-supino' }),
    );
  });

  it('rejects external backup JSON without essential table data', async () => {
    const externalFile = new File('file:///mock-documents/external-empty-backup.json');
    externalFile.create();
    externalFile.write(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        deviceId: 'device-1',
        tables: {
          audit_logs: [{ id: 'audit-only' }],
          analytics_daily: [{ day_key: '2026-03-27' }],
        },
      }),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'frog-backup-v1.json' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        insertedCount: 0,
        skippedCount: 0,
        errors: [externalImportUnsupportedError],
      }),
    );
    expect(clearTable).not.toHaveBeenCalled();
    expect(insertRow).not.toHaveBeenCalled();
  });

  it('rejects external measurement CSV without inserting measurements', async () => {
    const externalFile = new File('file:///mock-documents/external-measurements.csv');
    externalFile.create();
    externalFile.write(
      toCsv([
        {
          measurement_id: 'measurement-external-1',
          recorded_at: '2026-03-27T10:00:00.000Z',
          weight_kg: '82',
          chest_cm: '',
          waist_cm: '',
          hips_cm: '',
          arm_cm: '',
          thigh_cm: '',
          note: '',
        },
      ]),
    );

    const result = await importExternalDataFile({ uri: externalFile.uri, fileName: 'medidas.csv' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'failed',
        insertedCount: 0,
        skippedCount: 0,
        errors: [externalImportUnsupportedError],
      }),
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO body_measurements')),
    ).toBe(false);
  });

  it('rejects unknown external CSV and JSON files without inserting data', async () => {
    const unknownCsvFile = new File('file:///mock-documents/external-unknown.csv');
    unknownCsvFile.create();
    unknownCsvFile.write('coluna\nvalor');
    const unknownJsonFile = new File('file:///mock-documents/external-unknown.json');
    unknownJsonFile.create();
    unknownJsonFile.write(JSON.stringify({ kind: 'frog_backup', version: 1 }));

    await expect(importExternalDataFile({ uri: unknownCsvFile.uri, fileName: 'unknown.csv' })).resolves.toEqual(
      expect.objectContaining({
        status: 'failed',
        errors: [externalImportUnsupportedError],
      }),
    );
    await expect(importExternalDataFile({ uri: unknownJsonFile.uri, fileName: 'unknown.json' })).resolves.toEqual(
      expect.objectContaining({
        status: 'failed',
        errors: [externalImportUnsupportedError],
      }),
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO workouts')),
    ).toBe(false);
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO routines')),
    ).toBe(false);
  });

  it('overwrites an existing export file when the same CSV is generated twice', async () => {
    const firstUri = await exportWorkoutsCsv();
    const firstFile = new File(firstUri);
    firstFile.write('conteudo-antigo');

    const secondUri = await exportWorkoutsCsv();

    await expect(new File(secondUri).text()).resolves.not.toBe('conteudo-antigo');
  });

  it('exports header-only CSV files when there is no local data and sharing is unavailable', async () => {
    (database.getAllSync as jest.Mock).mockReturnValue([]);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    const workoutsUri = await exportWorkoutsCsv();
    const measurementsUri = await exportMeasurementsCsv();

    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    await expect(new File(workoutsUri).text()).resolves.toBe(workoutCsvHeaders.join(','));
    await expect(new File(measurementsUri).text()).resolves.toBe(measurementCsvHeaders.join(','));
  });

  it('blocks empty CSV input and restores backup payloads for tests', () => {
    expect(importCsvTextForTests('', 'empty.csv')).toEqual(
      expect.objectContaining({
        status: 'failed',
        errors: ['O arquivo CSV está vazio.'],
      }),
    );

    const backup = {
      version: 1,
      exportedAt: '2026-03-27T10:00:00.000Z',
      deviceId: 'device-1',
      tables: {
        users: [{ id: 'user-1' }],
        user_preferences: [
          {
            id: 'prefs-1',
            default_workout_visibility: 'private',
            haptics_enabled: 1,
            show_rpe: 1,
            show_previous_values: 1,
            week_starts_on: 1,
          },
        ],
        workouts: [{ id: 'workout-1', visibility: 'shared', title: 'Treino A' }],
        body_measurements: [{ id: 'measurement-1', related_workout_id: 'workout-1', recorded_at: '2026-03-27T10:00:00.000Z' }],
      },
    };

    const restored = restoreBackupTextForTests(JSON.stringify(backup), 'frog-backup-v1.json');

    expect(restored.status).toBe('success');
    expect(clearTable).toHaveBeenCalled();
    expect(insertRow).toHaveBeenCalledWith('users', { id: 'user-1' });
    expect(insertRow).toHaveBeenCalledWith('user_preferences', { id: 'prefs-1', week_starts_on: 1 });
    expect(insertRow).toHaveBeenCalledWith('workouts', { id: 'workout-1', title: 'Treino A' });
    expect(insertRow).toHaveBeenCalledWith('body_measurements', { id: 'measurement-1', recorded_at: '2026-03-27T10:00:00.000Z' });
    expect(refreshAnalyticsCaches).toHaveBeenCalled();
  });

  it('restores Android auto backup payloads without recreating media rows', () => {
    const backup = {
      version: 1,
      exportedAt: '2026-03-27T10:00:00.000Z',
      deviceId: 'device-1',
      tables: {
        users: [{ id: 'user-1' }],
        workouts: [{ id: 'workout-1', title: 'Treino A' }],
        workout_media: [{ id: 'media-1', file_name: 'photo.jpg' }],
        audit_logs: [{ id: 'audit-media', entity_type: 'workout_media' }],
        import_jobs: [{ id: 'import-history', file_name: 'old-import.csv' }],
        sync_queue_items: [{ id: 'sync-queue', entity_type: 'workouts' }],
        exercise_history_snapshots: [{ id: 'snapshot-1', exercise_id: 'exercise-1' }],
        analytics_daily: [{ day_key: '2026-03-27' }],
        muscle_period_snapshots: [{ id: 'muscle-snapshot' }],
        monthly_reports: [{ month_key: '2026-03' }],
        yearly_reviews: [{ year_key: '2026' }],
      },
    };

    const restored = restoreBackupTextForTests(JSON.stringify(backup), 'frog-backup-v1.json');

    expect(restored.status).toBe('success');
    excludedBackupTables.forEach((tableName) => {
      expect(clearTable).toHaveBeenCalledWith(tableName);
      expect(insertRow).not.toHaveBeenCalledWith(tableName, expect.anything());
    });
    expect(insertRow).toHaveBeenCalledWith('users', { id: 'user-1' });
    expect(insertRow).toHaveBeenCalledWith('workouts', { id: 'workout-1', title: 'Treino A' });
    expect(refreshAnalyticsCaches).toHaveBeenCalled();
  });

  it('rejects unknown CSV formats and invalid backup payloads', () => {
    expect(importCsvTextForTests('coluna\nvalor', 'unknown.csv')).toEqual(
      expect.objectContaining({
        status: 'failed',
        errors: ['Formato de CSV não reconhecido. Use um CSV do Frogs ou um CSV exportado pelo Hevy.'],
      }),
    );

    expect(() => restoreBackupTextForTests(JSON.stringify({ version: 2 }), 'invalid.json')).toThrow();
  });

  it('imports a valid Frogs workout CSV payload into pending exercise review with full Frogs metadata', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return null;
      }
      return null;
    });

    const csv = toCsv([
      Object.fromEntries(
        workoutCsvHeaders.map((header) => [
          header,
          {
            workout_id: 'workout-import-1',
            workout_title: 'Treino importado',
            workout_started_at: '2026-03-27T10:00:00.000Z',
            workout_ended_at: '2026-03-27T10:30:00.000Z',
            workout_duration_seconds: '1800',
            workout_status: 'completed',
            workout_source: 'empty',
            workout_note: 'Bom treino',
            workout_visibility: 'private',
            workout_exercise_id: 'we-import-1',
            exercise_id: 'exercise-import-1',
            exercise_name: 'Supino reto',
            exercise_sort_order: '0',
            exercise_note: '',
            rest_seconds: '90',
            previous_performance: '',
            superset_group: '',
            muscle_group: 'chest',
            secondary_muscles_json: '["triceps"]',
            equipment: 'barbell',
            modality: 'strength',
            instructions: 'Mantenha escápulas firmes.',
            set_id: 'set-import-1',
            set_index: '0',
            set_type: 'normal',
            reps: '8',
            weight_kg: '60',
            duration_seconds: '',
            distance_meters: '',
            speed: '',
            elevation: '',
            rpe: '8',
            is_completed: '1',
          }[header] ?? '',
        ]),
      ),
    ]);

    const result = importCsvTextForTests(csv, 'frog-workouts.csv');
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);
    const exerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );

    expect(result.status).toBe('pending_review');
    expect(result.reviewJobId).toBe(importJobCall[1]);
    expect(result.insertedCount).toBe(1);
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        placeholderExerciseId: 'exercise-import-1',
        workoutExerciseIds: ['we-import-1'],
        status: 'pending',
      }),
    ]);
    expect(exerciseInsertCall).toEqual(
      expect.arrayContaining(['Supino reto', 'chest', '["triceps"]', 'barbell', 'strength', 'Mantenha escápulas firmes.']),
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      'workout-import-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      null,
      'Treino importado',
      'completed',
      'empty',
      '2026-03-27T10:00:00.000Z',
      '2026-03-27T10:30:00.000Z',
      1800,
      'Bom treino',
      0,
      0,
      0,
    );
  });

  it('preserves plate as known equipment when importing Frogs workout CSV metadata', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return null;
      }
      return null;
    });

    const result = importCsvTextForTests(
      toCsv([
        createWorkoutCsvRow({
          workout_id: 'workout-plate-import-1',
          workout_exercise_id: 'we-plate-import-1',
          exercise_id: 'exercise-plate-import-1',
          exercise_name: 'Pinça com anilhas',
          muscle_group: 'forearms',
          secondary_muscles_json: '[]',
          equipment: 'plate',
          set_id: 'set-plate-import-1',
        }),
      ]),
      'frog-workouts-plate.csv',
    );
    const exerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );

    expect(result.status).toBe('pending_review');
    expect(exerciseInsertCall).toEqual(
      expect.arrayContaining(['Pinça com anilhas', 'forearms', '[]', 'plate', 'strength']),
    );
  });

  it('falls back invalid plural plates equipment to other during import', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return null;
      }
      return null;
    });

    const result = importCsvTextForTests(
      toCsv([
        createWorkoutCsvRow({
          workout_id: 'workout-plates-import-1',
          workout_exercise_id: 'we-plates-import-1',
          exercise_id: 'exercise-plates-import-1',
          exercise_name: 'Equipamento estranho',
          equipment: 'plates',
          set_id: 'set-plates-import-1',
        }),
      ]),
      'frog-workouts-plates.csv',
    );
    const exerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );

    expect(result.status).toBe('pending_review');
    expect(exerciseInsertCall).toEqual(
      expect.arrayContaining(['Equipamento estranho', 'back', '["biceps"]', 'other', 'strength']),
    );
  });

  it('imports an old Frogs workout CSV without exercise metadata using safe review defaults', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return null;
      }
      return null;
    });

    const legacyRow = createWorkoutCsvRow({
      workout_id: 'workout-legacy-import-1',
      workout_exercise_id: 'we-legacy-import-1',
      exercise_id: 'exercise-legacy-import-1',
      exercise_name: 'Crucifixo legado',
      muscle_group: 'chest',
      set_id: 'set-legacy-import-1',
    });
    delete legacyRow.secondary_muscles_json;
    delete legacyRow.equipment;
    delete legacyRow.modality;
    delete legacyRow.instructions;

    const result = importCsvTextForTests(toCsv([legacyRow]), 'frog-workouts-old.csv');
    const exerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );

    expect(result.status).toBe('pending_review');
    expect(exerciseInsertCall).toEqual(
      expect.arrayContaining(['Crucifixo legado', 'chest', '[]', 'other', 'strength', 'Exercicio importado localmente.']),
    );
  });

  it('imports multiple Frogs rows for the same workout and keeps incomplete sets without completion timestamps', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE lower(slug)')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE lower(name)')) {
        return { id: 'existing-name-match' };
      }
      return null;
    });

    const csv = toCsv([
      {
        workout_id: 'workout-import-3',
        workout_title: 'Treino importado em blocos',
        workout_started_at: '2026-03-27T10:00:00.000Z',
        workout_ended_at: '',
        workout_duration_seconds: '1800',
        workout_status: 'in_progress',
        workout_source: 'empty',
        workout_note: '',
        workout_visibility: 'private',
        workout_exercise_id: 'we-import-3a',
        exercise_id: 'exercise-import-3',
        exercise_name: 'Rosca direta',
        exercise_sort_order: '0',
        exercise_note: '',
        rest_seconds: '90',
        previous_performance: '',
        superset_group: '',
        muscle_group: 'biceps',
        set_id: 'set-import-3a',
        set_index: '0',
        set_type: 'normal',
        reps: '10',
        weight_kg: '20',
        duration_seconds: '',
        distance_meters: '',
        speed: '',
        elevation: '',
        rpe: '',
        is_completed: '0',
      },
      {
        workout_id: 'workout-import-3',
        workout_title: 'Treino importado em blocos',
        workout_started_at: '2026-03-27T10:00:00.000Z',
        workout_ended_at: '',
        workout_duration_seconds: '1800',
        workout_status: 'in_progress',
        workout_source: 'empty',
        workout_note: '',
        workout_visibility: 'private',
        workout_exercise_id: 'we-import-3b',
        exercise_id: 'exercise-import-3',
        exercise_name: 'Rosca direta',
        exercise_sort_order: '1',
        exercise_note: '',
        rest_seconds: '90',
        previous_performance: '',
        superset_group: '',
        muscle_group: 'biceps',
        set_id: 'set-import-3b',
        set_index: '1',
        set_type: 'failure',
        reps: '8',
        weight_kg: '22',
        duration_seconds: '',
        distance_meters: '',
        speed: '',
        elevation: '',
        rpe: '',
        is_completed: '0',
      },
    ]);

    const result = importCsvTextForTests(csv, 'frog-workouts-multi.csv');

    expect(result).toEqual(
      expect.objectContaining({
        status: 'pending_review',
        insertedCount: 2,
        skippedCount: 0,
      }),
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO workouts')).length,
    ).toBe(1);
    expect(
      (database.runSync as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO set_entries')).map((call) => call[19]),
    ).toEqual([null, null]);
  });

  it('uses the workout start date as the completion timestamp when a finished Frogs row has no end date', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercises')) {
        return null;
      }
      return null;
    });

    const csv = toCsv([
      {
        workout_id: 'workout-import-finished',
        workout_title: 'Treino finalizado sem fim',
        workout_started_at: '2026-03-27T10:00:00.000Z',
        workout_ended_at: '',
        workout_duration_seconds: '1800',
        workout_status: 'completed',
        workout_source: 'empty',
        workout_note: '',
        workout_visibility: 'private',
        workout_exercise_id: 'we-finished-1',
        exercise_id: 'exercise-finished-1',
        exercise_name: 'Crucifixo',
        exercise_sort_order: '0',
        exercise_note: '',
        rest_seconds: '90',
        previous_performance: '',
        superset_group: '',
        muscle_group: 'chest',
        set_id: 'set-finished-1',
        set_index: '0',
        set_type: 'normal',
        reps: '12',
        weight_kg: '18',
        duration_seconds: '',
        distance_meters: '',
        speed: '',
        elevation: '',
        rpe: '',
        is_completed: '1',
      },
    ]);

    const result = importCsvTextForTests(csv, 'frog-workouts-finished.csv');

    expect(result.status).toBe('pending_review');
    expect(
      (database.runSync as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('INSERT INTO set_entries'))?.[21],
    ).toBe('2026-03-27T10:00:00.000Z');
  });

  it('skips workout rows that already exist locally', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [{ id: 'workout-existing-1' }];
      }
      return [];
    });

    const csv = toCsv([
      Object.fromEntries(
        workoutCsvHeaders.map((header) => [
          header,
          {
            workout_id: 'workout-existing-1',
            workout_title: 'Treino já salvo',
            workout_started_at: '2026-03-27T10:00:00.000Z',
            workout_ended_at: '',
            workout_duration_seconds: '1200',
            workout_status: 'completed',
            workout_source: 'empty',
            workout_note: '',
            workout_visibility: 'private',
            workout_exercise_id: 'we-existing-1',
            exercise_id: 'exercise-existing-1',
            exercise_name: 'Supino reto',
            exercise_sort_order: '0',
            exercise_note: '',
            rest_seconds: '90',
            previous_performance: '',
            superset_group: '',
            muscle_group: 'chest',
            secondary_muscles_json: '[]',
            equipment: 'barbell',
            modality: 'strength',
            instructions: '',
            set_id: 'set-existing-1',
            set_index: '0',
            set_type: 'normal',
            reps: '8',
            weight_kg: '60',
            duration_seconds: '',
            distance_meters: '',
            speed: '',
            elevation: '',
            rpe: '',
            is_completed: '1',
          }[header] ?? '',
        ]),
      ),
    ]);

    const result = importCsvTextForTests(csv, 'frog-workouts-existing.csv');

    expect(result).toEqual(
      expect.objectContaining({
        status: 'success',
        insertedCount: 0,
        skippedCount: 1,
      }),
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO workouts')),
    ).toBe(false);
  });

  it('skips existing workout exercise and set rows while still importing the workout shell', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE lower(slug)')) {
        return { id: 'exercise-by-slug' };
      }
      if (sql.includes('SELECT id FROM workout_exercises WHERE id = ? LIMIT 1')) {
        return value === 'we-import-skip' ? { id: value } : null;
      }
      if (sql.includes('SELECT id FROM set_entries WHERE id = ? LIMIT 1')) {
        return value === 'set-import-skip' ? { id: value } : null;
      }
      if (sql.includes('FROM import_jobs')) {
        return mockLastImportJob;
      }
      return null;
    });

    const csv = toCsv([
      Object.fromEntries(
        workoutCsvHeaders.map((header) => [
          header,
          {
            workout_id: 'workout-import-skip',
            workout_title: 'Treino parcial',
            workout_started_at: '2026-03-27T10:00:00.000Z',
            workout_ended_at: '',
            workout_duration_seconds: '900',
            workout_status: 'completed',
            workout_source: 'empty',
            workout_note: '',
            workout_visibility: 'private',
            workout_exercise_id: 'we-import-skip',
            exercise_id: 'exercise-import-skip',
            exercise_name: 'Supino reto',
            exercise_sort_order: '0',
            exercise_note: '',
            rest_seconds: '60',
            previous_performance: '',
            superset_group: '',
            muscle_group: 'chest',
            secondary_muscles_json: '[]',
            equipment: 'barbell',
            modality: 'strength',
            instructions: '',
            set_id: 'set-import-skip',
            set_index: '0',
            set_type: 'normal',
            reps: '8',
            weight_kg: '60',
            duration_seconds: '',
            distance_meters: '',
            speed: '',
            elevation: '',
            rpe: '',
            is_completed: '1',
          }[header] ?? '',
        ]),
      ),
    ]);

    const result = importCsvTextForTests(csv, 'frog-workouts-skip.csv');

    expect(result).toEqual(
      expect.objectContaining({
        status: 'success',
        insertedCount: 0,
        skippedCount: 1,
      }),
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      'workout-import-skip',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      null,
      'Treino parcial',
      'completed',
      'empty',
      '2026-03-27T10:00:00.000Z',
      '2026-03-27T10:00:00.000Z',
      900,
      '',
      0,
      0,
      0,
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO workout_exercises')),
    ).toBe(false);
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO set_entries')),
    ).toBe(false);
  });

  it('imports a valid Frogs measurements CSV payload', () => {
    const csv = toCsv([
      {
        measurement_id: 'measurement-import-1',
        recorded_at: '2026-03-27T10:00:00.000Z',
        weight_kg: '82,5',
        chest_cm: '',
        waist_cm: '80',
        hips_cm: '',
        arm_cm: '',
        thigh_cm: '',
        related_workout_id: '',
        note: 'Pós treino',
      },
    ]);

    const result = importCsvTextForTests(csv, 'frog-measurements.csv');

    expect(result.status).toBe('success');
    expect(result.insertedCount).toBe(1);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO body_measurements'),
      'measurement-import-1',
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
      null,
      80,
      null,
      null,
      null,
      'Pós treino',
    );
  });

  it('skips existing measurement rows and rejects imports without an initialized user', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('FROM body_measurements')) {
        return { id: 'measurement-import-1' };
      }
      return null;
    });

    const csv = toCsv([
      {
        measurement_id: 'measurement-import-1',
        recorded_at: '2026-03-27T10:00:00.000Z',
        weight_kg: '81',
        chest_cm: '',
        waist_cm: '',
        hips_cm: '',
        arm_cm: '',
        thigh_cm: '',
        related_workout_id: '',
        note: '',
      },
    ]);

    const result = importCsvTextForTests(csv, 'frog-measurements-skip.csv');

    expect(result).toEqual(
      expect.objectContaining({
        status: 'success',
        insertedCount: 0,
        skippedCount: 1,
      }),
    );

    (getAppUser as jest.Mock).mockReturnValue(null);
    expect(() => importCsvTextForTests(csv, 'frog-measurements-error.csv')).toThrow('User not initialized');
  });

  it('blocks duplicate imports by checksum when the previous import succeeded or is pending review', () => {
    mockExistingSuccessfulImport = { id: 'import-job-1' };

    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Push,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,Supino reto,,,0,normal,60,8,,,',
    ].join('\n');

    const result = importCsvTextForTests(csv, 'hevy.csv');

    expect(result.status).toBe('blocked_duplicate');
    expect(result.skippedCount).toBe(1);
    expect(result.errors[0]).toContain('ja foi importado');
    expect(database.getFirstSync).toHaveBeenCalledWith(expect.stringContaining("status IN ('success', 'pending_review')"), expect.any(String));
  });

  it('imports Hevy CSV rows reusing the same workout and exercise block', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return { id: 'exercise-existing-1', muscle_group: 'back' };
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return value === 'exercise-existing-1' ? { id: value } : null;
      }
      return null;
    });

    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Puxada,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",Notas do treino,Remada curvada,,Anotar aqui,0,normal,80,8,,,',
      'Puxada,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",Notas do treino,Remada curvada,,Anotar aqui,1,failure,85,6,,,',
    ].join('\n');

    const result = importCsvTextForTests(csv, 'hevy-success.csv');

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'hevy_csv',
        status: 'pending_review',
        insertedCount: 2,
        skippedCount: 0,
      }),
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO workouts')).length,
    ).toBe(1);
    expect(
      (database.runSync as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO workout_exercises'))
        .length,
    ).toBe(1);
    expect(
      (database.runSync as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO set_entries')).length,
    ).toBe(2);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      null,
      'Puxada',
      'completed',
      'copied',
      new Date(2026, 2, 14, 19, 47).toISOString(),
      new Date(2026, 2, 14, 20, 48).toISOString(),
      3660,
      'Notas do treino',
      0,
      0,
      0,
    );
    const exerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );
    const workoutExerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO workout_exercises'),
    );
    expect(exerciseInsertCall).toEqual(
      expect.arrayContaining(['Remada curvada', 'full_body', '[]', 'other', 'strength', 'Exercicio importado localmente.']),
    );
    expect(workoutExerciseInsertCall?.[12]).toBe(exerciseInsertCall?.[1]);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_exercises'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      expect.any(String),
      exerciseInsertCall?.[1],
      0,
      'Anotar aqui',
      90,
      '',
      '',
    );
  });

  it('imports Hevy rows with localized months, distance, duration and supersets', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return { id: 'exercise-existing-2', muscle_group: 'core' };
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return { id: 'exercise-existing-2' };
      }
      return null;
    });

    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Core,"28 Fev 2026, 16:19","28 Fev 2026, 17:10",,Prancha Abdominal,super-1,,0,normal,,,,45,',
      'Core,"28 Fev 2026, 16:19","28 Fev 2026, 17:10",,Prancha Abdominal,super-1,,1,normal,,,1.5,,7',
      'Core,"28 Fev 2026, 16:19","28 Fev 2026, 17:10",,Prancha Abdominal,super-1,,2,dropset,20,10,,,',
    ].join('\n');

    const result = importCsvTextForTests(csv, 'hevy-alt.csv');

    expect(result).toEqual(expect.objectContaining({ status: 'pending_review', insertedCount: 3 }));
    const localizedExerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_exercises'),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      expect.any(String),
      localizedExerciseInsertCall?.[1],
      0,
      '',
      90,
      '',
      'super-1',
    );
    const setCalls = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO set_entries'),
    );
    expect(setCalls[0][13]).toBe('timed');
    expect(setCalls[0][16]).toBe(45);
    expect(setCalls[1][13]).toBe('distance');
    expect(setCalls[1][17]).toBe(1500);
    expect(setCalls[1][20]).toBe(7);
    expect(setCalls[2][13]).toBe('drop');
  });

  it('creates a pending review job when imports create local placeholder exercises', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE lower(slug)')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE lower(name)')) {
        return null;
      }
      return null;
    });

    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Pull,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,Puxada neutra,,,0,normal,70,10,,,',
    ].join('\n');

    const result = importCsvTextForTests(csv, 'hevy-new-exercise.csv');

    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'hevy_csv',
        status: 'pending_review',
        reviewJobId: importJobCall[1],
      }),
    );
    expect(summary.workoutIds).toHaveLength(1);
    expect(summary.placeholderExerciseIds).toHaveLength(1);
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Puxada neutra',
        status: 'pending',
        workoutExerciseIds: [expect.any(String)],
      }),
    ]);
    expect(
      (database.runSync as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('INSERT INTO exercises')),
    ).toEqual(
      expect.arrayContaining(['puxada-neutra', 'Puxada neutra', 'full_body', '[]', 'other', 'strength', 'Exercicio importado localmente.']),
    );
  });

  it('reuses one placeholder exercise per unknown Hevy exercise name', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE lower(slug)')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE lower(name)')) {
        return null;
      }
      return null;
    });

    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Pull,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,Puxada neutra,,,0,normal,70,10,,,',
      'Pull,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,Puxada neutra,,,1,normal,75,8,,,',
    ].join('\n');

    importCsvTextForTests(csv, 'hevy-repeated-new-exercise.csv');

    const exerciseInserts = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );
    const workoutExerciseInserts = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO workout_exercises'),
    );

    expect(exerciseInserts).toHaveLength(1);
    expect(workoutExerciseInserts).toHaveLength(1);
    expect(workoutExerciseInserts[0][12]).toBe(exerciseInserts[0][1]);
  });

  it('loads, replaces, edits, saves and discards a pending import review job', () => {
    const summary = {
      insertedCount: 2,
      skippedCount: 0,
      workoutIds: ['workout-import-1'],
      placeholderExerciseIds: ['exercise-placeholder-1'],
      exerciseGroups: [
        {
          key: 'puxada-neutra',
          importedName: 'Puxada neutra',
          placeholderExerciseId: 'exercise-placeholder-1',
          workoutExerciseIds: ['we-import-1', 'we-import-2'],
          status: 'pending',
        },
      ],
    };
    let currentSummary = summary;

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'hevy_csv',
          file_name: 'hevy.csv',
          status: 'pending_review',
          summary_json: JSON.stringify(currentSummary),
        };
      }
      if (sql.includes('SELECT * FROM exercises WHERE id = ?')) {
        return {
          id: value,
          created_at: '2026-03-27T10:00:00.000Z',
          updated_at: '2026-03-27T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          slug: value === 'exercise-placeholder-1' ? 'puxada-neutra' : 'remada-baixa',
          name: value === 'exercise-placeholder-1' ? 'Puxada neutra' : 'Remada baixa',
          muscle_group: value === 'exercise-placeholder-1' ? 'full_body' : 'back',
          secondary_muscles_json: '[]',
          equipment: 'other',
          modality: 'strength',
          is_custom: value === 'exercise-placeholder-1' ? 1 : 0,
          instructions: '',
        };
      }
      if (sql.includes('SELECT id FROM exercises WHERE slug = ? LIMIT 1')) {
        return null;
      }
      return null;
    });
    (database.runSync as jest.Mock).mockImplementation((sql: string, ...params: unknown[]) => {
      if (String(sql).includes('UPDATE import_jobs')) {
        currentSummary = JSON.parse(params[1] as string);
      }
    });

    const review = getImportReview('import-job-1');
    expect(review?.groups[0]).toEqual(
      expect.objectContaining({
        importedName: 'Puxada neutra',
        status: 'pending',
        placeholderExercise: expect.objectContaining({ name: 'Puxada neutra' }),
      }),
    );

    expect(() => saveImportReview('import-job-1', { allowUnresolved: false })).toThrow('Ainda existem exercicios sem ajuste.');

    replaceImportExercise('import-job-1', 'puxada-neutra', 'exercise-existing-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workout_exercises'),
      'exercise-existing-1',
      expect.any(String),
      'we-import-1',
      'we-import-2',
    );

    updateImportedExercise('import-job-1', 'puxada-neutra', {
      name: 'Puxada neutra ajustada',
      muscleGroup: 'back',
      secondaryMuscles: ['biceps'],
      equipment: 'cable',
      modality: 'strength',
      instructions: 'Ajustado depois do CSV.',
    });
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE exercises'),
      'puxada-neutra-ajustada',
      'Puxada neutra ajustada',
      'back',
      JSON.stringify(['biceps']),
      'cable',
      'strength',
      'Ajustado depois do CSV.',
      expect.any(String),
      'exercise-placeholder-1',
    );

    saveImportReview('import-job-1', { allowUnresolved: false });
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE import_jobs'),
      'success',
      expect.any(String),
      expect.any(String),
      'import-job-1',
    );

    discardImport('import-job-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM set_entries WHERE workout_exercise_id IN'),
      'workout-import-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM workout_exercises WHERE workout_id IN'),
      'workout-import-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM workouts'),
      'workout-import-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE import_jobs'),
      'discarded',
      expect.any(String),
      expect.any(String),
      'import-job-1',
    );
  });

  it('saves matched review groups without requiring edits and removes temporary placeholders', () => {
    const summary = {
      insertedCount: 1,
      skippedCount: 0,
      workoutIds: ['workout-import-1'],
      placeholderExerciseIds: ['exercise-placeholder-match'],
      exerciseGroups: [
        {
          key: 'supino-reto',
          importedName: 'Supino reto',
          placeholderExerciseId: 'exercise-placeholder-match',
          workoutExerciseIds: ['we-import-1'],
          status: 'matched',
          differenceCount: 0,
          matchedExerciseId: 'exercise-existing-supino',
          resolvedExerciseId: 'exercise-existing-supino',
        },
      ],
    };

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_workouts_csv',
          file_name: 'frog-workout.csv',
          status: 'pending_review',
          summary_json: JSON.stringify(summary),
        };
      }
      return null;
    });

    expect(() => saveImportReview('import-job-match', { allowUnresolved: false })).not.toThrow();
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM exercises WHERE id IN'),
      'exercise-placeholder-match',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE import_jobs'),
      'success',
      expect.any(String),
      expect.any(String),
      'import-job-match',
    );
  });

  it('loads legacy import review groups without comparison metadata', () => {
    const summary = {
      insertedCount: 1,
      skippedCount: 0,
      workoutIds: ['workout-import-1'],
      placeholderExerciseIds: ['exercise-placeholder-legacy'],
      exerciseGroups: [
        {
          key: 'puxada-neutra',
          importedName: 'Puxada neutra',
          placeholderExerciseId: 'exercise-placeholder-legacy',
          workoutExerciseIds: ['we-import-1'],
          status: 'pending',
        },
      ],
    };

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'hevy_csv',
          file_name: 'hevy.csv',
          status: 'pending_review',
          summary_json: JSON.stringify(summary),
        };
      }
      if (sql.includes('SELECT * FROM exercises WHERE id = ?')) {
        return {
          ...createExerciseRow({
            id: value,
            slug: 'puxada-neutra',
            name: 'Puxada neutra',
            muscle_group: 'full_body',
            secondary_muscles_json: '[]',
            equipment: 'other',
            instructions: '',
            is_custom: 1,
          }),
        };
      }
      return null;
    });

    expect(getImportReview('import-job-legacy')?.groups[0]).toEqual(
      expect.objectContaining({
        importedName: 'Puxada neutra',
        status: 'pending',
        differenceCount: 1,
        matchedExerciseId: null,
      }),
    );
  });

  it('loads, replaces, edits, saves and discards a pending Frogs workout review job', () => {
    const summary = {
      insertedCount: 2,
      skippedCount: 0,
      workoutIds: ['workout-frogs-review-1'],
      placeholderExerciseIds: ['exercise-placeholder-frogs-1'],
      exerciseGroups: [
        {
          key: 'remada-importada-nova',
          importedName: 'Remada importada nova',
          placeholderExerciseId: 'exercise-placeholder-frogs-1',
          workoutExerciseIds: ['we-frogs-new'],
          status: 'pending',
        },
      ],
    };
    let currentSummary = summary;

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_workouts_csv',
          file_name: 'frog-workout.csv',
          status: 'pending_review',
          summary_json: JSON.stringify(currentSummary),
        };
      }
      if (sql.includes('SELECT * FROM exercises WHERE id = ?')) {
        return {
          id: value,
          created_at: '2026-03-27T10:00:00.000Z',
          updated_at: '2026-03-27T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          slug: value === 'exercise-placeholder-frogs-1' ? 'remada-importada-nova' : 'remada-baixa',
          name: value === 'exercise-placeholder-frogs-1' ? 'Remada importada nova' : 'Remada baixa',
          muscle_group: value === 'exercise-placeholder-frogs-1' ? 'full_body' : 'back',
          secondary_muscles_json: '[]',
          equipment: 'other',
          modality: 'strength',
          is_custom: value === 'exercise-placeholder-frogs-1' ? 1 : 0,
          instructions: '',
        };
      }
      if (sql.includes('SELECT id FROM exercises WHERE slug = ? LIMIT 1')) {
        return null;
      }
      return null;
    });
    (database.runSync as jest.Mock).mockImplementation((sql: string, ...params: unknown[]) => {
      if (String(sql).includes('UPDATE import_jobs')) {
        currentSummary = JSON.parse(params[1] as string);
      }
    });

    const review = getImportReview('import-job-frogs');
    expect(review).toEqual(
      expect.objectContaining({
        sourceType: 'frog_workouts_csv',
        fileName: 'frog-workout.csv',
        unresolvedCount: 1,
      }),
    );

    replaceImportExercise('import-job-frogs', 'remada-importada-nova', 'exercise-existing-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workout_exercises'),
      'exercise-existing-1',
      expect.any(String),
      'we-frogs-new',
    );

    updateImportedExercise('import-job-frogs', 'remada-importada-nova', {
      name: 'Remada importada ajustada',
      muscleGroup: 'back',
      secondaryMuscles: ['biceps'],
      equipment: 'cable',
      modality: 'strength',
      instructions: 'Ajustado depois do CSV Frogs.',
    });
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE exercises'),
      'remada-importada-ajustada',
      'Remada importada ajustada',
      'back',
      JSON.stringify(['biceps']),
      'cable',
      'strength',
      'Ajustado depois do CSV Frogs.',
      expect.any(String),
      'exercise-placeholder-frogs-1',
    );

    const savedResult = saveImportReview('import-job-frogs', { allowUnresolved: false });
    expect(savedResult.sourceType).toBe('frog_workouts_csv');

    discardImport('import-job-frogs');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM set_entries WHERE workout_exercise_id IN'),
      'workout-frogs-review-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM workout_exercises WHERE workout_id IN'),
      'workout-frogs-review-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM workouts'),
      'workout-frogs-review-1',
    );
  });

  it('loads, replaces, edits, saves and discards a pending Frogs routine review job', () => {
    const summary = {
      insertedCount: 1,
      skippedCount: 0,
      workoutIds: [],
      routineIds: ['routine-import-1'],
      routineExerciseIds: ['routine-exercise-known', 'routine-exercise-new'],
      createdRoutineFolderIds: ['folder-import-1'],
      placeholderExerciseIds: ['exercise-placeholder-routine-1'],
      exerciseGroups: [
        {
          key: 'rosca-alien',
          importedName: 'Rosca alien',
          placeholderExerciseId: 'exercise-placeholder-routine-1',
          workoutExerciseIds: [],
          routineExerciseIds: ['routine-exercise-new'],
          status: 'pending',
        },
      ],
    };
    let currentSummary = summary;

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_routine_json',
          file_name: 'upper-revisao.json',
          status: 'pending_review',
          summary_json: JSON.stringify(currentSummary),
        };
      }
      if (sql.includes('SELECT * FROM exercises WHERE id = ?')) {
        return {
          id: value,
          created_at: '2026-03-27T10:00:00.000Z',
          updated_at: '2026-03-27T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          slug: value === 'exercise-placeholder-routine-1' ? 'rosca-alien' : 'rosca-direta',
          name: value === 'exercise-placeholder-routine-1' ? 'Rosca alien' : 'Rosca direta',
          muscle_group: value === 'exercise-placeholder-routine-1' ? 'full_body' : 'biceps',
          secondary_muscles_json: '[]',
          equipment: 'other',
          modality: 'strength',
          is_custom: value === 'exercise-placeholder-routine-1' ? 1 : 0,
          instructions: '',
        };
      }
      if (sql.includes('SELECT id FROM exercises WHERE slug = ? LIMIT 1')) {
        return null;
      }
      return null;
    });
    (database.runSync as jest.Mock).mockImplementation((sql: string, ...params: unknown[]) => {
      if (String(sql).includes('UPDATE import_jobs')) {
        currentSummary = JSON.parse(params[1] as string);
      }
    });

    const review = getImportReview('import-job-routine');
    expect(review).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'upper-revisao.json',
        unresolvedCount: 1,
      }),
    );

    replaceImportExercise('import-job-routine', 'rosca-alien', 'exercise-existing-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE routine_exercises'),
      'exercise-existing-1',
      expect.any(String),
      'routine-exercise-new',
    );

    updateImportedExercise('import-job-routine', 'rosca-alien', {
      name: 'Rosca importada ajustada',
      muscleGroup: 'biceps',
      secondaryMuscles: ['forearms'],
      equipment: 'dumbbell',
      modality: 'strength',
      instructions: 'Ajustado depois do JSON Frogs.',
    });
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE exercises'),
      'rosca-importada-ajustada',
      'Rosca importada ajustada',
      'biceps',
      JSON.stringify(['forearms']),
      'dumbbell',
      'strength',
      'Ajustado depois do JSON Frogs.',
      expect.any(String),
      'exercise-placeholder-routine-1',
    );

    const savedResult = saveImportReview('import-job-routine', { allowUnresolved: false });
    expect(savedResult.sourceType).toBe('frog_routine_json');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE routines SET is_archived = 0'),
      expect.any(String),
      'routine-import-1',
    );

    discardImport('import-job-routine');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM routine_exercises WHERE routine_id IN'),
      'routine-import-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM routines WHERE id IN'),
      'routine-import-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM routine_folders WHERE id IN'),
      'folder-import-1',
    );
  });

  it('saves a pending backup review by restoring the backup with replacement mappings', () => {
    const backupExercise = createExerciseRow({
      id: 'exercise-backup-puxada',
      slug: 'puxada-backup',
      name: 'Puxada backup',
      muscle_group: 'back',
      equipment: 'machine',
      is_archived: 1,
    });
    const summary = {
      insertedCount: 5,
      skippedCount: 0,
      workoutIds: [],
      routineIds: [],
      routineExerciseIds: [],
      placeholderExerciseIds: ['exercise-placeholder-backup'],
      exerciseGroups: [
        {
          key: 'puxada-backup',
          importedName: 'Puxada backup',
          placeholderExerciseId: 'exercise-placeholder-backup',
          workoutExerciseIds: [],
          routineExerciseIds: [],
          status: 'replaced',
          resolvedExerciseId: 'exercise-existing-supino',
        },
      ],
      backupRestore: {
        envelope: {
          version: 1,
          exportedAt: '2026-03-27T10:00:00.000Z',
          deviceId: 'device-1',
          tables: {
            users: [{ id: 'user-from-backup' }],
            exercises: [backupExercise],
            workout_exercises: [{ id: 'we-from-backup', exercise_id: 'exercise-backup-puxada' }],
            routine_exercises: [{ id: 're-from-backup', exercise_id: 'exercise-backup-puxada' }],
            pr_records: [{ id: 'pr-from-backup', exercise_id: 'exercise-backup-puxada', metric: 'estimated_1rm' }],
          },
        },
        exerciseIdsByGroupKey: {
          'puxada-backup': ['exercise-backup-puxada'],
        },
      },
    };

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_backup_json',
          file_name: 'frog-backup-v1.json',
          status: 'pending_review',
          summary_json: JSON.stringify(summary),
        };
      }
      if (sql.includes('SELECT * FROM exercises WHERE id = ?') && value === 'exercise-existing-supino') {
        return createExerciseRow({ id: 'exercise-existing-supino' });
      }
      return null;
    });

    const result = saveImportReview('import-job-backup', { allowUnresolved: false });

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_backup_json',
        fileName: 'frog-backup-v1.json',
        status: 'success',
      }),
    );
    expect(clearTable).toHaveBeenCalledWith('import_jobs');
    expect(insertRow).toHaveBeenCalledWith('users', { id: 'user-from-backup' });
    expect(insertRow).toHaveBeenCalledWith('exercises', expect.objectContaining({ id: 'exercise-existing-supino' }));
    expect(insertRow).not.toHaveBeenCalledWith('exercises', expect.objectContaining({ id: 'exercise-backup-puxada' }));
    expect(insertRow).toHaveBeenCalledWith(
      'workout_exercises',
      expect.objectContaining({ id: 'we-from-backup', exercise_id: 'exercise-existing-supino' }),
    );
    expect(insertRow).toHaveBeenCalledWith(
      'routine_exercises',
      expect.objectContaining({ id: 're-from-backup', exercise_id: 'exercise-existing-supino' }),
    );
    expect(insertRow).toHaveBeenCalledWith(
      'pr_records',
      expect.objectContaining({ id: 'pr-from-backup', exercise_id: 'exercise-existing-supino', record_type: 'one_rm' }),
    );
  });

  it('saves edited backup exercises under the original backup exercise IDs', () => {
    const backupExercise = createExerciseRow({
      id: 'exercise-backup-remada',
      slug: 'remada-backup',
      name: 'Remada backup',
      muscle_group: 'back',
      equipment: 'other',
    });
    const summary = {
      insertedCount: 3,
      skippedCount: 0,
      workoutIds: [],
      routineIds: [],
      placeholderExerciseIds: ['exercise-placeholder-backup-edit'],
      exerciseGroups: [
        {
          key: 'remada-backup',
          importedName: 'Remada backup',
          placeholderExerciseId: 'exercise-placeholder-backup-edit',
          workoutExerciseIds: [],
          routineExerciseIds: [],
          status: 'edited',
          resolvedExerciseId: 'exercise-placeholder-backup-edit',
        },
      ],
      backupRestore: {
        envelope: {
          version: 1,
          exportedAt: '2026-03-27T10:00:00.000Z',
          deviceId: 'device-1',
          tables: {
            users: [{ id: 'user-from-backup' }],
            exercises: [backupExercise],
            workout_exercises: [{ id: 'we-from-backup', exercise_id: 'exercise-backup-remada' }],
          },
        },
        exerciseIdsByGroupKey: {
          'remada-backup': ['exercise-backup-remada'],
        },
      },
    };

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_backup_json',
          file_name: 'frog-backup-v1.json',
          status: 'pending_review',
          summary_json: JSON.stringify(summary),
        };
      }
      if (sql.includes('SELECT * FROM exercises WHERE id = ?') && value === 'exercise-placeholder-backup-edit') {
        return createExerciseRow({
          id: 'exercise-placeholder-backup-edit',
          slug: 'remada-revisada',
          name: 'Remada revisada',
          muscle_group: 'back',
          secondary_muscles_json: '["biceps"]',
          equipment: 'machine',
          modality: 'strength',
          is_custom: 1,
          instructions: 'Revisada antes da restauração.',
        });
      }
      return null;
    });

    saveImportReview('import-job-backup-edit', { allowUnresolved: false });

    expect(insertRow).toHaveBeenCalledWith(
      'exercises',
      expect.objectContaining({
        id: 'exercise-backup-remada',
        slug: 'remada-revisada',
        name: 'Remada revisada',
        equipment: 'machine',
        instructions: 'Revisada antes da restauração.',
      }),
    );
    expect(insertRow).toHaveBeenCalledWith(
      'workout_exercises',
      expect.objectContaining({ id: 'we-from-backup', exercise_id: 'exercise-backup-remada' }),
    );
  });

  it('discards pending backup reviews without clearing or restoring the current base', () => {
    const summary = {
      insertedCount: 1,
      skippedCount: 0,
      workoutIds: [],
      routineIds: [],
      placeholderExerciseIds: ['exercise-placeholder-backup'],
      exerciseGroups: [
        {
          key: 'puxada-backup',
          importedName: 'Puxada backup',
          placeholderExerciseId: 'exercise-placeholder-backup',
          workoutExerciseIds: [],
          routineExerciseIds: [],
          status: 'pending',
        },
      ],
      backupRestore: {
        envelope: {
          version: 1,
          exportedAt: '2026-03-27T10:00:00.000Z',
          deviceId: 'device-1',
          tables: {
            exercises: [createExerciseRow({ id: 'exercise-backup-puxada' })],
          },
        },
        exerciseIdsByGroupKey: {
          'puxada-backup': ['exercise-backup-puxada'],
        },
      },
    };

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'frog_backup_json',
          file_name: 'frog-backup-v1.json',
          status: 'pending_review',
          summary_json: JSON.stringify(summary),
        };
      }
      return null;
    });

    const result = discardImport('import-job-backup');

    expect(result.status).toBe('discarded');
    expect(clearTable).not.toHaveBeenCalled();
    expect(insertRow).not.toHaveBeenCalled();
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM exercises WHERE id IN'),
      'exercise-placeholder-backup',
    );
  });

  it('rejects replacing a import group with another placeholder from the same import', () => {
    const summary = {
      insertedCount: 2,
      skippedCount: 0,
      workoutIds: ['workout-import-1'],
      placeholderExerciseIds: ['exercise-placeholder-1', 'exercise-placeholder-2'],
      exerciseGroups: [
        {
          key: 'puxada-neutra',
          importedName: 'Puxada neutra',
          placeholderExerciseId: 'exercise-placeholder-1',
          workoutExerciseIds: ['we-import-1'],
          status: 'pending',
        },
        {
          key: 'remada-importada-nova',
          importedName: 'Remada importada nova',
          placeholderExerciseId: 'exercise-placeholder-2',
          workoutExerciseIds: ['we-import-2'],
          status: 'pending',
        },
      ],
    };

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('id = ?')) {
        return {
          id: value,
          source_type: 'hevy_csv',
          file_name: 'hevy.csv',
          status: 'pending_review',
          summary_json: JSON.stringify(summary),
        };
      }

      return null;
    });

    expect(() => replaceImportExercise('import-job-1', 'puxada-neutra', 'exercise-placeholder-2')).toThrow(
      'Escolha um exercício já existente no Frogs para substituir.',
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('UPDATE workout_exercises')),
    ).toBe(false);
  });

  it('rejects incomplete Hevy CSV rows and the old English format', () => {
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Push,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,,,,0,normal,60,8,,,',
    ].join('\n');

    expect(() => importCsvTextForTests(csv, 'hevy-invalid.csv')).toThrow('Linha 2 do Hevy CSV esta incompleta.');

    expect(importCsvTextForTests('Date,Workout Name,Exercise Name\n2026-03-27,Push,Supino')).toEqual(
      expect.objectContaining({
        status: 'failed',
        errors: ['Formato de CSV não reconhecido. Use um CSV do Frogs ou um CSV exportado pelo Hevy.'],
      }),
    );
  });

  it('reads a picked CSV file and a picked backup file from the document picker', async () => {
    const csvFile = new File('file:///mock-documents/picked-workouts.csv');
    csvFile.create();
    csvFile.write(
      toCsv([
        {
          workout_id: 'workout-import-2',
          workout_title: 'Treino via picker',
          workout_started_at: '2026-03-27T10:00:00.000Z',
          workout_ended_at: '2026-03-27T10:30:00.000Z',
          workout_duration_seconds: '1800',
          workout_status: 'completed',
          workout_source: 'empty',
          workout_note: '',
          workout_visibility: 'private',
          workout_exercise_id: 'we-import-2',
          exercise_id: 'exercise-import-2',
          exercise_name: 'Remada',
          exercise_sort_order: '0',
          exercise_note: '',
          rest_seconds: '90',
          previous_performance: '',
          superset_group: '',
          muscle_group: 'back',
          set_id: 'set-import-2',
          set_index: '0',
          set_type: 'normal',
          reps: '10',
          weight_kg: '50',
          duration_seconds: '',
          distance_meters: '',
          speed: '',
          elevation: '',
          rpe: '',
          is_completed: '1',
        },
      ]),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workouts.csv' }],
    });

    const importResult = await pickAndImportCsvData();
    expect(importResult?.status).toBe('pending_review');
    expect(DocumentPicker.getDocumentAsync).toHaveBeenLastCalledWith({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    const backupFile = new File('file:///mock-documents/picked-backup.json');
    backupFile.create();
    backupFile.write(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        deviceId: 'device-1',
        tables: { users: [{ id: 'user-1' }] },
      }),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: backupFile.uri, name: 'picked-backup.json' }],
    });

    const restoreResult = await pickAndRestoreBackup();
    expect(restoreResult?.status).toBe('success');
    expect(insertRow).toHaveBeenCalledWith('users', { id: 'user-1' });
  });

  it('opens review for a picked Frogs workout CSV through the workout-only picker when exercises already exist', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return value === 'exercise-existing-frogs-picker' ? { id: value } : null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return { id: 'exercise-existing-frogs-picker', muscle_group: 'back' };
      }
      return null;
    });
    const csvFile = new File('file:///mock-documents/picked-workout-only-frogs.csv');
    csvFile.create();
    csvFile.write(
      toCsv([
        createWorkoutCsvRow({
          workout_id: 'workout-only-import-1',
          workout_exercise_id: 'we-workout-only-1',
          exercise_id: 'exercise-existing-frogs-picker',
          exercise_name: 'Remada',
          set_id: 'set-workout-only-1',
        }),
      ]),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workout-only-frogs.csv' }],
    });

    const importResult = await pickAndImportWorkoutCsvData();
    const exerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO exercises'),
    );
    const workoutExerciseInsertCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO workout_exercises'),
    );

    expect(importResult?.status).toBe('pending_review');
    expect(importResult?.sourceType).toBe('frog_workouts_csv');
    expect(exerciseInsertCall?.[1]).not.toBe('exercise-existing-frogs-picker');
    expect(workoutExerciseInsertCall?.[12]).toBe(exerciseInsertCall?.[1]);
    expect(DocumentPicker.getDocumentAsync).toHaveBeenLastCalledWith({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it('imports a picked Frogs workout CSV from UTF-8 bytes even when text() would return mojibake', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return { id: 'exercise-existing-accent', muscle_group: 'shoulders' };
      }
      return null;
    });
    const csv = toCsv([
      createWorkoutCsvRow({
        workout_id: 'workout-only-import-accent',
        workout_title: 'Treino rápido',
        workout_exercise_id: 'we-workout-only-accent',
        exercise_id: 'exercise-import-accent',
        exercise_name: 'Elevação lateral',
        muscle_group: 'shoulders',
        set_id: 'set-workout-only-accent',
      }),
    ]);
    const csvFile = new File('file:///mock-documents/picked-workout-only-frogs-accent.csv');
    csvFile.create();
    csvFile.write(csv);
    (csvFile as any).__setTextForTests(csv.replace('Treino rápido', 'Treino rÃ¡pido').replace('Elevação', 'ElevaÃ§Ã£o'));
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workout-only-frogs-accent.csv' }],
    });

    const importResult = await pickAndImportWorkoutCsvData();

    expect(importResult?.status).toBe('pending_review');
    expect(
      (database.runSync as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('INSERT INTO exercises')),
    ).toEqual(expect.arrayContaining(['Elevação lateral']));
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      'workout-only-import-accent',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      null,
      'Treino rápido',
      'completed',
      'empty',
      '2026-03-27T10:00:00.000Z',
      '2026-03-27T10:30:00.000Z',
      1800,
      '',
      0,
      0,
      0,
    );
  });

  it('imports a picked Frogs workout CSV from repaired text when bytes() is unavailable', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return { id: 'exercise-existing-accent-fallback', muscle_group: 'arms' };
      }
      return null;
    });
    const csv = toCsv([
      createWorkoutCsvRow({
        workout_id: 'workout-only-import-accent-fallback',
        workout_title: 'Treino rápido',
        workout_exercise_id: 'we-workout-only-accent-fallback',
        exercise_id: 'exercise-import-accent-fallback',
        exercise_name: 'Tríceps corda',
        muscle_group: 'arms',
        set_id: 'set-workout-only-accent-fallback',
      }),
    ]);
    const csvFile = new File('file:///mock-documents/picked-workout-only-frogs-accent-fallback.csv');
    csvFile.create();
    csvFile.write(csv);
    (csvFile as any).__setBytesFailureForTests(new Error('bytes unavailable'));
    (csvFile as any).__setTextForTests(csv.replace('Treino rápido', 'Treino rÃ¡pido').replace('Tríceps', 'TrÃ­ceps'));
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workout-only-frogs-accent-fallback.csv' }],
    });

    const importResult = await pickAndImportWorkoutCsvData();

    expect(importResult?.status).toBe('pending_review');
    expect(
      (database.runSync as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('INSERT INTO exercises')),
    ).toEqual(expect.arrayContaining(['Tríceps corda']));
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      'workout-only-import-accent-fallback',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      null,
      'Treino rápido',
      'completed',
      'empty',
      '2026-03-27T10:00:00.000Z',
      '2026-03-27T10:30:00.000Z',
      1800,
      '',
      0,
      0,
      0,
    );
  });

  it('opens a pending review for picked Frogs workout CSVs with new exercises', async () => {
    const csvFile = new File('file:///mock-documents/picked-workout-only-frogs-review.csv');
    csvFile.create();
    csvFile.write(toCsv([createWorkoutCsvRow()]));
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workout-only-frogs-review.csv' }],
    });

    const importResult = await pickAndImportWorkoutCsvData();
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);

    expect(importResult).toEqual(
      expect.objectContaining({
        sourceType: 'frog_workouts_csv',
        status: 'pending_review',
        reviewJobId: importJobCall[1],
      }),
    );
    expect(summary.workoutIds).toEqual(['workout-import-review-1']);
    expect(summary.placeholderExerciseIds).toEqual(['exercise-import-review-1']);
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Remada importada nova',
        placeholderExerciseId: 'exercise-import-review-1',
        workoutExerciseIds: ['we-import-review-1'],
        status: 'pending',
      }),
    ]);
  });

  it('marks exact Frogs workout exercise matches and points imported rows to the existing base exercise', () => {
    const existingExercise = createExerciseRow();
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      if (sql.includes('FROM exercises')) {
        return [existingExercise];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id FROM workout_exercises')) {
        return null;
      }
      if (sql.includes('SELECT id FROM set_entries')) {
        return null;
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return { id: 'exercise-import-1' };
      }
      return null;
    });

    const csv = toCsv([
      createWorkoutCsvRow({
        workout_id: 'workout-match-1',
        workout_exercise_id: 'we-match-1',
        exercise_id: 'exercise-import-1',
        exercise_name: 'Supino reto',
        muscle_group: 'chest',
        secondary_muscles_json: '["triceps"]',
        equipment: 'barbell',
        modality: 'strength',
        instructions: 'Mantenha escápulas firmes.',
        set_id: 'set-match-1',
      }),
    ]);

    const result = importCsvTextForTests(csv, 'frog-workouts-match.csv');
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);
    const workoutExerciseInsert = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO workout_exercises'),
    );

    expect(result.status).toBe('pending_review');
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        status: 'matched',
        differenceCount: 0,
        matchedExerciseId: 'exercise-existing-supino',
        resolvedExerciseId: 'exercise-existing-supino',
      }),
    ]);
    expect(workoutExerciseInsert[12]).toBe('exercise-existing-supino');
  });

  it('counts differences against the matching base exercise instead of imported occurrence count', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      if (sql.includes('FROM exercises')) {
        return [createExerciseRow({ equipment: 'machine' })];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id FROM workout_exercises')) {
        return null;
      }
      if (sql.includes('SELECT id FROM set_entries')) {
        return null;
      }
      return null;
    });

    const csv = toCsv([
      createWorkoutCsvRow({
        workout_id: 'workout-diff-1',
        workout_exercise_id: 'we-diff-1',
        exercise_name: 'Supino reto',
        muscle_group: 'chest',
        secondary_muscles_json: '["triceps"]',
        equipment: 'barbell',
        modality: 'strength',
        instructions: 'Mantenha escápulas firmes.',
        set_id: 'set-diff-1',
      }),
      createWorkoutCsvRow({
        workout_id: 'workout-diff-1',
        workout_exercise_id: 'we-diff-2',
        exercise_name: 'Supino reto',
        muscle_group: 'chest',
        secondary_muscles_json: '["triceps"]',
        equipment: 'barbell',
        modality: 'strength',
        instructions: 'Mantenha escápulas firmes.',
        set_id: 'set-diff-2',
      }),
    ]);

    importCsvTextForTests(csv, 'frog-workouts-diff.csv');
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);

    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Supino reto',
        status: 'pending',
        differenceCount: 1,
        matchedExerciseId: 'exercise-existing-supino',
        workoutExerciseIds: ['we-diff-1', 'we-diff-2'],
      }),
    ]);
  });

  it('uses a full difference count when no exercise with the imported name exists', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM workouts') {
        return [];
      }
      if (sql.includes('FROM exercises')) {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id FROM workout_exercises')) {
        return null;
      }
      if (sql.includes('SELECT id FROM set_entries')) {
        return null;
      }
      return null;
    });

    const csv = toCsv([
      createWorkoutCsvRow({
        workout_id: 'workout-unknown-1',
        workout_exercise_id: 'we-unknown-1',
        exercise_name: 'Remada inédita',
        muscle_group: 'back',
        secondary_muscles_json: '["biceps"]',
        equipment: 'machine',
        modality: 'strength',
        instructions: 'Manter postura neutra.',
        set_id: 'set-unknown-1',
      }),
    ]);

    importCsvTextForTests(csv, 'frog-workouts-unknown.csv');
    const importJobCall = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO import_jobs'),
    );
    const summary = JSON.parse(importJobCall[8]);

    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Remada inédita',
        status: 'pending',
        differenceCount: 6,
        matchedExerciseId: null,
      }),
    ]);
  });

  it('opens review for a picked Hevy CSV through the workout-only picker', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, value?: string) => {
      if (sql.includes('FROM import_jobs') && sql.includes('checksum')) {
        return null;
      }
      if (sql.includes('SELECT id, muscle_group FROM exercises')) {
        return { id: 'exercise-existing-hevy-picker', muscle_group: 'back' };
      }
      if (sql.includes('SELECT id FROM exercises WHERE id = ? LIMIT 1')) {
        return value === 'exercise-existing-hevy-picker' ? { id: value } : null;
      }
      return null;
    });
    const csvFile = new File('file:///mock-documents/picked-workout-only-hevy.csv');
    csvFile.create();
    csvFile.write(
      [
        'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
        'Puxada,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,Tríceps corda,,,0,normal,80,8,,,',
      ].join('\n'),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workout-only-hevy.csv' }],
    });

    const importResult = await pickAndImportWorkoutCsvData();

    expect(importResult?.status).toBe('pending_review');
    expect(importResult?.sourceType).toBe('hevy_csv');
    expect(
      (database.runSync as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('INSERT INTO exercises')),
    ).toEqual(expect.arrayContaining(['Tríceps corda']));
  });

  it('rejects a picked measurements CSV through the workout-only picker without inserting measurements', async () => {
    const csvFile = new File('file:///mock-documents/picked-workout-only-measurements.csv');
    csvFile.create();
    csvFile.write(
      toCsv([
        {
          measurement_id: 'measurement-workout-only-1',
          recorded_at: '2026-03-27T10:00:00.000Z',
          weight_kg: '82',
          chest_cm: '',
          waist_cm: '',
          hips_cm: '',
          arm_cm: '',
          thigh_cm: '',
          note: '',
        },
      ]),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workout-only-measurements.csv' }],
    });

    const importResult = await pickAndImportWorkoutCsvData();

    expect(importResult).toEqual(
      expect.objectContaining({
        status: 'failed',
        insertedCount: 0,
        skippedCount: 0,
        errors: ['Este atalho importa apenas CSVs de treinamento do Frogs ou do Hevy.'],
      }),
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO body_measurements')),
    ).toBe(false);
  });

  it('returns null when the document picker is canceled', async () => {
    (DocumentPicker as any).__setDocumentPickerResult({ canceled: true, assets: [] });

    await expect(pickAndImportCsvData()).resolves.toBeNull();
    await expect(pickAndRestoreBackup()).resolves.toBeNull();
  });

  it('returns null when the picker resolves without a selected asset', async () => {
    (DocumentPicker as any).__setDocumentPickerResult({ canceled: false, assets: [] });

    await expect(pickAndImportCsvData()).resolves.toBeNull();
    await expect(pickAndRestoreBackup()).resolves.toBeNull();
  });

  it('uses the default file names in the helper wrappers', () => {
    const csv = toCsv([
      {
        measurement_id: 'measurement-default',
        recorded_at: '2026-03-27T10:00:00.000Z',
        weight_kg: '80',
        chest_cm: '',
        waist_cm: '',
        hips_cm: '',
        arm_cm: '',
        thigh_cm: '',
        note: '',
      },
    ]);

    const importResult = importCsvTextForTests(csv);
    const restoreResult = restoreBackupTextForTests(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-03-27T10:00:00.000Z',
        deviceId: 'device-1',
        tables: { users: [{ id: 'user-default' }] },
      }),
    );

    expect(importResult.fileName).toBe('test.csv');
    expect(restoreResult.fileName).toBe('frog-backup-v1.json');
  });

  it('resets local app data and exposes a backup envelope helper', async () => {
    (getTableRows as jest.Mock).mockReturnValue([]);

    const backup = createBackupEnvelopeForTests();
    await resetLocalAppData();

    expect(backup.version).toBe(1);
    expect(clearAllWorkoutMediaFiles).toHaveBeenCalledTimes(1);
    expect(resetSeededDatabase).toHaveBeenCalledTimes(1);
    expect(refreshAnalyticsCaches).toHaveBeenCalledTimes(1);
  });
});
