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
    isArchived: row.is_archived === 1,
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

import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import {
  createBackupEnvelopeForTests,
  discardImport,
  exportBackupJson,
  exportMeasurementsCsv,
  exportRoutineJson,
  exportWorkoutCsv,
  exportWorkoutsCsv,
  getImportReview,
  getDataManagementSummary,
  importCsvTextForTests,
  pickAndImportCsvData,
  pickAndImportRoutineJson,
  pickAndImportWorkoutCsvData,
  pickAndRestoreBackup,
  replaceImportExercise,
  resetLocalAppData,
  restoreBackupTextForTests,
  saveImportReview,
  updateImportedExercise,
} from '@/src/modules/data-transfer/service';
import { measurementCsvHeaders, workoutCsvHeaders } from '@/src/modules/data-transfer/adapters';
import {
  clearTable,
  database,
  getAppUser,
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

describe('data transfer service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAppUser as jest.Mock).mockReturnValue({ id: 'user-1' });
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
            exercise_slug: 'supino-reto',
            exercise_name: 'Supino reto',
            muscle_group: 'chest',
            secondary_muscles_json: '["triceps"]',
            equipment: 'barbell',
            modality: 'strength',
            is_custom: 0,
            instructions: 'Mantenha escápulas firmes.',
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
                slug: 'supino-reto',
                name: 'Supino reto',
                secondaryMuscles: ['triceps'],
              }),
            }),
          ],
        }),
      }),
    );
  });

  it('does not export a missing routine JSON', async () => {
    (database.getFirstSync as jest.Mock).mockImplementation(() => null);

    await expect(exportRoutineJson('missing-routine')).rejects.toThrow('Treino salvo não encontrado.');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('imports a Frogs routine JSON with existing exercises as a copied saved workout', async () => {
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

    expect(result).toEqual(
      expect.objectContaining({
        sourceType: 'frog_routine_json',
        fileName: 'upper-importado.json',
        status: 'success',
        insertedCount: 1,
        skippedCount: 0,
        errors: [],
      }),
    );
    expect(database.runSync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO routines'), expect.any(String), expect.any(String), expect.any(String), null, expect.any(Number), expect.any(Number), null, expect.any(String), null, expect.any(String), expect.any(String), 'Upper importado', 'Rotina compartilhada', 'copied', expect.any(Number), 0);
    expect(database.runSync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO routine_exercises'), expect.anything(), expect.anything(), expect.anything(), null, expect.any(Number), expect.any(Number), null, expect.any(String), null, expect.any(String), expect.any(String), 'exercise-existing', 0, 4, '8-10', 90, null, null, null, null, 'manter técnica', '', 'A', 1);
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
    expect(summary.placeholderExerciseIds).toEqual([expect.any(String)]);
    expect(summary.exerciseGroups).toEqual([
      expect.objectContaining({
        importedName: 'Rosca alien',
        placeholderExerciseId: expect.any(String),
        workoutExerciseIds: [],
        routineExerciseIds: [expect.any(String)],
        status: 'pending',
      }),
    ]);
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

  it('returns a data management summary from the local rows', () => {
    const summary = getDataManagementSummary();

    expect(summary.workoutsRows).toBe(1);
    expect(summary.measurementRows).toBe(1);
    expect(summary.lastImportJob?.file_name).toBe('frog-workouts.csv');
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
        user_preferences: [{ id: 'prefs-1', default_workout_visibility: 'private', week_starts_on: 1 }],
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

  it('rejects unknown CSV formats and invalid backup payloads', () => {
    expect(importCsvTextForTests('coluna\nvalor', 'unknown.csv')).toEqual(
      expect.objectContaining({
        status: 'failed',
        errors: ['Formato de CSV não reconhecido. Use um CSV do Frogs ou um CSV exportado pelo Hevy.'],
      }),
    );

    expect(() => restoreBackupTextForTests(JSON.stringify({ version: 2 }), 'invalid.json')).toThrow();
  });

  it('imports a valid Frogs workout CSV payload', () => {
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

    expect(result.status).toBe('success');
    expect(result.insertedCount).toBe(1);
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
        status: 'success',
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

    expect(result.status).toBe('success');
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
        status: 'success',
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
      'exercise-existing-1',
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

    expect(result).toEqual(expect.objectContaining({ status: 'success', insertedCount: 3 }));
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
      'exercise-existing-2',
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
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exercises'),
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
      'puxada-neutra',
      'Puxada neutra',
      'full_body',
      '[]',
      'other',
      'strength',
      1,
      'Exercicio importado localmente.',
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
          is_archived: 0,
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
          is_archived: 0,
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
          is_archived: 0,
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
    expect(importResult?.status).toBe('success');
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

  it('imports a picked Frogs workout CSV through the workout-only picker when exercises already exist', async () => {
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

    expect(importResult?.status).toBe('success');
    expect(importResult?.sourceType).toBe('frog_workouts_csv');
    expect(DocumentPicker.getDocumentAsync).toHaveBeenLastCalledWith({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
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

  it('imports a picked Hevy CSV through the workout-only picker', async () => {
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
        'Puxada,"14 Mar 2026, 19:47","14 Mar 2026, 20:48",,Remada curvada,,,0,normal,80,8,,,',
      ].join('\n'),
    );
    (DocumentPicker as any).__setDocumentPickerResult({
      canceled: false,
      assets: [{ uri: csvFile.uri, name: 'picked-workout-only-hevy.csv' }],
    });

    const importResult = await pickAndImportWorkoutCsvData();

    expect(importResult?.status).toBe('success');
    expect(importResult?.sourceType).toBe('hevy_csv');
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
        tables: { users: [] },
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
