import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { z } from 'zod';

import {
  BackupEnvelopeV1,
  CustomExerciseDraft,
  Equipment,
  ExerciseModality,
  ImportReview,
  ImportReviewGroupSummary,
  ImportReviewSummary,
  ImportJobResult,
  ImportSourceType,
  MeasurementCsvRow,
  MuscleGroup,
  WorkoutCsvRow,
} from '@/src/shared/types/domain';
import {
  clearTable,
  createEntityBase,
  database,
  getAppUser,
  getDeviceId,
  getTableRows,
  initializeDatabase,
  insertRow,
  resetSeededDatabase,
  runInTransaction,
  writeAuditLog,
} from '@/src/shared/db/database';
import { parseCsv, simpleChecksum, toCsv } from '@/src/shared/utils/csv';
import { createId } from '@/src/shared/utils/id';
import { nowIso } from '@/src/shared/utils/date';
import { refreshAnalyticsCaches } from '@/src/modules/progress/service';
import { clearAllWorkoutMediaFiles } from '@/src/modules/media/service';
import { getExerciseById, saveCustomExercise } from '@/src/modules/exercises/service';
import {
  detectCsvImportKind,
  inferHevySetType,
  measurementCsvHeaders,
  parseNullableImportNumber,
  workoutCsvHeaders,
} from '@/src/modules/data-transfer/adapters';

const EXPORT_DIRECTORY_NAME = 'frog-exports';

const BACKUP_TABLES = [
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
  'workout_media',
  'body_measurements',
  'pr_records',
  'exercise_history_snapshots',
  'sync_queue_items',
  'workout_draft_snapshots',
  'audit_logs',
  'analytics_daily',
  'muscle_period_snapshots',
  'monthly_reports',
  'yearly_reviews',
  'import_jobs',
] as const;

const RESTORE_CLEAR_ORDER = [...BACKUP_TABLES].reverse();

const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  deviceId: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

const routineJsonExerciseSchema = z.object({
  exerciseId: z.string().optional(),
  targetSets: z.coerce.number().int().min(1).default(1),
  targetRepsLabel: z.string().optional().default(''),
  restSeconds: z.coerce.number().int().min(0).default(0),
  cardioDurationSeconds: z.coerce.number().int().min(0).nullable().optional().default(null),
  cardioDistanceMeters: z.coerce.number().min(0).nullable().optional().default(null),
  cardioSpeed: z.coerce.number().nullable().optional().default(null),
  cardioElevation: z.coerce.number().nullable().optional().default(null),
  note: z.string().optional().default(''),
  privateLink: z.string().optional().default(''),
  supersetGroup: z.string().optional().default(''),
  warmupEnabled: z.boolean().optional().default(false),
  exercise: z.object({
    id: z.string().optional(),
    slug: z.string().optional().default(''),
    name: z.string().min(1),
    muscleGroup: z.string().optional().default('full_body'),
    secondaryMuscles: z.array(z.string()).optional().default([]),
    equipment: z.string().optional().default('other'),
    modality: z.string().optional().default('strength'),
    instructions: z.string().nullable().optional().default(''),
    isCustom: z.boolean().optional().default(true),
  }),
});

const routineJsonEnvelopeSchema = z.object({
  kind: z.literal('frog_routine'),
  version: z.literal(1),
  exportedAt: z.string(),
  routine: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().nullable().optional().default(''),
    folderName: z.string().nullable().optional().default(''),
    exercises: z.array(routineJsonExerciseSchema).default([]),
  }),
});

const workoutRowSchema = z.object({
  workout_id: z.string().min(1),
  workout_title: z.string().min(1),
  workout_started_at: z.string().min(1),
  workout_ended_at: z.string().optional().default(''),
  workout_duration_seconds: z.coerce.number().min(0),
  workout_status: z.enum(['draft', 'in_progress', 'completed', 'discarded']),
  workout_source: z.enum(['empty', 'routine', 'library', 'copied']),
  workout_note: z.string().optional().default(''),
  workout_exercise_id: z.string().min(1),
  exercise_id: z.string().min(1),
  exercise_name: z.string().min(1),
  exercise_sort_order: z.coerce.number().int().min(0),
  exercise_note: z.string().optional().default(''),
  rest_seconds: z.coerce.number().int().min(0),
  previous_performance: z.string().optional().default(''),
  superset_group: z.string().optional().default(''),
  muscle_group: z.custom<MuscleGroup>(),
  set_id: z.string().min(1),
  set_index: z.coerce.number().int().min(0),
  set_type: z.enum(['normal', 'warmup', 'drop', 'failure', 'superset', 'assisted', 'timed', 'distance']),
  reps: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  weight_kg: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  duration_seconds: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  distance_meters: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  speed: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  elevation: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  rpe: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  is_completed: z.string().transform((value) => (value === '1' ? 1 : 0)),
});

const measurementRowSchema = z.object({
  measurement_id: z.string().min(1),
  recorded_at: z.string().min(1),
  weight_kg: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  chest_cm: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  waist_cm: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  hips_cm: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  arm_cm: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  thigh_cm: z.string().optional().transform((value) => parseNullableImportNumber(value)),
  related_workout_id: z.string().optional().transform((value) => value?.trim() || null),
  note: z.string().optional().transform((value) => value?.trim() || null),
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const createHeaderOnlyCsv = (headers: readonly string[]) => headers.join(',');

const getExportDirectory = () => {
  const directory = new Directory(Paths.document, EXPORT_DIRECTORY_NAME);
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
};

const writeTextFile = (fileName: string, content: string) => {
  const directory = getExportDirectory();
  const file = new File(directory, fileName);

  if (file.exists) {
    file.delete();
  }

  file.create({ intermediates: true, overwrite: true });
  file.write(content);
  return file;
};

const shareFile = async (file: File, mimeType: string, dialogTitle: string) => {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle,
      UTI: mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text',
    });
  }

  return file.uri;
};

const getBlockingImportByChecksum = (checksum: string) =>
  database.getFirstSync<{ id: string }>(
    `
      SELECT id
      FROM import_jobs
      WHERE checksum = ? AND status IN ('success', 'pending_review')
      LIMIT 1
    `,
    checksum,
  );

const recordImportJob = (
  result: ImportJobResult,
  checksum: string,
  fileName: string,
  summary?: Record<string, unknown>,
) => {
  const timestamp = nowIso();
  const importJobId = createId();
  database.runSync(
    `
      INSERT INTO import_jobs (
        id, created_at, updated_at, source_type, file_name, checksum, status, summary_json, error_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    importJobId,
    timestamp,
    timestamp,
    result.sourceType,
    fileName,
    checksum,
    result.status,
    JSON.stringify(summary ?? {
      insertedCount: result.insertedCount,
      skippedCount: result.skippedCount,
    }),
    result.errors.length > 0 ? JSON.stringify(result.errors) : null,
  );

  writeAuditLog('import_job', fileName, result.status, {
    checksum,
    ...result,
  });

  return importJobId;
};

const ensureExerciseExists = (exerciseId: string, exerciseName: string, muscleGroup: MuscleGroup) => {
  const existing = database.getFirstSync<{ id: string }>('SELECT id FROM exercises WHERE id = ? LIMIT 1', exerciseId);
  if (existing) {
    return;
  }

  const sluggedExercise = database.getFirstSync<{ id: string }>(
    'SELECT id FROM exercises WHERE lower(slug) = lower(?) LIMIT 1',
    slugify(exerciseName),
  );

  if (sluggedExercise) {
    return;
  }

  const namedExercise = database.getFirstSync<{ id: string }>(
    'SELECT id FROM exercises WHERE lower(name) = lower(?) LIMIT 1',
    exerciseName,
  );

  if (namedExercise) {
    return;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO exercises (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        slug, name, muscle_group, secondary_muscles_json, equipment, modality, is_custom, instructions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    exerciseId || base.id,
    base.createdAt,
    base.updatedAt,
    null,
    base.version,
    base.schemaVersion,
    null,
    base.syncState,
    null,
    base.originDeviceId,
    slugify(exerciseName),
    exerciseName,
    muscleGroup,
    '[]',
    'other',
    'strength',
    1,
    'Exercicio importado localmente.',
  );
};

const findExerciseById = (exerciseId: string) =>
  database.getFirstSync<{ id: string }>('SELECT id FROM exercises WHERE id = ? LIMIT 1', exerciseId);

const findExerciseByNameOrSlug = (exerciseName: string) =>
  database.getFirstSync<{ id: string; muscle_group: MuscleGroup }>(
    'SELECT id, muscle_group FROM exercises WHERE lower(name) = lower(?) OR lower(slug) = lower(?) LIMIT 1',
    exerciseName,
    slugify(exerciseName),
  );

const recomputeWorkoutTotals = (workoutIds: string[]) => {
  const uniqueWorkoutIds = [...new Set(workoutIds)];

  uniqueWorkoutIds.forEach((workoutId) => {
    const aggregate =
      database.getFirstSync<{
        total_volume: number;
        total_reps: number;
        total_distance_meters: number;
      }>(
        `
          SELECT
            COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
            COALESCE(SUM(se.reps), 0) AS total_reps,
            COALESCE(SUM(se.distance_meters), 0) AS total_distance_meters
          FROM workout_exercises we
          LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
          WHERE we.workout_id = ?
        `,
        workoutId,
      ) ?? {
        total_volume: 0,
        total_reps: 0,
        total_distance_meters: 0,
      };

    database.runSync(
      `
        UPDATE workouts
        SET total_volume = ?, total_reps = ?, total_distance_meters = ?, updated_at = ?
        WHERE id = ?
      `,
      aggregate.total_volume,
      aggregate.total_reps,
      aggregate.total_distance_meters,
      nowIso(),
      workoutId,
    );
  });
};

const toWorkoutCsvRows = (workoutId?: string): WorkoutCsvRow[] => {
  const workoutIdClause = workoutId ? 'AND w.id = ?' : '';
  const params = workoutId ? [workoutId] : [];

  return database.getAllSync<WorkoutCsvRow>(
    `
      SELECT
        w.id AS workout_id,
        w.title AS workout_title,
        w.started_at AS workout_started_at,
        COALESCE(w.ended_at, '') AS workout_ended_at,
        w.duration_seconds AS workout_duration_seconds,
        w.status AS workout_status,
        w.source AS workout_source,
        COALESCE(w.general_note, '') AS workout_note,
        we.id AS workout_exercise_id,
        e.id AS exercise_id,
        e.name AS exercise_name,
        we.sort_order AS exercise_sort_order,
        COALESCE(we.note, '') AS exercise_note,
        we.rest_seconds AS rest_seconds,
        COALESCE(we.previous_performance, '') AS previous_performance,
        COALESCE(we.superset_group, '') AS superset_group,
        e.muscle_group AS muscle_group,
        se.id AS set_id,
        se.set_index AS set_index,
        se.type AS set_type,
        se.reps AS reps,
        se.weight_kg AS weight_kg,
        se.duration_seconds AS duration_seconds,
        se.distance_meters AS distance_meters,
        se.speed AS speed,
        se.elevation AS elevation,
        se.rpe AS rpe,
        se.is_completed AS is_completed
      FROM workouts w
      JOIN workout_exercises we ON we.workout_id = w.id
      JOIN exercises e ON e.id = we.exercise_id
      JOIN set_entries se ON se.workout_exercise_id = we.id
      WHERE w.status = 'completed'
        AND w.deleted_at IS NULL
        AND we.deleted_at IS NULL
        AND se.deleted_at IS NULL
        ${workoutIdClause}
      ORDER BY w.started_at DESC, we.sort_order ASC, se.set_index ASC
    `,
    ...params,
  );
};

const toMeasurementCsvRows = (): MeasurementCsvRow[] =>
  database.getAllSync<MeasurementCsvRow>(
    `
      SELECT
        id AS measurement_id,
        recorded_at,
        weight_kg,
        chest_cm,
        waist_cm,
        hips_cm,
        arm_cm,
        thigh_cm,
        COALESCE(note, '') AS note
      FROM body_measurements
      ORDER BY recorded_at DESC
    `,
  );

export const exportWorkoutsCsv = async () => {
  const rows = toWorkoutCsvRows();
  const content =
    rows.length > 0 ? toCsv(rows as unknown as Record<string, unknown>[]) : createHeaderOnlyCsv(workoutCsvHeaders);
  const file = writeTextFile(`frog-workouts-${new Date().toISOString().slice(0, 10)}.csv`, content);
  writeAuditLog('data_export', 'workouts_csv', 'exported', { rows: rows.length, uri: file.uri });
  return shareFile(file, 'text/csv', 'Exportar treinos');
};

export const exportWorkoutCsv = async (workoutId: string) => {
  const rows = toWorkoutCsvRows(workoutId);
  if (rows.length === 0) {
    throw new Error('Este treino ainda não tem séries para compartilhar.');
  }

  const firstRow = rows[0];
  const titleSlug = slugify(firstRow.workout_title) || firstRow.workout_id;
  const dateSlug = firstRow.workout_started_at.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const content = toCsv(rows as unknown as Record<string, unknown>[]);
  const file = writeTextFile(`frog-workout-${titleSlug}-${dateSlug}.csv`, content);
  writeAuditLog('data_export', 'workout_csv', 'exported', { workoutId, rows: rows.length, uri: file.uri });
  return shareFile(file, 'text/csv', 'Compartilhar treino');
};

const parseJsonStringArray = (value: string | null | undefined) => {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const toRoutineJsonEnvelope = (routineId: string) => {
  const routine = database.getFirstSync<{
    id: string;
    name: string;
    description: string | null;
    source: string;
    estimated_minutes: number | null;
    folder_name: string | null;
  }>(
    `
      SELECT
        r.id,
        r.name,
        r.description,
        r.source,
        r.estimated_minutes,
        rf.name AS folder_name
      FROM routines r
      LEFT JOIN routine_folders rf ON rf.id = r.folder_id AND rf.deleted_at IS NULL
      WHERE r.id = ? AND r.deleted_at IS NULL
      LIMIT 1
    `,
    routineId,
  );

  if (!routine) {
    return null;
  }

  const exercises = database.getAllSync<{
    id: string;
    exercise_id: string;
    target_sets: number;
    target_reps_label: string;
    rest_seconds: number;
    cardio_duration_seconds: number | null;
    cardio_distance_meters: number | null;
    cardio_speed: number | null;
    cardio_elevation: number | null;
    note: string | null;
    private_link: string | null;
    superset_group: string | null;
    warmup_enabled: number;
    exercise_slug: string;
    exercise_name: string;
    muscle_group: string;
    secondary_muscles_json: string;
    equipment: string;
    modality: string;
    is_custom: number;
    instructions: string | null;
  }>(
    `
      SELECT
        re.id,
        re.exercise_id,
        re.target_sets,
        re.target_reps_label,
        re.rest_seconds,
        re.cardio_duration_seconds,
        re.cardio_distance_meters,
        re.cardio_speed,
        re.cardio_elevation,
        re.note,
        re.private_link,
        re.superset_group,
        re.warmup_enabled,
        e.slug AS exercise_slug,
        e.name AS exercise_name,
        e.muscle_group,
        e.secondary_muscles_json,
        e.equipment,
        e.modality,
        e.is_custom,
        e.instructions
      FROM routine_exercises re
      JOIN exercises e ON e.id = re.exercise_id AND e.deleted_at IS NULL
      WHERE re.routine_id = ? AND re.deleted_at IS NULL
      ORDER BY re.sort_order ASC
    `,
    routineId,
  );

  return {
    kind: 'frog_routine' as const,
    version: 1 as const,
    exportedAt: nowIso(),
    routine: {
      id: routine.id,
      name: routine.name,
      description: routine.description ?? '',
      source: routine.source,
      estimatedMinutes: routine.estimated_minutes,
      folderName: routine.folder_name ?? '',
      exercises: exercises.map((exercise) => ({
        routineExerciseId: exercise.id,
        exerciseId: exercise.exercise_id,
        targetSets: exercise.target_sets,
        targetRepsLabel: exercise.target_reps_label,
        restSeconds: exercise.rest_seconds,
        cardioDurationSeconds: exercise.cardio_duration_seconds,
        cardioDistanceMeters: exercise.cardio_distance_meters,
        cardioSpeed: exercise.cardio_speed,
        cardioElevation: exercise.cardio_elevation,
        note: exercise.note ?? '',
        privateLink: exercise.private_link ?? '',
        supersetGroup: exercise.superset_group ?? '',
        warmupEnabled: exercise.warmup_enabled === 1,
        exercise: {
          id: exercise.exercise_id,
          slug: exercise.exercise_slug,
          name: exercise.exercise_name,
          muscleGroup: exercise.muscle_group,
          secondaryMuscles: parseJsonStringArray(exercise.secondary_muscles_json),
          equipment: exercise.equipment,
          modality: exercise.modality,
          instructions: exercise.instructions ?? '',
          isCustom: exercise.is_custom === 1,
        },
      })),
    },
  };
};

export const exportRoutineJson = async (routineId: string) => {
  const envelope = toRoutineJsonEnvelope(routineId);
  if (!envelope) {
    throw new Error('Treino salvo não encontrado.');
  }

  const titleSlug = slugify(envelope.routine.name) || routineId;
  const dateSlug = new Date().toISOString().slice(0, 10);
  const file = writeTextFile(`frog-routine-${titleSlug}-${dateSlug}.json`, JSON.stringify(envelope, null, 2));
  writeAuditLog('data_export', 'routine_json', 'exported', {
    routineId,
    exercises: envelope.routine.exercises.length,
    uri: file.uri,
  });
  return shareFile(file, 'application/json', 'Compartilhar treino');
};

export const exportMeasurementsCsv = async () => {
  const rows = toMeasurementCsvRows();
  const content = rows.length > 0
    ? toCsv(rows as unknown as Record<string, unknown>[])
    : createHeaderOnlyCsv(measurementCsvHeaders);
  const file = writeTextFile(`frog-measurements-${new Date().toISOString().slice(0, 10)}.csv`, content);
  writeAuditLog('data_export', 'measurements_csv', 'exported', { rows: rows.length, uri: file.uri });
  return shareFile(file, 'text/csv', 'Exportar medidas');
};

export const exportBackupJson = async () => {
  const backup: BackupEnvelopeV1 = {
    version: 1,
    exportedAt: nowIso(),
    deviceId: getDeviceId(),
    tables: Object.fromEntries(BACKUP_TABLES.map((tableName) => [tableName, getTableRows(tableName)])),
  };
  const file = writeTextFile('frog-backup-v1.json', JSON.stringify(backup, null, 2));
  writeAuditLog('data_export', 'backup_json', 'exported', { uri: file.uri, tables: BACKUP_TABLES.length });
  return shareFile(file, 'application/json', 'Exportar backup');
};

const readPickedFile = async (acceptedTypes: string | string[]) => {
  const result = await DocumentPicker.getDocumentAsync({
    type: acceptedTypes,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const content = await file.text();

  return {
    fileName: asset.name,
    content,
  };
};

type RoutineJsonEnvelope = z.infer<typeof routineJsonEnvelopeSchema>;
type RoutineJsonExercise = RoutineJsonEnvelope['routine']['exercises'][number];

const normalizeRoutineImportText = (value: string | null | undefined) => value?.trim() ?? '';

const findRoutineJsonExercise = (exercise: RoutineJsonExercise) => {
  const importedExerciseId = normalizeRoutineImportText(exercise.exerciseId ?? exercise.exercise.id);
  if (importedExerciseId) {
    const existingById = findExerciseById(importedExerciseId);
    if (existingById) {
      return existingById.id;
    }
  }

  const importedSlug = slugify(exercise.exercise.slug || exercise.exercise.name);
  const importedName = normalizeRoutineImportText(exercise.exercise.name);
  const existingByNameOrSlug = database.getFirstSync<{ id: string }>(
    'SELECT id FROM exercises WHERE lower(slug) = lower(?) OR lower(name) = lower(?) LIMIT 1',
    importedSlug,
    importedName,
  );

  return existingByNameOrSlug?.id ?? null;
};

const buildUniqueImportedExerciseSlug = (name: string, preferredSlug?: string | null) => {
  const baseSlug = slugify(preferredSlug || name) || 'exercicio-importado';
  let slug = baseSlug;
  let suffix = 2;

  while (database.getFirstSync<{ id: string }>('SELECT id FROM exercises WHERE slug = ? LIMIT 1', slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
};

const createImportedRoutineExercise = (exercise: RoutineJsonExercise) => {
  const base = createEntityBase();
  const exerciseName = normalizeRoutineImportText(exercise.exercise.name) || 'Exercício importado';
  const slug = buildUniqueImportedExerciseSlug(exerciseName, exercise.exercise.slug);
  const secondaryMuscles = exercise.exercise.secondaryMuscles.filter((item) => typeof item === 'string');

  database.runSync(
    `
      INSERT INTO exercises (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        slug, name, muscle_group, secondary_muscles_json, equipment, modality, is_custom, is_archived, instructions
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
    slug,
    exerciseName,
    exercise.exercise.muscleGroup as MuscleGroup,
    JSON.stringify(secondaryMuscles),
    exercise.exercise.equipment as Equipment,
    exercise.exercise.modality as ExerciseModality,
    1,
    0,
    normalizeRoutineImportText(exercise.exercise.instructions ?? ''),
  );

  return base.id;
};

const findOrCreateImportedRoutineFolder = (folderName: string | null | undefined) => {
  const trimmedFolderName = normalizeRoutineImportText(folderName);
  if (!trimmedFolderName) {
    return { id: null, created: false };
  }

  const existingFolder = database.getFirstSync<{ id: string }>(
    'SELECT id FROM routine_folders WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1',
    trimmedFolderName,
  );
  if (existingFolder) {
    return { id: existingFolder.id, created: false };
  }

  const folderBase = createEntityBase();
  const nextSortOrder =
    database.getFirstSync<{ next_sort_order: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM routine_folders WHERE deleted_at IS NULL',
    )?.next_sort_order ?? 0;

  database.runSync(
    `
      INSERT INTO routine_folders (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        name, color_token, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    folderBase.id,
    folderBase.createdAt,
    folderBase.updatedAt,
    null,
    folderBase.version,
    folderBase.schemaVersion,
    null,
    folderBase.syncState,
    null,
    folderBase.originDeviceId,
    trimmedFolderName,
    'blue',
    nextSortOrder,
  );

  return { id: folderBase.id, created: true };
};

const importRoutineJsonContent = (content: string, fileName: string): ImportJobResult => {
  const checksum = simpleChecksum(content);

  try {
    const parsed = routineJsonEnvelopeSchema.parse(JSON.parse(content));
    let importedRoutineId = '';
    const importedRoutineExerciseIds: string[] = [];
    const createdRoutineFolderIds: string[] = [];
    const placeholderExerciseIds: string[] = [];
    const reviewGroupsByKey = new Map<string, ImportReviewGroupSummary>();

    runInTransaction(() => {
      const routineBase = createEntityBase();
      const folder = findOrCreateImportedRoutineFolder(parsed.routine.folderName);
      if (folder.id && folder.created) {
        createdRoutineFolderIds.push(folder.id);
      }

      const placeholderByReviewKey = new Map<string, string>();
      const exercises = parsed.routine.exercises.map((exercise, index) => {
        const existingExerciseId = findRoutineJsonExercise(exercise);
        if (existingExerciseId) {
          return {
            ...exercise,
            exerciseId: existingExerciseId,
            reviewKey: null,
            sortOrder: index,
          };
        }

        const importedName = normalizeRoutineImportText(exercise.exercise.name) || 'Exercício importado';
        const reviewKey = importReviewGroupKey(importedName);
        let placeholderExerciseId = placeholderByReviewKey.get(reviewKey);
        if (!placeholderExerciseId) {
          placeholderExerciseId = createImportedRoutineExercise(exercise);
          placeholderByReviewKey.set(reviewKey, placeholderExerciseId);
          placeholderExerciseIds.push(placeholderExerciseId);
          reviewGroupsByKey.set(reviewKey, {
            key: reviewKey,
            importedName,
            placeholderExerciseId,
            workoutExerciseIds: [],
            routineExerciseIds: [],
            status: 'pending',
          });
        }

        return {
          ...exercise,
          exerciseId: placeholderExerciseId,
          reviewKey,
          sortOrder: index,
        };
      });

      database.runSync(
        `
          INSERT INTO routines (
            id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
            folder_id, name, description, source, estimated_minutes, is_archived
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        routineBase.id,
        routineBase.createdAt,
        routineBase.updatedAt,
        null,
        routineBase.version,
        routineBase.schemaVersion,
        null,
        routineBase.syncState,
        null,
        routineBase.originDeviceId,
        folder.id,
        parsed.routine.name.trim(),
        normalizeRoutineImportText(parsed.routine.description),
        'copied',
        Math.max(20, exercises.length * 9),
        reviewGroupsByKey.size > 0 ? 1 : 0,
      );

      exercises.forEach((exercise) => {
        const routineExerciseBase = createEntityBase();
        importedRoutineExerciseIds.push(routineExerciseBase.id);
        database.runSync(
          `
            INSERT INTO routine_exercises (
              id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
              routine_id, exercise_id, sort_order, target_sets, target_reps_label, rest_seconds, cardio_duration_seconds, cardio_distance_meters, cardio_speed, cardio_elevation,
              note, private_link, superset_group, warmup_enabled
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          routineExerciseBase.id,
          routineExerciseBase.createdAt,
          routineExerciseBase.updatedAt,
          null,
          routineExerciseBase.version,
          routineExerciseBase.schemaVersion,
          null,
          routineExerciseBase.syncState,
          null,
          routineExerciseBase.originDeviceId,
          routineBase.id,
          exercise.exerciseId,
          exercise.sortOrder,
          exercise.targetSets,
          exercise.targetRepsLabel.trim(),
          exercise.restSeconds,
          exercise.cardioDurationSeconds,
          exercise.cardioDistanceMeters,
          exercise.cardioSpeed,
          exercise.cardioElevation,
          normalizeRoutineImportText(exercise.note),
          normalizeRoutineImportText(exercise.privateLink),
          normalizeRoutineImportText(exercise.supersetGroup),
          exercise.warmupEnabled ? 1 : 0,
        );

        if (exercise.reviewKey) {
          reviewGroupsByKey.get(exercise.reviewKey)?.routineExerciseIds?.push(routineExerciseBase.id);
        }
      });

      importedRoutineId = routineBase.id;
    });

    const reviewSummary: ImportReviewSummary | undefined = reviewGroupsByKey.size > 0
      ? {
          insertedCount: 1,
          skippedCount: 0,
          workoutIds: [],
          routineIds: [importedRoutineId],
          routineExerciseIds: importedRoutineExerciseIds,
          createdRoutineFolderIds,
          placeholderExerciseIds,
          exerciseGroups: [...reviewGroupsByKey.values()],
        }
      : undefined;

    const result: ImportJobResult = {
      sourceType: 'frog_routine_json',
      fileName,
      status: reviewSummary ? 'pending_review' : 'success',
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
    };
    const importJobId = recordImportJob(result, checksum, fileName, reviewSummary ?? {
      insertedCount: 1,
      skippedCount: 0,
      routineId: importedRoutineId,
      exercisesCount: parsed.routine.exercises.length,
    });
    if (reviewSummary) {
      result.reviewJobId = importJobId;
    }
    writeAuditLog('routine', importedRoutineId, 'imported_json', {
      fileName,
      originalRoutineId: parsed.routine.id ?? null,
      exercises: parsed.routine.exercises.length,
      status: result.status,
    });

    return result;
  } catch {
    const result: ImportJobResult = {
      sourceType: 'frog_routine_json',
      fileName,
      status: 'failed',
      insertedCount: 0,
      skippedCount: 0,
      errors: ['Formato de JSON de rotina não reconhecido. Use um JSON de rotina exportado pelo Frogs.'],
    };
    recordImportJob(result, checksum, fileName);
    return result;
  }
};

const insertWorkoutCsvRows = (
  rows: Record<string, string>[],
  fileName: string,
  checksum: string,
  options: { reviewUnknownExercises?: boolean } = {},
): ImportJobResult => {
  const result: ImportJobResult = {
    sourceType: 'frog_workouts_csv',
    fileName,
    status: 'success',
    insertedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  const importedWorkoutIds: string[] = [];
  const placeholderExerciseIds: string[] = [];
  const reviewGroupsByKey = new Map<string, ImportReviewGroupSummary>();
  const exerciseResolutionByKey = new Map<string, { exerciseId: string; isPlaceholder: boolean }>();
  const existingWorkoutIds = new Set(
    database
      .getAllSync<{ id: string }>('SELECT id FROM workouts')
      .map((row) => row.id),
  );
  const insertedWorkoutIds = new Set<string>();

  runInTransaction(() => {
    rows.forEach((row) => {
      const parsed = workoutRowSchema.parse(row);

      if (existingWorkoutIds.has(parsed.workout_id)) {
        result.skippedCount += 1;
        return;
      }

      let resolvedExerciseId = parsed.exercise_id;
      let resolvedExerciseIsPlaceholder = false;
      const importedExerciseKey = importReviewGroupKey(parsed.exercise_name);

      if (options.reviewUnknownExercises) {
        let exerciseResolution = exerciseResolutionByKey.get(importedExerciseKey);

        if (!exerciseResolution) {
          const existingById = findExerciseById(parsed.exercise_id);
          const existingByNameOrSlug = existingById ? null : findExerciseByNameOrSlug(parsed.exercise_name);

          if (existingById ?? existingByNameOrSlug) {
            exerciseResolution = {
              exerciseId: (existingById ?? existingByNameOrSlug)!.id,
              isPlaceholder: false,
            };
          } else {
            const placeholderExerciseId = parsed.exercise_id || createId();
            ensureExerciseExists(placeholderExerciseId, parsed.exercise_name, parsed.muscle_group);
            exerciseResolution = { exerciseId: placeholderExerciseId, isPlaceholder: true };
            placeholderExerciseIds.push(placeholderExerciseId);
            reviewGroupsByKey.set(importedExerciseKey, {
              key: importedExerciseKey,
              importedName: parsed.exercise_name,
              placeholderExerciseId,
              workoutExerciseIds: [],
              status: 'pending',
              resolvedExerciseId: null,
            });
          }

          exerciseResolutionByKey.set(importedExerciseKey, exerciseResolution);
        }

        resolvedExerciseId = exerciseResolution.exerciseId;
        resolvedExerciseIsPlaceholder = exerciseResolution.isPlaceholder;
      } else {
        ensureExerciseExists(parsed.exercise_id, parsed.exercise_name, parsed.muscle_group);
      }

      if (!insertedWorkoutIds.has(parsed.workout_id)) {
        const base = createEntityBase();
        database.runSync(
          `
            INSERT INTO workouts (
              id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
              routine_id, title, status, source, started_at, ended_at, duration_seconds, general_note, total_volume, total_reps, total_distance_meters
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          parsed.workout_id,
          base.createdAt,
          base.updatedAt,
          null,
          base.version,
          base.schemaVersion,
          null,
          base.syncState,
          null,
          base.originDeviceId,
          null,
          parsed.workout_title,
          parsed.workout_status,
          parsed.workout_source,
          parsed.workout_started_at,
          parsed.workout_ended_at || parsed.workout_started_at,
          parsed.workout_duration_seconds,
          parsed.workout_note,
          0,
          0,
          0,
        );

        importedWorkoutIds.push(parsed.workout_id);
        insertedWorkoutIds.add(parsed.workout_id);
      }

      const exerciseAlreadyInserted = database.getFirstSync<{ id: string }>(
        'SELECT id FROM workout_exercises WHERE id = ? LIMIT 1',
        parsed.workout_exercise_id,
      );

      if (!exerciseAlreadyInserted) {
        const base = createEntityBase();
        database.runSync(
          `
            INSERT INTO workout_exercises (
              id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
              workout_id, exercise_id, sort_order, note, rest_seconds, previous_performance, superset_group
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          parsed.workout_exercise_id,
          base.createdAt,
          base.updatedAt,
          null,
          base.version,
          base.schemaVersion,
          null,
          base.syncState,
          null,
          base.originDeviceId,
          parsed.workout_id,
          resolvedExerciseId,
          parsed.exercise_sort_order,
          parsed.exercise_note,
          parsed.rest_seconds,
          parsed.previous_performance,
          parsed.superset_group,
        );

        if (resolvedExerciseIsPlaceholder) {
          reviewGroupsByKey.get(importedExerciseKey)?.workoutExerciseIds.push(parsed.workout_exercise_id);
        }
      }

      const setExists = database.getFirstSync<{ id: string }>('SELECT id FROM set_entries WHERE id = ? LIMIT 1', parsed.set_id);
      if (setExists) {
        result.skippedCount += 1;
        return;
      }

      const base = createEntityBase();
      database.runSync(
        `
          INSERT INTO set_entries (
            id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
            workout_exercise_id, set_index, type, reps, weight_kg, duration_seconds, distance_meters, speed, elevation, rpe, completed_at, is_completed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        parsed.set_id,
        base.createdAt,
        base.updatedAt,
        null,
        base.version,
        base.schemaVersion,
        null,
        base.syncState,
        null,
        base.originDeviceId,
        parsed.workout_exercise_id,
        parsed.set_index,
        parsed.set_type,
        parsed.reps,
        parsed.weight_kg,
        parsed.duration_seconds,
        parsed.distance_meters,
        parsed.speed,
        parsed.elevation,
        parsed.rpe,
        parsed.is_completed === 1 ? parsed.workout_ended_at || parsed.workout_started_at : null,
        parsed.is_completed,
      );

      result.insertedCount += 1;
    });
  });

  recomputeWorkoutTotals(importedWorkoutIds);
  refreshAnalyticsCaches();
  const reviewSummary: ImportReviewSummary | undefined = options.reviewUnknownExercises
    ? {
        insertedCount: result.insertedCount,
        skippedCount: result.skippedCount,
        workoutIds: importedWorkoutIds,
        placeholderExerciseIds,
        exerciseGroups: [...reviewGroupsByKey.values()],
      }
    : undefined;

  if (reviewSummary && reviewSummary.exerciseGroups.length > 0) {
    result.status = 'pending_review';
  }

  const importJobId = recordImportJob(result, checksum, fileName, reviewSummary);
  if (result.status === 'pending_review') {
    result.reviewJobId = importJobId;
  }

  return result;
};

const insertMeasurementCsvRows = (rows: Record<string, string>[], fileName: string, checksum: string): ImportJobResult => {
  const result: ImportJobResult = {
    sourceType: 'frog_measurements_csv',
    fileName,
    status: 'success',
    insertedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  const user = getAppUser();
  if (!user) {
    throw new Error('User not initialized');
  }

  runInTransaction(() => {
    rows.forEach((row) => {
      const parsed = measurementRowSchema.parse(row);
      const existing = database.getFirstSync<{ id: string }>(
        'SELECT id FROM body_measurements WHERE id = ? LIMIT 1',
        parsed.measurement_id,
      );

      if (existing) {
        result.skippedCount += 1;
        return;
      }

      const base = createEntityBase();
      database.runSync(
        `
          INSERT INTO body_measurements (
            id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
            user_id, recorded_at, weight_kg, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        parsed.measurement_id,
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
        parsed.recorded_at,
        parsed.weight_kg,
        parsed.chest_cm,
        parsed.waist_cm,
        parsed.hips_cm,
        parsed.arm_cm,
        parsed.thigh_cm,
        parsed.note,
      );

      result.insertedCount += 1;
    });
  });

  refreshAnalyticsCaches();
  recordImportJob(result, checksum, fileName);
  return result;
};

const hevyMonthIndexes: Record<string, number> = {
  jan: 0,
  janeiro: 0,
  feb: 1,
  fev: 1,
  fevereiro: 1,
  mar: 2,
  marco: 2,
  apr: 3,
  abr: 3,
  abril: 3,
  may: 4,
  mai: 4,
  maio: 4,
  jun: 5,
  junho: 5,
  jul: 6,
  julho: 6,
  aug: 7,
  ago: 7,
  agosto: 7,
  sep: 8,
  set: 8,
  setembro: 8,
  oct: 9,
  out: 9,
  outubro: 9,
  nov: 10,
  novembro: 10,
  dec: 11,
  dez: 11,
  dezembro: 11,
};

const normalizeHevyMonth = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parseHevyDateTime = (value: string, rowNumber: number, fieldName: string) => {
  const match = value.trim().match(/^(\d{1,2})\s+([^\s]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Linha ${rowNumber} do Hevy CSV tem ${fieldName} invalido.`);
  }

  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const monthIndex = hevyMonthIndexes[normalizeHevyMonth(monthText)];
  if (monthIndex == null) {
    throw new Error(`Linha ${rowNumber} do Hevy CSV tem ${fieldName} invalido.`);
  }

  const day = Number(dayText);
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const parsed = new Date(year, monthIndex, day, hour, minute);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    throw new Error(`Linha ${rowNumber} do Hevy CSV tem ${fieldName} invalido.`);
  }

  return parsed;
};

const toDistanceMeters = (distanceKm: string | undefined) => {
  const parsed = parseNullableImportNumber(distanceKm);
  return parsed == null ? null : parsed * 1000;
};

const importReviewGroupKey = (exerciseName: string) => slugify(exerciseName) || `exercise-${simpleChecksum(exerciseName)}`;

type ReviewableImportSourceType = Extract<ImportSourceType, 'hevy_csv' | 'frog_workouts_csv' | 'frog_routine_json'>;

const isReviewableImportSourceType = (sourceType: ImportSourceType): sourceType is ReviewableImportSourceType =>
  sourceType === 'hevy_csv' || sourceType === 'frog_workouts_csv' || sourceType === 'frog_routine_json';

type ImportJobRow = {
  id: string;
  source_type: ImportSourceType;
  file_name: string;
  status: ImportJobResult['status'];
  summary_json: string | null;
};

const normalizeImportReviewGroup = (group: Partial<ImportReviewGroupSummary>): ImportReviewGroupSummary => ({
  key: String(group.key ?? ''),
  importedName: String(group.importedName ?? ''),
  placeholderExerciseId: String(group.placeholderExerciseId ?? ''),
  workoutExerciseIds: Array.isArray(group.workoutExerciseIds) ? group.workoutExerciseIds.map(String) : [],
  routineExerciseIds: Array.isArray(group.routineExerciseIds) ? group.routineExerciseIds.map(String) : [],
  status: group.status === 'replaced' || group.status === 'edited' ? group.status : 'pending',
  resolvedExerciseId: group.resolvedExerciseId ? String(group.resolvedExerciseId) : null,
});

const parseImportReviewSummary = (summaryJson: string | null | undefined): ImportReviewSummary => {
  const parsed = summaryJson ? JSON.parse(summaryJson) : {};
  const raw = parsed && typeof parsed === 'object' ? parsed as Partial<ImportReviewSummary> : {};

  return {
    insertedCount: Number(raw.insertedCount ?? 0),
    skippedCount: Number(raw.skippedCount ?? 0),
    workoutIds: Array.isArray(raw.workoutIds) ? raw.workoutIds.map(String) : [],
    routineIds: Array.isArray(raw.routineIds) ? raw.routineIds.map(String) : [],
    routineExerciseIds: Array.isArray(raw.routineExerciseIds) ? raw.routineExerciseIds.map(String) : [],
    createdRoutineFolderIds: Array.isArray(raw.createdRoutineFolderIds) ? raw.createdRoutineFolderIds.map(String) : [],
    placeholderExerciseIds: Array.isArray(raw.placeholderExerciseIds) ? raw.placeholderExerciseIds.map(String) : [],
    exerciseGroups: Array.isArray(raw.exerciseGroups)
      ? raw.exerciseGroups.map((group) => normalizeImportReviewGroup(group as Partial<ImportReviewGroupSummary>))
      : [],
  };
};

const getImportJobRow = (importJobId: string) =>
  database.getFirstSync<ImportJobRow>(
    `
      SELECT id, source_type, file_name, status, summary_json
      FROM import_jobs
      WHERE id = ?
      LIMIT 1
    `,
    importJobId,
  );

const updateImportJob = (
  importJobId: string,
  status: ImportJobResult['status'],
  summary: ImportReviewSummary,
) => {
  database.runSync(
    `
      UPDATE import_jobs
      SET status = ?, summary_json = ?, updated_at = ?
      WHERE id = ?
    `,
    status,
    JSON.stringify(summary),
    nowIso(),
    importJobId,
  );
};

const toImportReview = (row: ImportJobRow, summary: ImportReviewSummary): ImportReview => {
  const groups = summary.exerciseGroups.map((group) => ({
    ...group,
    placeholderExercise: group.placeholderExerciseId ? getExerciseById(group.placeholderExerciseId) : null,
    resolvedExercise: group.resolvedExerciseId ? getExerciseById(group.resolvedExerciseId) : null,
  }));

  return {
    importJobId: row.id,
    sourceType: row.source_type as ReviewableImportSourceType,
    fileName: row.file_name,
    status: row.status,
    insertedCount: summary.insertedCount,
    skippedCount: summary.skippedCount,
    unresolvedCount: groups.filter((group) => group.status === 'pending').length,
    groups,
  };
};

const getPendingImportReview = (importJobId: string) => {
  const row = getImportJobRow(importJobId);

  if (!row || !isReviewableImportSourceType(row.source_type)) {
    throw new Error('Importação de exercícios não encontrada.');
  }

  if (row.status !== 'pending_review') {
    throw new Error('Esta importação de exercícios não está pendente de revisão.');
  }

  return {
    row,
    summary: parseImportReviewSummary(row.summary_json),
  };
};

const getImportReviewGroup = (summary: ImportReviewSummary, groupKey: string) => {
  const group = summary.exerciseGroups.find((item) => item.key === groupKey);
  if (!group) {
    throw new Error('Exercício importado não encontrado nesta revisão.');
  }

  return group;
};

const replaceImportReviewGroup = (
  summary: ImportReviewSummary,
  groupKey: string,
  updater: (group: ImportReviewGroupSummary) => ImportReviewGroupSummary,
) => ({
  ...summary,
  exerciseGroups: summary.exerciseGroups.map((group) => (group.key === groupKey ? updater(group) : group)),
});

const placeholdersFor = (values: unknown[]) => values.map(() => '?').join(', ');

const updateWorkoutExercisesForImportGroup = (group: ImportReviewGroupSummary, exerciseId: string) => {
  if (group.workoutExerciseIds.length === 0) {
    return;
  }

  database.runSync(
    `
      UPDATE workout_exercises
      SET exercise_id = ?, updated_at = ?
      WHERE id IN (${placeholdersFor(group.workoutExerciseIds)})
    `,
    exerciseId,
    nowIso(),
    ...group.workoutExerciseIds,
  );
};

const updateRoutineExercisesForImportGroup = (group: ImportReviewGroupSummary, exerciseId: string) => {
  const routineExerciseIds = group.routineExerciseIds ?? [];
  if (routineExerciseIds.length === 0) {
    return;
  }

  database.runSync(
    `
      UPDATE routine_exercises
      SET exercise_id = ?, updated_at = ?
      WHERE id IN (${placeholdersFor(routineExerciseIds)})
    `,
    exerciseId,
    nowIso(),
    ...routineExerciseIds,
  );
};

const updateImportedExerciseReferences = (group: ImportReviewGroupSummary, exerciseId: string) => {
  updateWorkoutExercisesForImportGroup(group, exerciseId);
  updateRoutineExercisesForImportGroup(group, exerciseId);
};

const deleteByIds = (sqlPrefix: string, ids: string[]) => {
  if (ids.length === 0) {
    return;
  }

  database.runSync(`${sqlPrefix} (${placeholdersFor(ids)})`, ...ids);
};

const deleteCustomExercisesByIds = (ids: string[]) => {
  if (ids.length === 0) {
    return;
  }

  database.runSync(`DELETE FROM exercises WHERE id IN (${placeholdersFor(ids)}) AND is_custom = 1`, ...ids);
};

const unarchiveImportedRoutines = (routineIds: string[] | undefined) => {
  if (!routineIds || routineIds.length === 0) {
    return;
  }

  database.runSync(
    `UPDATE routines SET is_archived = 0, updated_at = ? WHERE id IN (${placeholdersFor(routineIds)})`,
    nowIso(),
    ...routineIds,
  );
};

const importResultFromReview = (
  row: ImportJobRow,
  summary: ImportReviewSummary,
  status: ImportJobResult['status'] = row.status,
): ImportJobResult => ({
  sourceType: row.source_type as ReviewableImportSourceType,
  fileName: row.file_name,
  status,
  insertedCount: summary.insertedCount,
  skippedCount: summary.skippedCount,
  errors: [],
  reviewJobId: status === 'pending_review' ? row.id : undefined,
});

export const getImportReview = (importJobId: string) => {
  const row = getImportJobRow(importJobId);
  if (!row || !isReviewableImportSourceType(row.source_type)) {
    return null;
  }

  return toImportReview(row, parseImportReviewSummary(row.summary_json));
};

export const replaceImportExercise = (importJobId: string, groupKey: string, exerciseId: string) => {
  const { summary } = getPendingImportReview(importJobId);
  const group = getImportReviewGroup(summary, groupKey);
  if (summary.placeholderExerciseIds.includes(exerciseId)) {
    throw new Error('Escolha um exercício já existente no Frogs para substituir.');
  }

  let nextSummary = summary;

  runInTransaction(() => {
    updateImportedExerciseReferences(group, exerciseId);
    nextSummary = replaceImportReviewGroup(summary, groupKey, (current) => ({
      ...current,
      status: 'replaced',
      resolvedExerciseId: exerciseId,
    }));
    updateImportJob(importJobId, 'pending_review', nextSummary);
  });

  refreshAnalyticsCaches();
  return getImportReview(importJobId) ?? toImportReview(getImportJobRow(importJobId)!, nextSummary);
};

export const updateImportedExercise = (
  importJobId: string,
  groupKey: string,
  draft: CustomExerciseDraft,
) => {
  const { summary } = getPendingImportReview(importJobId);
  const group = getImportReviewGroup(summary, groupKey);
  let nextSummary = summary;

  runInTransaction(() => {
    saveCustomExercise(draft, group.placeholderExerciseId);
    updateImportedExerciseReferences(group, group.placeholderExerciseId);
    nextSummary = replaceImportReviewGroup(summary, groupKey, (current) => ({
      ...current,
      status: 'edited',
      resolvedExerciseId: group.placeholderExerciseId,
    }));
    updateImportJob(importJobId, 'pending_review', nextSummary);
  });

  refreshAnalyticsCaches();
  return getImportReview(importJobId) ?? toImportReview(getImportJobRow(importJobId)!, nextSummary);
};

export const saveImportReview = (
  importJobId: string,
  { allowUnresolved = false }: { allowUnresolved?: boolean } = {},
) => {
  const { row, summary } = getPendingImportReview(importJobId);
  const unresolvedCount = summary.exerciseGroups.filter((group) => group.status === 'pending').length;

  if (unresolvedCount > 0 && !allowUnresolved) {
    throw new Error('Ainda existem exercicios sem ajuste.');
  }

  runInTransaction(() => {
    const replacedPlaceholderIds = summary.exerciseGroups
      .filter((group) => group.status === 'replaced')
      .map((group) => group.placeholderExerciseId);
    deleteCustomExercisesByIds(replacedPlaceholderIds);
    unarchiveImportedRoutines(summary.routineIds);
    updateImportJob(importJobId, 'success', summary);
  });

  refreshAnalyticsCaches();
  return importResultFromReview(row, summary, 'success');
};

export const discardImport = (importJobId: string) => {
  const { row, summary } = getPendingImportReview(importJobId);

  runInTransaction(() => {
    if (summary.workoutIds.length > 0) {
      database.runSync(
        `DELETE FROM set_entries WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id IN (${placeholdersFor(summary.workoutIds)}))`,
        ...summary.workoutIds,
      );
      database.runSync(
        `DELETE FROM workout_exercises WHERE workout_id IN (${placeholdersFor(summary.workoutIds)})`,
        ...summary.workoutIds,
      );
    } else {
      const workoutExerciseIds = summary.exerciseGroups.flatMap((group) => group.workoutExerciseIds);
      deleteByIds('DELETE FROM set_entries WHERE workout_exercise_id IN', workoutExerciseIds);
      deleteByIds('DELETE FROM workout_exercises WHERE id IN', workoutExerciseIds);
    }

    const routineIds = summary.routineIds ?? [];
    if (routineIds.length > 0) {
      database.runSync(
        `DELETE FROM routine_exercises WHERE routine_id IN (${placeholdersFor(routineIds)})`,
        ...routineIds,
      );
      database.runSync(`DELETE FROM routines WHERE id IN (${placeholdersFor(routineIds)})`, ...routineIds);
    } else {
      deleteByIds('DELETE FROM routine_exercises WHERE id IN', summary.routineExerciseIds ?? []);
    }

    deleteByIds('DELETE FROM routine_folders WHERE id IN', summary.createdRoutineFolderIds ?? []);
    deleteByIds('DELETE FROM workouts WHERE id IN', summary.workoutIds);
    deleteCustomExercisesByIds(summary.placeholderExerciseIds);
    updateImportJob(importJobId, 'discarded', summary);
  });

  refreshAnalyticsCaches();
  return importResultFromReview(row, summary, 'discarded');
};

const insertHevyCsvRows = (rows: Record<string, string>[], fileName: string, checksum: string): ImportJobResult => {
  if (getBlockingImportByChecksum(checksum)) {
    const duplicateResult: ImportJobResult = {
      sourceType: 'hevy_csv',
      fileName,
      status: 'blocked_duplicate',
      insertedCount: 0,
      skippedCount: rows.length,
      errors: ['Esse CSV do Hevy ja foi importado anteriormente neste aparelho.'],
    };
    recordImportJob(duplicateResult, checksum, fileName);
    return duplicateResult;
  }

  const result: ImportJobResult = {
    sourceType: 'hevy_csv',
    fileName,
    status: 'success',
    insertedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  const importedWorkoutIds: string[] = [];
  const placeholderExerciseIds: string[] = [];
  const reviewGroupsByKey = new Map<string, ImportReviewGroupSummary>();

  runInTransaction(() => {
    const workoutIdByKey = new Map<string, string>();
    const workoutExerciseIdByKey = new Map<string, string>();
    const workoutExerciseCountByWorkoutKey = new Map<string, number>();
    const exerciseResolutionByKey = new Map<string, { exerciseId: string; isPlaceholder: boolean }>();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const workoutName = row.title?.trim();
      const startTime = row.start_time?.trim();
      const endTime = row.end_time?.trim();
      const exerciseName = row.exercise_title?.trim();

      if (!workoutName || !startTime || !endTime || !exerciseName) {
        throw new Error(`Linha ${rowNumber} do Hevy CSV esta incompleta.`);
      }

      const startedAt = parseHevyDateTime(startTime, rowNumber, 'start_time');
      const endedAt = parseHevyDateTime(endTime, rowNumber, 'end_time');
      const startedAtIso = startedAt.toISOString();
      const endedAtIso = endedAt.toISOString();
      const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
      const workoutKey = `${workoutName}__${startedAtIso}__${endedAtIso}`;
      let workoutId = workoutIdByKey.get(workoutKey);

      if (!workoutId) {
        const base = createEntityBase();
        workoutId = base.id;
        workoutIdByKey.set(workoutKey, workoutId);
        importedWorkoutIds.push(workoutId);

        database.runSync(
          `
            INSERT INTO workouts (
              id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
              routine_id, title, status, source, started_at, ended_at, duration_seconds, general_note, total_volume, total_reps, total_distance_meters
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          workoutId,
          base.createdAt,
          base.updatedAt,
          null,
          base.version,
          base.schemaVersion,
          null,
          base.syncState,
          null,
          base.originDeviceId,
          null,
          workoutName,
          'completed',
          'copied',
          startedAtIso,
          endedAtIso,
          durationSeconds,
          row.description?.trim() || '',
          0,
          0,
          0,
        );
      }

      const importedExerciseKey = importReviewGroupKey(exerciseName);
      let exerciseResolution = exerciseResolutionByKey.get(importedExerciseKey);

      if (!exerciseResolution) {
        const exerciseLookup = findExerciseByNameOrSlug(exerciseName);

        if (exerciseLookup) {
          exerciseResolution = { exerciseId: exerciseLookup.id, isPlaceholder: false };
        } else {
          const placeholderExerciseId = createId();
          ensureExerciseExists(placeholderExerciseId, exerciseName, 'full_body');
          exerciseResolution = { exerciseId: placeholderExerciseId, isPlaceholder: true };
          placeholderExerciseIds.push(placeholderExerciseId);
          reviewGroupsByKey.set(importedExerciseKey, {
            key: importedExerciseKey,
            importedName: exerciseName,
            placeholderExerciseId,
            workoutExerciseIds: [],
            status: 'pending',
            resolvedExerciseId: null,
          });
        }

        exerciseResolutionByKey.set(importedExerciseKey, exerciseResolution);
      }

      const exerciseId = exerciseResolution.exerciseId;

      const exerciseKey = `${workoutKey}__${exerciseName}`;
      let workoutExerciseId = workoutExerciseIdByKey.get(exerciseKey);

      if (!workoutExerciseId) {
        const base = createEntityBase();
        workoutExerciseId = base.id;
        workoutExerciseIdByKey.set(exerciseKey, workoutExerciseId);
        const nextSortOrder = workoutExerciseCountByWorkoutKey.get(workoutKey) ?? 0;
        workoutExerciseCountByWorkoutKey.set(workoutKey, nextSortOrder + 1);

        database.runSync(
          `
            INSERT INTO workout_exercises (
              id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
              workout_id, exercise_id, sort_order, note, rest_seconds, previous_performance, superset_group
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          workoutExerciseId,
          base.createdAt,
          base.updatedAt,
          null,
          base.version,
          base.schemaVersion,
          null,
          base.syncState,
          null,
          base.originDeviceId,
          workoutId,
          exerciseId,
          nextSortOrder,
          row.exercise_notes?.trim() || '',
          90,
          '',
          row.superset_id?.trim() || '',
        );

        if (exerciseResolution.isPlaceholder) {
          reviewGroupsByKey.get(importedExerciseKey)?.workoutExerciseIds.push(workoutExerciseId);
        }
      }

      const setIndex = Number(row.set_index);
      const setBase = createEntityBase();
      database.runSync(
        `
          INSERT INTO set_entries (
            id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
            workout_exercise_id, set_index, type, reps, weight_kg, duration_seconds, distance_meters, speed, elevation, rpe, completed_at, is_completed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        setBase.id,
        setBase.createdAt,
        setBase.updatedAt,
        null,
        setBase.version,
        setBase.schemaVersion,
        null,
        setBase.syncState,
        null,
        setBase.originDeviceId,
        workoutExerciseId,
        Number.isNaN(setIndex) ? index : setIndex,
        inferHevySetType(row),
        parseNullableImportNumber(row.reps),
        parseNullableImportNumber(row.weight_kg),
        parseNullableImportNumber(row.duration_seconds),
        toDistanceMeters(row.distance_km),
        null,
        null,
        parseNullableImportNumber(row.rpe),
        endedAtIso,
        1,
      );

      result.insertedCount += 1;
    });
  });

  recomputeWorkoutTotals(importedWorkoutIds);
  refreshAnalyticsCaches();
  const reviewSummary: ImportReviewSummary = {
    insertedCount: result.insertedCount,
    skippedCount: result.skippedCount,
    workoutIds: importedWorkoutIds,
    placeholderExerciseIds,
    exerciseGroups: [...reviewGroupsByKey.values()],
  };

  if (reviewSummary.exerciseGroups.length > 0) {
    result.status = 'pending_review';
  }

  const importJobId = recordImportJob(result, checksum, fileName, reviewSummary);
  if (result.status === 'pending_review') {
    result.reviewJobId = importJobId;
  }

  return result;
};

const workoutOnlyImportError = 'Este atalho importa apenas CSVs de treinamento do Frogs ou do Hevy.';

const createFailedCsvImportResult = (fileName: string, errors: string[]): ImportJobResult => ({
  sourceType: 'frog_workouts_csv',
  fileName,
  status: 'failed',
  insertedCount: 0,
  skippedCount: 0,
  errors,
});

const importCsvContent = (
  content: string,
  fileName: string,
  options: { workoutOnly?: boolean; reviewUnknownWorkoutExercises?: boolean } = {},
): ImportJobResult => {
  const checksum = simpleChecksum(content);
  const { headers, rows } = parseCsv(content);

  if (rows.length === 0) {
    return createFailedCsvImportResult(fileName, ['O arquivo CSV está vazio.']);
  }

  const detectedKind = detectCsvImportKind(headers);

  if (options.workoutOnly && detectedKind !== 'frog_workouts' && detectedKind !== 'hevy_workouts') {
    return createFailedCsvImportResult(fileName, [workoutOnlyImportError]);
  }

  if (detectedKind === 'frog_workouts') {
    return insertWorkoutCsvRows(rows, fileName, checksum, {
      reviewUnknownExercises: options.reviewUnknownWorkoutExercises,
    });
  }

  if (detectedKind === 'frog_measurements') {
    return insertMeasurementCsvRows(rows, fileName, checksum);
  }

  if (detectedKind === 'hevy_workouts') {
    return insertHevyCsvRows(rows, fileName, checksum);
  }

  return {
    sourceType: 'frog_workouts_csv',
    fileName,
    status: 'failed',
    insertedCount: 0,
    skippedCount: 0,
    errors: ['Formato de CSV não reconhecido. Use um CSV do Frogs ou um CSV exportado pelo Hevy.'],
  };
};

export const pickAndImportCsvData = async () => {
  const picked = await readPickedFile('*/*');
  if (!picked) {
    return null;
  }

  return importCsvContent(picked.content, picked.fileName);
};

export const pickAndImportWorkoutCsvData = async () => {
  const picked = await readPickedFile('*/*');
  if (!picked) {
    return null;
  }

  return importCsvContent(picked.content, picked.fileName, {
    workoutOnly: true,
    reviewUnknownWorkoutExercises: true,
  });
};

export const pickAndImportRoutineJson = async () => {
  const picked = await readPickedFile(['application/json', 'text/json', '*/*']);
  if (!picked) {
    return null;
  }

  return importRoutineJsonContent(picked.content, picked.fileName);
};

const restoreBackupContent = (content: string, fileName: string): ImportJobResult => {
  const parsed = backupSchema.parse(JSON.parse(content));
  const sanitizeBackupRow = (tableName: string, row: Record<string, unknown>) => {
    if (tableName === 'user_preferences') {
      const { default_workout_visibility: _removed, ...sanitized } = row;
      return sanitized;
    }

    if (tableName === 'workouts') {
      const { visibility: _removed, ...sanitized } = row;
      return sanitized;
    }

    if (tableName === 'body_measurements') {
      const { related_workout_id: _removed, ...sanitized } = row;
      return sanitized;
    }

    if (tableName === 'pr_records') {
      return {
        ...row,
        record_type: row.record_type ?? (row.metric === 'estimated_1rm' ? 'one_rm' : 'pr'),
      };
    }

    return row;
  };

  runInTransaction(() => {
    RESTORE_CLEAR_ORDER.forEach((tableName) => {
      clearTable(tableName);
    });

    BACKUP_TABLES.forEach((tableName) => {
      const rows = parsed.tables[tableName] ?? [];
      rows.forEach((row) => {
        insertRow(tableName, sanitizeBackupRow(tableName, row));
      });
    });
  });

  refreshAnalyticsCaches();

  const result: ImportJobResult = {
    sourceType: 'frog_backup_json',
    fileName,
    status: 'success',
    insertedCount: BACKUP_TABLES.reduce((count, tableName) => count + (parsed.tables[tableName]?.length ?? 0), 0),
    skippedCount: 0,
    errors: [],
  };

  writeAuditLog('backup_restore', fileName, 'restored', {
    version: parsed.version,
    exportedAt: parsed.exportedAt,
  });

  return result;
};

export const pickAndRestoreBackup = async () => {
  const picked = await readPickedFile(['application/json', 'text/json']);
  if (!picked) {
    return null;
  }

  return restoreBackupContent(picked.content, picked.fileName);
};

export const getDataManagementSummary = () => {
  initializeDatabase();

  return {
    workoutsRows: toWorkoutCsvRows().length,
    measurementRows: toMeasurementCsvRows().length,
    lastImportJob: database.getFirstSync<{
      source_type: ImportSourceType;
      file_name: string;
      status: ImportJobResult['status'];
      created_at: string;
    }>(
      `
        SELECT source_type, file_name, status, created_at
        FROM import_jobs
        ORDER BY created_at DESC
        LIMIT 1
      `,
    ),
  };
};

export const resetLocalAppData = async () => {
  await clearAllWorkoutMediaFiles();
  resetSeededDatabase();
  refreshAnalyticsCaches();
  writeAuditLog('data_reset', 'local_only', 'reset_completed', {});
};

export const importCsvTextForTests = (content: string, fileName = 'test.csv') => importCsvContent(content, fileName);

export const restoreBackupTextForTests = (content: string, fileName = 'frog-backup-v1.json') =>
  restoreBackupContent(content, fileName);

export const createBackupEnvelopeForTests = (): BackupEnvelopeV1 => ({
  version: 1,
  exportedAt: nowIso(),
  deviceId: getDeviceId(),
  tables: Object.fromEntries(BACKUP_TABLES.map((tableName) => [tableName, getTableRows(tableName)])),
});
