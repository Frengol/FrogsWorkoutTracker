import { database, createEntityBase, writeAuditLog } from '@/src/shared/db/database';
import { diffInSeconds, formatDuration, nowIso } from '@/src/shared/utils/date';
import { formatDistance, formatWeight } from '@/src/shared/utils/format';
import {
  CompletedWorkoutEditDraft,
  Equipment,
  MuscleGroup,
  RecordMetric,
  RecordType,
  RoutineComposerInput,
  SetType,
  WorkoutDetail,
  WorkoutHistoryItem,
  WorkoutLiveModel,
  WorkoutPreviousValues,
  WorkoutStatus,
} from '@/src/shared/types/domain';
import { refreshAnalyticsCaches } from '@/src/modules/progress/service';
import { saveRoutine } from '@/src/modules/routines/service';
import { formatWorkoutPreviousValues, isCardioExercise } from '@/src/modules/workouts/cardio';
import { buildLiveSetRows } from '@/src/modules/workouts/live-helpers';
import {
  applyWorkoutSessionMeta,
  getWorkoutSessionDateValue,
  replaceWorkoutSessionDate,
} from '@/src/modules/workouts/session-meta';

const defaultSetType: SetType = 'normal';

const moveCompletedAtToWorkoutDate = (completedAt: string | null | undefined, workoutStartedAt: string) => {
  if (!completedAt) {
    return null;
  }

  return replaceWorkoutSessionDate(completedAt, getWorkoutSessionDateValue(workoutStartedAt));
};

const calculateEstimated1Rm = (weightKg?: number | null, reps?: number | null) => {
  if (!weightKg || !reps) {
    return 0;
  }

  return weightKg * (1 + reps / 30);
};

const calculateSetVolume = (weightKg?: number | null, reps?: number | null) => {
  if (weightKg == null || reps == null) {
    return 0;
  }

  return weightKg * reps;
};

const formatPreviousValues = (values?: WorkoutPreviousValues | null) => formatWorkoutPreviousValues(values);

type CardioSetDefaults = {
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  speed?: number | null;
  elevation?: number | null;
};

const getExerciseClassification = (exerciseId: string) =>
  database.getFirstSync<{
    muscle_group: MuscleGroup;
    equipment: Equipment;
  }>(
    `
      SELECT muscle_group, equipment
      FROM exercises
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    exerciseId,
  );

const isCardioExerciseId = (exerciseId: string) => {
  const exercise = getExerciseClassification(exerciseId);
  return exercise ? isCardioExercise({ muscleGroup: exercise.muscle_group }) : false;
};

const createSetRecord = (
  workoutExerciseId: string,
  setIndex: number,
  type: SetType = defaultSetType,
  isCompleted = false,
  initialValues?: CardioSetDefaults,
) => {
  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO set_entries (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        workout_exercise_id, set_index, type, reps, weight_kg, duration_seconds, distance_meters, speed, elevation, rpe, completed_at, is_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    workoutExerciseId,
    setIndex,
    type,
    null,
    null,
    initialValues?.durationSeconds ?? null,
    initialValues?.distanceMeters ?? null,
    initialValues?.speed ?? null,
    initialValues?.elevation ?? null,
    null,
    isCompleted ? nowIso() : null,
    isCompleted ? 1 : 0,
  );
};

const getPreferences = () =>
  database.getFirstSync<{ default_rest_seconds: number }>(
    'SELECT default_rest_seconds FROM user_preferences ORDER BY created_at LIMIT 1',
  );

const createWorkoutExercise = ({
  workoutId,
  exerciseId,
  sortOrder,
  restSeconds,
  note = '',
  previousPerformance = '',
  supersetGroup = '',
  initialSets = 3,
  warmupEnabled = false,
  isCardio,
  cardioDefaults,
}: {
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
  restSeconds: number;
  note?: string;
  previousPerformance?: string;
  supersetGroup?: string;
  initialSets?: number;
  warmupEnabled?: boolean;
  isCardio?: boolean;
  cardioDefaults?: CardioSetDefaults;
}) => {
  const cardioExercise = isCardio ?? isCardioExerciseId(exerciseId);
  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO workout_exercises (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        workout_id, exercise_id, sort_order, note, rest_seconds, previous_performance, superset_group
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    workoutId,
    exerciseId,
    sortOrder,
    note,
    restSeconds,
    previousPerformance,
    supersetGroup,
  );

  if (cardioExercise) {
    createSetRecord(base.id, 0, defaultSetType, false, cardioDefaults);
    return base.id;
  }

  if (warmupEnabled) {
    createSetRecord(base.id, 0, 'warmup');
  }

  for (let setIndex = warmupEnabled ? 1 : 0; setIndex < initialSets + (warmupEnabled ? 1 : 0); setIndex += 1) {
    createSetRecord(base.id, setIndex, defaultSetType);
  }

  return base.id;
};

const getLatestPreviousValues = (exerciseId: string): WorkoutPreviousValues | null => {
  const lastRow = database.getFirstSync<{
    weight_kg: number | null;
    reps: number | null;
    duration_seconds: number | null;
    distance_meters: number | null;
    speed: number | null;
    elevation: number | null;
    rpe: number | null;
  }>(
    `
      SELECT se.weight_kg, se.reps, se.duration_seconds, se.distance_meters, se.speed, se.elevation, se.rpe
      FROM set_entries se
      JOIN workout_exercises we ON we.id = se.workout_exercise_id
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = ?
        AND w.status = 'completed'
        AND w.deleted_at IS NULL
        AND we.deleted_at IS NULL
        AND se.deleted_at IS NULL
        AND se.is_completed = 1
      ORDER BY w.started_at DESC, se.set_index ASC
      LIMIT 1
    `,
    exerciseId,
  );

  if (!lastRow) {
    return null;
  }

  return {
    weightKg: lastRow.weight_kg,
    reps: lastRow.reps,
    durationSeconds: lastRow.duration_seconds,
    distanceMeters: lastRow.distance_meters,
    speed: lastRow.speed,
    elevation: lastRow.elevation,
    rpe: lastRow.rpe,
  };
};

const getPreviousSetsForExercise = (exerciseId: string) => {
  const previousWorkoutExercise = database.getFirstSync<{ id: string }>(
    `
      SELECT we.id
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = ? AND w.status = 'completed' AND w.deleted_at IS NULL AND we.deleted_at IS NULL
      ORDER BY w.started_at DESC
      LIMIT 1
    `,
    exerciseId,
  );

  if (!previousWorkoutExercise?.id) {
    return [];
  }

  return database.getAllSync<{
    type: SetType;
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    distance_meters: number | null;
    speed: number | null;
    elevation: number | null;
    rpe: number | null;
  }>(
    `
      SELECT type, reps, weight_kg, duration_seconds, distance_meters, speed, elevation, rpe
      FROM set_entries
      WHERE workout_exercise_id = ? AND deleted_at IS NULL
      ORDER BY set_index ASC
    `,
    previousWorkoutExercise.id,
  );
};

const upsertDraftSnapshot = (workoutId: string) => {
  const summary = database.getFirstSync<{
    title: string;
    started_at: string;
    exercises_count: number;
    completed_sets: number;
  }>(
    `
      SELECT
        w.title,
        w.started_at,
        COUNT(DISTINCT we.id) AS exercises_count,
        COUNT(CASE WHEN se.is_completed = 1 THEN 1 END) AS completed_sets
      FROM workouts w
      LEFT JOIN workout_exercises we ON we.workout_id = w.id AND we.deleted_at IS NULL
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL
      WHERE w.id = ?
      GROUP BY w.id
    `,
    workoutId,
  );

  if (!summary) {
    return;
  }

  const existing = database.getFirstSync<{ id: string }>(
    'SELECT id FROM workout_draft_snapshots WHERE workout_id = ? LIMIT 1',
    workoutId,
  );
  const base = createEntityBase();
  const payload = JSON.stringify(summary);

  if (existing) {
    database.runSync(
      'UPDATE workout_draft_snapshots SET summary_json = ?, updated_at = ? WHERE id = ?',
      payload,
      nowIso(),
      existing.id,
    );
  } else {
    database.runSync(
      `
        INSERT INTO workout_draft_snapshots (
          id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
          workout_id, summary_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      workoutId,
      payload,
    );
  }
};

const recalculateWorkoutAggregates = (workoutId: string, status: WorkoutStatus) => {
  const aggregate = database.getFirstSync<{
    status: WorkoutStatus | null;
    total_volume: number;
    total_reps: number;
    total_distance_meters: number;
    total_cardio_duration_seconds: number;
    started_at: string;
  }>(
    `
      SELECT
        w.status AS status,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(SUM(CASE WHEN se.reps IS NOT NULL THEN se.reps ELSE 0 END), 0) AS total_reps,
        COALESCE(SUM(CASE WHEN se.distance_meters IS NOT NULL THEN se.distance_meters ELSE 0 END), 0) AS total_distance_meters,
        COALESCE((
          SELECT SUM(se_cardio.duration_seconds)
          FROM workout_exercises we_cardio
          JOIN exercises e_cardio ON e_cardio.id = we_cardio.exercise_id
          JOIN set_entries se_cardio ON se_cardio.workout_exercise_id = we_cardio.id AND se_cardio.deleted_at IS NULL
          WHERE we_cardio.workout_id = w.id
            AND we_cardio.deleted_at IS NULL
            AND e_cardio.muscle_group = 'cardio'
            AND se_cardio.duration_seconds IS NOT NULL
        ), 0) AS total_cardio_duration_seconds,
        MIN(w.started_at) AS started_at
      FROM workouts w
      LEFT JOIN workout_exercises we ON we.workout_id = w.id AND we.deleted_at IS NULL
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1
      WHERE w.id = ?
      GROUP BY w.id
    `,
    workoutId,
  );

  if (!aggregate?.started_at) {
    return null;
  }

  const durationSeconds = Math.max(diffInSeconds(aggregate.started_at), aggregate.total_cardio_duration_seconds ?? 0);

  database.runSync(
    `
      UPDATE workouts
      SET status = ?, ended_at = ?, duration_seconds = ?, total_volume = ?, total_reps = ?, total_distance_meters = ?, updated_at = ?
      WHERE id = ?
    `,
    status,
    status === 'completed' ? nowIso() : null,
    durationSeconds,
    aggregate.total_volume,
    aggregate.total_reps,
    aggregate.total_distance_meters,
    nowIso(),
    workoutId,
  );

  return aggregate.status;
};

const updateSnapshots = (workoutId: string) => {
  const exerciseRows = database.getAllSync<{
    exercise_id: string;
    workouts_count: number;
    sets_count: number;
    total_volume: number;
    total_reps: number;
    best_weight: number;
    best_estimated_1rm: number;
  }>(
    `
      SELECT
        we.exercise_id,
        COUNT(DISTINCT w.id) AS workouts_count,
        COUNT(se.id) AS sets_count,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(SUM(se.reps), 0) AS total_reps,
        COALESCE(MAX(se.weight_kg), 0) AS best_weight,
        COALESCE(MAX(CASE
          WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * (1 + se.reps / 30.0)
          ELSE 0
        END), 0) AS best_estimated_1rm
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1
      WHERE w.status = 'completed' AND w.deleted_at IS NULL AND we.deleted_at IS NULL AND we.exercise_id IN (
        SELECT exercise_id FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL
      )
      GROUP BY we.exercise_id
    `,
    workoutId,
  );

  exerciseRows.forEach((row) => {
    const existing = database.getFirstSync<{ id: string }>(
      'SELECT id FROM exercise_history_snapshots WHERE exercise_id = ? AND period_key = ? LIMIT 1',
      row.exercise_id,
      'all_time',
    );

    if (existing) {
      database.runSync(
        `
          UPDATE exercise_history_snapshots
          SET workouts_count = ?, sets_count = ?, total_volume = ?, total_reps = ?, best_weight = ?, best_estimated_1rm = ?, updated_at = ?
          WHERE id = ?
        `,
        row.workouts_count,
        row.sets_count,
        row.total_volume,
        row.total_reps,
        row.best_weight,
        row.best_estimated_1rm,
        nowIso(),
        existing.id,
      );
      return;
    }

    const base = createEntityBase();
    database.runSync(
      `
        INSERT INTO exercise_history_snapshots (
          id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
          exercise_id, period_key, workouts_count, sets_count, total_volume, total_reps, best_weight, best_estimated_1rm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      row.exercise_id,
      'all_time',
      row.workouts_count,
      row.sets_count,
      row.total_volume,
      row.total_reps,
      row.best_weight,
      row.best_estimated_1rm,
    );
  });
};

const joinRecordLabels = (labels: string[]) => {
  if (labels.length <= 1) {
    return labels[0] ?? '';
  }

  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
};

const formatRecordAnnouncementDetail = ({ metric, value }: { metric: RecordMetric; value: number }) => {
  switch (metric) {
    case 'heaviest_weight':
      return `carga(${formatWeight(value)})`;
    case 'estimated_1rm':
      return `1RM(${formatWeight(value)})`;
    case 'best_reps':
      return `repetições(${Math.round(value)})`;
    case 'best_duration':
      return `duração(${formatDuration(Math.round(value))})`;
    case 'best_distance':
      return `distância(${formatDistance(value)})`;
    case 'best_volume':
      return `volume(${formatWeight(value)})`;
    default:
      return `${metric}(${Math.round(value * 10) / 10})`;
  }
};

const buildRecordAnnouncement = (
  exerciseName: string | null | undefined,
  records: { metric: RecordMetric; value: number }[],
) => {
  if (records.length === 0) {
    return null;
  }

  const labels = records.map(formatRecordAnnouncementDetail);
  const prefix = exerciseName ? `${exerciseName}: ` : 'Novos recordes: ';

  return `${prefix}${joinRecordLabels(labels)}`;
};

const upsertRecord = ({
  exerciseId,
  workoutId,
  setEntryId,
  recordType,
  metric,
  value,
}: {
  exerciseId: string;
  workoutId: string;
  setEntryId: string;
  recordType: RecordType;
  metric: RecordMetric;
  value: number;
}) => {
  if (value <= 0) {
    return null;
  }

  const best = database.getFirstSync<{ value: number }>(
    'SELECT value FROM pr_records WHERE exercise_id = ? AND record_type = ? AND metric = ? AND deleted_at IS NULL ORDER BY value DESC LIMIT 1',
    exerciseId,
    recordType,
    metric,
  );

  if (best && best.value >= value) {
    return null;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO pr_records (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        exercise_id, workout_id, set_entry_id, record_type, metric, value, achieved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    exerciseId,
    workoutId,
    setEntryId,
    recordType,
    metric,
    value,
    nowIso(),
  );

  return { recordType, metric, value };
};

export const getActiveWorkout = () =>
  database.getFirstSync<{
    id: string;
    title: string;
    started_at: string;
    status: string;
  }>(
    `
      SELECT id, title, started_at, status
      FROM workouts
      WHERE status IN ('draft', 'in_progress') AND deleted_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `,
  );

export const startEmptyWorkout = () => {
  const existing = getActiveWorkout();
  if (existing?.id) {
    return existing.id;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO workouts (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        routine_id, title, status, source, started_at, ended_at, duration_seconds, general_note, total_volume, total_reps, total_distance_meters
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    null,
    'Treino rápido',
    'in_progress',
    'empty',
    base.createdAt,
    null,
    0,
    '',
    0,
    0,
    0,
  );

  upsertDraftSnapshot(base.id);
  writeAuditLog('workout', base.id, 'started_empty', {});
  return base.id;
};

export const startRoutineWorkout = (routineId: string) => {
  const routine = database.getFirstSync<{ id: string; name: string }>('SELECT id, name FROM routines WHERE id = ?', routineId);
  if (!routine) {
    return null;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO workouts (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        routine_id, title, status, source, started_at, ended_at, duration_seconds, general_note, total_volume, total_reps, total_distance_meters
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    routine.id,
    routine.name,
    'in_progress',
    'routine',
    base.createdAt,
    null,
    0,
    '',
    0,
    0,
    0,
  );

  const routineExercises = database.getAllSync<{
    exercise_id: string;
    muscle_group: MuscleGroup;
    equipment: Equipment;
    sort_order: number;
    target_sets: number;
    rest_seconds: number;
    cardio_duration_seconds: number | null;
    cardio_distance_meters: number | null;
    cardio_speed: number | null;
    cardio_elevation: number | null;
    note: string | null;
    superset_group: string | null;
    warmup_enabled: number;
  }>(
    `
      SELECT
        exercise_id,
        e.muscle_group,
        e.equipment,
        sort_order,
        target_sets,
        rest_seconds,
        cardio_duration_seconds,
        cardio_distance_meters,
        cardio_speed,
        cardio_elevation,
        note,
        superset_group,
        warmup_enabled
      FROM routine_exercises
      JOIN exercises e ON e.id = routine_exercises.exercise_id
      WHERE routine_id = ?
      ORDER BY sort_order ASC
    `,
    routineId,
  );

  routineExercises.forEach((exercise) => {
    const cardioExercise = isCardioExercise({ muscleGroup: exercise.muscle_group });
    createWorkoutExercise({
      workoutId: base.id,
      exerciseId: exercise.exercise_id,
      sortOrder: exercise.sort_order,
      restSeconds: cardioExercise ? 0 : exercise.rest_seconds,
      note: exercise.note ?? '',
      previousPerformance: formatPreviousValues(getLatestPreviousValues(exercise.exercise_id)) ?? '',
      supersetGroup: exercise.superset_group ?? '',
      initialSets: cardioExercise ? 1 : exercise.target_sets,
      warmupEnabled: cardioExercise ? false : exercise.warmup_enabled === 1,
      isCardio: cardioExercise,
      cardioDefaults: cardioExercise
        ? {
            durationSeconds: exercise.cardio_duration_seconds,
            distanceMeters: exercise.cardio_distance_meters,
            speed: exercise.cardio_speed,
            elevation: exercise.cardio_elevation,
          }
        : undefined,
    });
  });

  upsertDraftSnapshot(base.id);
  writeAuditLog('workout', base.id, 'started_from_routine', { routineId });
  return base.id;
};

export const addExerciseToWorkout = (workoutId: string, exerciseId: string) => {
  const sortOrder =
    database.getFirstSync<{ max_sort_order: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) as max_sort_order FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL',
      workoutId,
    )?.max_sort_order ?? -1;

  const preferences = getPreferences();
  const cardioExercise = isCardioExerciseId(exerciseId);
  const createdId = createWorkoutExercise({
    workoutId,
    exerciseId,
    sortOrder: sortOrder + 1,
    restSeconds: cardioExercise ? 0 : (preferences?.default_rest_seconds ?? 90),
    previousPerformance: formatPreviousValues(getLatestPreviousValues(exerciseId)) ?? '',
    initialSets: cardioExercise ? 1 : 3,
    isCardio: cardioExercise,
  });

  upsertDraftSnapshot(workoutId);
  return createdId;
};

export const addSetToWorkoutExercise = (workoutExerciseId: string) => {
  const nextIndex =
    database.getFirstSync<{ next_index: number }>(
      'SELECT COALESCE(MAX(set_index), -1) + 1 as next_index FROM set_entries WHERE workout_exercise_id = ? AND deleted_at IS NULL',
      workoutExerciseId,
    )?.next_index ?? 0;
  createSetRecord(workoutExerciseId, nextIndex);
};

export const removeWorkoutExercise = (workoutExerciseId: string) => {
  const workoutExercise = database.getFirstSync<{
    workout_id: string;
    exercise_id: string;
  }>(
    'SELECT workout_id, exercise_id FROM workout_exercises WHERE id = ? LIMIT 1',
    workoutExerciseId,
  );

  if (!workoutExercise) {
    return false;
  }

  database.execSync('BEGIN');

  try {
    database.runSync(
      'DELETE FROM pr_records WHERE set_entry_id IN (SELECT id FROM set_entries WHERE workout_exercise_id = ?)',
      workoutExerciseId,
    );
    database.runSync('DELETE FROM set_entries WHERE workout_exercise_id = ?', workoutExerciseId);
    database.runSync('DELETE FROM workout_exercises WHERE id = ?', workoutExerciseId);

    const remainingExercises = database.getAllSync<{ id: string }>(
      `
        SELECT id
        FROM workout_exercises
        WHERE workout_id = ? AND deleted_at IS NULL
        ORDER BY sort_order ASC, created_at ASC
      `,
      workoutExercise.workout_id,
    );

    remainingExercises.forEach((entry, index) => {
      database.runSync(
        'UPDATE workout_exercises SET sort_order = ?, updated_at = ? WHERE id = ?',
        index,
        nowIso(),
        entry.id,
      );
    });

    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  upsertDraftSnapshot(workoutExercise.workout_id);
  writeAuditLog('workout_exercise', workoutExerciseId, 'removed', {
    workoutId: workoutExercise.workout_id,
    exerciseId: workoutExercise.exercise_id,
  });
  return true;
};

export const reorderWorkoutExercises = (workoutId: string, orderedWorkoutExerciseIds: string[]) => {
  database.execSync('BEGIN');

  try {
    orderedWorkoutExerciseIds.forEach((workoutExerciseId, index) => {
      database.runSync(
        'UPDATE workout_exercises SET sort_order = ?, updated_at = ? WHERE id = ? AND workout_id = ?',
        index,
        nowIso(),
        workoutExerciseId,
        workoutId,
      );
    });

    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  upsertDraftSnapshot(workoutId);
  writeAuditLog('workout', workoutId, 'reordered_exercises', {
    orderedWorkoutExerciseIds,
  });
};

export const replaceWorkoutExerciseExercise = (workoutExerciseId: string, nextExerciseId: string) => {
  const workoutExercise = database.getFirstSync<{
    workout_id: string;
    exercise_id: string;
  }>('SELECT workout_id, exercise_id FROM workout_exercises WHERE id = ?', workoutExerciseId);

  if (!workoutExercise || workoutExercise.exercise_id === nextExerciseId) {
    return false;
  }

  const nextPreviousValues = getLatestPreviousValues(nextExerciseId);
  const nextIsCardio = isCardioExerciseId(nextExerciseId);
  const currentSetCount =
    database.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM set_entries WHERE workout_exercise_id = ? AND deleted_at IS NULL',
      workoutExerciseId,
    )?.count ?? 0;

  database.execSync('BEGIN');

  try {
    database.runSync(
      `
        UPDATE workout_exercises
        SET exercise_id = ?, note = ?, previous_performance = ?, updated_at = ?
        WHERE id = ?
      `,
      nextExerciseId,
      '',
      formatPreviousValues(nextPreviousValues) ?? '',
      nowIso(),
      workoutExerciseId,
    );

    database.runSync(
      `
        UPDATE set_entries
        SET reps = NULL, weight_kg = NULL, duration_seconds = NULL, distance_meters = NULL, speed = NULL, elevation = NULL, rpe = NULL, completed_at = NULL, is_completed = 0, updated_at = ?
        WHERE workout_exercise_id = ?
      `,
      nowIso(),
      workoutExerciseId,
    );

    if (nextIsCardio) {
      database.runSync('DELETE FROM set_entries WHERE workout_exercise_id = ?', workoutExerciseId);
      createSetRecord(workoutExerciseId, 0);
    } else if (currentSetCount <= 1) {
      database.runSync('DELETE FROM set_entries WHERE workout_exercise_id = ?', workoutExerciseId);
      for (let setIndex = 0; setIndex < 3; setIndex += 1) {
        createSetRecord(workoutExerciseId, setIndex);
      }
    }

    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  upsertDraftSnapshot(workoutExercise.workout_id);
  writeAuditLog('workout_exercise', workoutExerciseId, 'exercise_replaced', {
    previousExerciseId: workoutExercise.exercise_id,
    nextExerciseId,
  });
  return true;
};

export const removeSetFromWorkoutExercise = (setId: string) => {
  const setContext = database.getFirstSync<{
    workout_id: string;
    workout_exercise_id: string;
  }>(
    `
      SELECT we.workout_id, we.id AS workout_exercise_id
      FROM set_entries se
      JOIN workout_exercises we ON we.id = se.workout_exercise_id
      WHERE se.id = ?
      LIMIT 1
    `,
    setId,
  );

  if (!setContext) {
    return false;
  }

  database.execSync('BEGIN');

  try {
    database.runSync('DELETE FROM pr_records WHERE set_entry_id = ?', setId);
    database.runSync('DELETE FROM set_entries WHERE id = ?', setId);
    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  upsertDraftSnapshot(setContext.workout_id);
  writeAuditLog('set_entry', setId, 'removed', {
    workoutId: setContext.workout_id,
    workoutExerciseId: setContext.workout_exercise_id,
  });
  return true;
};

export const updateSetEntry = ({
  setId,
  field,
  value,
}: {
  setId: string;
  field: 'reps' | 'weight_kg' | 'duration_seconds' | 'distance_meters' | 'speed' | 'elevation' | 'rpe' | 'type';
  value: number | string | null;
}) => {
  database.runSync(`UPDATE set_entries SET ${field} = ?, updated_at = ? WHERE id = ?`, value, nowIso(), setId);
};

export const applyPreviousValuesToSet = (setId: string) => {
  const workoutExercise = database.getFirstSync<{
    exercise_id: string;
    workout_id: string;
    workout_exercise_id: string;
  }>(
    `
      SELECT we.exercise_id, we.workout_id, we.id AS workout_exercise_id
      FROM set_entries se
      JOIN workout_exercises we ON we.id = se.workout_exercise_id
      WHERE se.id = ?
      LIMIT 1
    `,
    setId,
  );

  if (!workoutExercise) {
    return false;
  }

  const currentSets = database.getAllSync<{
    id: string;
    type: SetType;
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    distance_meters: number | null;
    speed: number | null;
    elevation: number | null;
    rpe: number | null;
  }>(
    `
      SELECT id, type, reps, weight_kg, duration_seconds, distance_meters, speed, elevation, rpe
      FROM set_entries
      WHERE workout_exercise_id = ? AND deleted_at IS NULL
      ORDER BY set_index ASC
    `,
    workoutExercise.workout_exercise_id,
  );

  const previousValues = buildLiveSetRows(
    currentSets.map((set) => ({
      id: set.id,
      type: set.type,
      reps: set.reps,
      weightKg: set.weight_kg,
      durationSeconds: set.duration_seconds,
      distanceMeters: set.distance_meters,
      speed: set.speed,
      elevation: set.elevation,
      rpe: set.rpe,
    })),
    getPreviousSetsForExercise(workoutExercise.exercise_id).map((set) => ({
      type: set.type,
      reps: set.reps,
      weightKg: set.weight_kg,
      durationSeconds: set.duration_seconds,
      distanceMeters: set.distance_meters,
      speed: set.speed,
      elevation: set.elevation,
      rpe: set.rpe,
    })),
  ).find((set) => set.id === setId)?.previousMatch;

  if (!previousValues) {
    return false;
  }

  database.runSync(
    `
      UPDATE set_entries
      SET reps = ?, weight_kg = ?, duration_seconds = ?, distance_meters = ?, speed = ?, elevation = ?, rpe = ?, updated_at = ?
      WHERE id = ?
    `,
    previousValues.reps ?? null,
    previousValues.weightKg ?? null,
    previousValues.durationSeconds ?? null,
    previousValues.distanceMeters ?? null,
    previousValues.speed ?? null,
    previousValues.elevation ?? null,
    previousValues.rpe ?? null,
    nowIso(),
    setId,
  );
  upsertDraftSnapshot(workoutExercise.workout_id);
  return true;
};

export const completeSetEntry = (setId: string) => {
  const setEntry = database.getFirstSync<{
    id: string;
    workout_exercise_id: string;
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    distance_meters: number | null;
  }>('SELECT * FROM set_entries WHERE id = ?', setId);

  if (!setEntry) {
    return { restSeconds: 90, prMessage: null };
  }

  database.runSync(
    'UPDATE set_entries SET is_completed = 1, completed_at = ?, updated_at = ? WHERE id = ?',
    nowIso(),
    nowIso(),
    setId,
  );

  const workoutExercise = database.getFirstSync<{
    id: string;
    exercise_id: string;
    workout_id: string;
    rest_seconds: number;
  }>('SELECT * FROM workout_exercises WHERE id = ?', setEntry.workout_exercise_id);

  if (!workoutExercise) {
    return { restSeconds: 90, prMessage: null };
  }

  const records = [
    upsertRecord({
      exerciseId: workoutExercise.exercise_id,
      workoutId: workoutExercise.workout_id,
      setEntryId: setEntry.id,
      recordType: 'pr',
      metric: 'heaviest_weight',
      value: setEntry.weight_kg ?? 0,
    }),
    upsertRecord({
      exerciseId: workoutExercise.exercise_id,
      workoutId: workoutExercise.workout_id,
      setEntryId: setEntry.id,
      recordType: 'one_rm',
      metric: 'estimated_1rm',
      value: calculateEstimated1Rm(setEntry.weight_kg, setEntry.reps),
    }),
    upsertRecord({
      exerciseId: workoutExercise.exercise_id,
      workoutId: workoutExercise.workout_id,
      setEntryId: setEntry.id,
      recordType: 'pr',
      metric: 'best_reps',
      value: setEntry.reps ?? 0,
    }),
    upsertRecord({
      exerciseId: workoutExercise.exercise_id,
      workoutId: workoutExercise.workout_id,
      setEntryId: setEntry.id,
      recordType: 'pr',
      metric: 'best_duration',
      value: setEntry.duration_seconds ?? 0,
    }),
    upsertRecord({
      exerciseId: workoutExercise.exercise_id,
      workoutId: workoutExercise.workout_id,
      setEntryId: setEntry.id,
      recordType: 'pr',
      metric: 'best_distance',
      value: setEntry.distance_meters ?? 0,
    }),
    upsertRecord({
      exerciseId: workoutExercise.exercise_id,
      workoutId: workoutExercise.workout_id,
      setEntryId: setEntry.id,
      recordType: 'pr',
      metric: 'best_volume',
      value: (setEntry.weight_kg ?? 0) * (setEntry.reps ?? 0),
    }),
  ].filter((record): record is { recordType: RecordType; metric: RecordMetric; value: number } => Boolean(record));
  const exercise = records.length > 0 ? database.getFirstSync<{ name: string }>('SELECT name FROM exercises WHERE id = ?', workoutExercise.exercise_id) : null;

  upsertDraftSnapshot(workoutExercise.workout_id);
  return {
    restSeconds: workoutExercise.rest_seconds,
    prMessage: buildRecordAnnouncement(exercise?.name, records),
  };
};

export const undoCompleteSetEntry = (setId: string) => {
  const setContext = database.getFirstSync<{
    workout_id: string;
    is_completed: number;
  }>(
    `
      SELECT we.workout_id, se.is_completed
      FROM set_entries se
      JOIN workout_exercises we ON we.id = se.workout_exercise_id
      WHERE se.id = ?
      LIMIT 1
    `,
    setId,
  );

  if (!setContext || setContext.is_completed !== 1) {
    return false;
  }

  database.execSync('BEGIN');

  try {
    database.runSync(
      'UPDATE set_entries SET is_completed = 0, completed_at = NULL, updated_at = ? WHERE id = ?',
      nowIso(),
      setId,
    );
    database.runSync('DELETE FROM pr_records WHERE set_entry_id = ?', setId);
    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  upsertDraftSnapshot(setContext.workout_id);
  writeAuditLog('set_entry', setId, 'completion_undone', {
    workoutId: setContext.workout_id,
  });
  return true;
};

export const updateWorkoutExerciseNote = (workoutExerciseId: string, note: string) => {
  database.runSync('UPDATE workout_exercises SET note = ?, updated_at = ? WHERE id = ?', note, nowIso(), workoutExerciseId);
};

export const updateWorkoutNote = (workoutId: string, note: string) => {
  database.runSync('UPDATE workouts SET general_note = ?, updated_at = ? WHERE id = ?', note, nowIso(), workoutId);
  upsertDraftSnapshot(workoutId);
};

export const listWorkoutPrs = (workoutId: string) =>
  database.getAllSync<{
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
    exercise_id: string;
    workout_id: string;
    set_entry_id: string;
    record_type: RecordType;
    metric: RecordMetric;
    value: number;
    achieved_at: string;
    exercise_name: string;
  }>(
    `
      SELECT pr.*, e.name AS exercise_name
      FROM pr_records pr
      JOIN exercises e ON e.id = pr.exercise_id
      WHERE pr.workout_id = ? AND pr.deleted_at IS NULL
      ORDER BY pr.achieved_at DESC, e.name ASC
    `,
    workoutId,
  ).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    version: row.version,
    schemaVersion: row.schema_version,
    remoteId: row.remote_id,
    syncState: row.sync_state as WorkoutDetail['prRecords'][number]['syncState'],
    lastExportedAt: row.last_exported_at,
    originDeviceId: row.origin_device_id,
    exerciseId: row.exercise_id,
    workoutId: row.workout_id,
    setEntryId: row.set_entry_id,
    recordType: row.record_type ?? (row.metric === 'estimated_1rm' ? 'one_rm' : 'pr'),
    metric: row.metric,
    value: row.value,
    achievedAt: row.achieved_at,
    exerciseName: row.exercise_name,
  }));

export const getWorkoutLiveModel = (workoutId: string): WorkoutLiveModel | null => {
  const workout = database.getFirstSync<any>('SELECT * FROM workouts WHERE id = ? AND deleted_at IS NULL', workoutId);
  if (!workout) {
    return null;
  }

  const exercises = database.getAllSync<any>(
    `
      SELECT
        we.*,
        e.name AS exercise_name,
        e.muscle_group,
        e.equipment,
        e.modality,
        e.secondary_muscles_json,
        e.is_custom,
        e.is_archived,
        e.instructions
      FROM workout_exercises we
      JOIN exercises e ON e.id = we.exercise_id
      WHERE we.workout_id = ? AND we.deleted_at IS NULL
      ORDER BY we.sort_order ASC
    `,
    workoutId,
  );

  return {
    workout: {
      id: workout.id,
      createdAt: workout.created_at,
      updatedAt: workout.updated_at,
      deletedAt: workout.deleted_at,
      version: workout.version,
      schemaVersion: workout.schema_version,
      remoteId: workout.remote_id,
      syncState: workout.sync_state,
      lastExportedAt: workout.last_exported_at,
      originDeviceId: workout.origin_device_id,
      routineId: workout.routine_id,
      title: workout.title,
      status: workout.status,
      source: workout.source,
      startedAt: workout.started_at,
      endedAt: workout.ended_at,
      durationSeconds: workout.duration_seconds,
      generalNote: workout.general_note,
      totalVolume: workout.total_volume,
      totalReps: workout.total_reps,
      totalDistanceMeters: workout.total_distance_meters,
    },
    exercises: exercises.map((row) => {
      const previousValues = getLatestPreviousValues(row.exercise_id);
      const previousSets = getPreviousSetsForExercise(row.exercise_id);
      const setRows = database.getAllSync<any>(
        'SELECT * FROM set_entries WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY set_index ASC',
        row.id,
      );
      const liveSetRows = buildLiveSetRows(
        setRows.map((set) => ({
          id: set.id,
          type: set.type,
          reps: set.reps,
          weightKg: set.weight_kg,
          durationSeconds: set.duration_seconds,
          distanceMeters: set.distance_meters,
          speed: set.speed,
          elevation: set.elevation,
          rpe: set.rpe,
        })),
        previousSets.map((set) => ({
          type: set.type,
          reps: set.reps,
          weightKg: set.weight_kg,
          durationSeconds: set.duration_seconds,
          distanceMeters: set.distance_meters,
          speed: set.speed,
          elevation: set.elevation,
          rpe: set.rpe,
        })),
      );

      return {
      workoutExercise: {
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
        workoutId: row.workout_id,
        exerciseId: row.exercise_id,
        sortOrder: row.sort_order,
        note: row.note,
        restSeconds: row.rest_seconds,
        previousPerformance: row.previous_performance,
        supersetGroup: row.superset_group,
      },
      exercise: {
        id: row.exercise_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        version: row.version,
        schemaVersion: row.schema_version,
        remoteId: row.remote_id,
        syncState: row.sync_state,
        lastExportedAt: row.last_exported_at,
        originDeviceId: row.origin_device_id,
        slug: row.exercise_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: row.exercise_name,
        muscleGroup: row.muscle_group,
        secondaryMuscles: JSON.parse(row.secondary_muscles_json ?? '[]'),
        equipment: row.equipment,
        modality: row.modality,
        isCustom: row.is_custom === 1,
        isArchived: row.is_archived === 1,
        instructions: row.instructions,
      },
      sets: liveSetRows.map((liveSetRow, index) => {
        const set = setRows[index];
        return ({
        id: set.id,
        createdAt: set.created_at,
        updatedAt: set.updated_at,
        deletedAt: set.deleted_at,
        version: set.version,
        schemaVersion: set.schema_version,
        remoteId: set.remote_id,
        syncState: set.sync_state,
        lastExportedAt: set.last_exported_at,
        originDeviceId: set.origin_device_id,
        workoutExerciseId: set.workout_exercise_id,
        setIndex: set.set_index,
        type: set.type,
        reps: set.reps,
        weightKg: set.weight_kg,
        durationSeconds: set.duration_seconds,
        distanceMeters: set.distance_meters,
        speed: set.speed,
        elevation: set.elevation,
        rpe: set.rpe,
        completedAt: set.completed_at,
        isCompleted: set.is_completed === 1,
        supportedType: liveSetRow.supportedType,
        seriesLabel: liveSetRow.seriesLabel,
        typeOccurrence: liveSetRow.typeOccurrence,
        previousMatch: liveSetRow.previousMatch,
        previousMatchLabel: liveSetRow.previousMatchLabel,
      });
      }),
      previousPerformance: row.previous_performance,
      previousValues,
    };
    }),
  };
};

const buildTargetRepsLabel = (sets: WorkoutLiveModel['exercises'][number]['sets']) => {
  const repValues = sets
    .filter((set) => set.type !== 'warmup' && typeof set.reps === 'number' && Number.isFinite(set.reps))
    .map((set) => Number(set.reps));

  if (repValues.length === 0) {
    return '8-10';
  }

  const minReps = Math.min(...repValues);
  const maxReps = Math.max(...repValues);

  if (minReps === maxReps) {
    return String(minReps);
  }

  return `${minReps}-${maxReps}`;
};

const buildRoutineComposerInputFromQuickWorkout = (model: WorkoutLiveModel, routineName: string): RoutineComposerInput => ({
  name: routineName,
  description: '',
  folderName: '',
  exercises: model.exercises.map((exercise) => {
    const firstSet = exercise.sets[0];
    const cardioExercise = isCardioExercise(exercise.exercise);

    return {
      exerciseId: exercise.exercise.id,
      targetSets: cardioExercise ? 1 : exercise.sets.filter((set) => set.type !== 'warmup').length,
      targetRepsLabel: cardioExercise ? '' : buildTargetRepsLabel(exercise.sets),
      restSeconds: cardioExercise ? 0 : exercise.workoutExercise.restSeconds,
      cardioDurationSeconds: cardioExercise ? firstSet?.durationSeconds ?? null : null,
      cardioDistanceMeters: cardioExercise ? firstSet?.distanceMeters ?? null : null,
      cardioSpeed: cardioExercise ? firstSet?.speed ?? null : null,
      cardioElevation: cardioExercise ? firstSet?.elevation ?? null : null,
      note: exercise.workoutExercise.note ?? '',
      privateLink: '',
      supersetGroup: exercise.workoutExercise.supersetGroup ?? '',
      warmupEnabled: cardioExercise ? false : exercise.sets.some((set) => set.type === 'warmup'),
    };
  }),
});

export const saveQuickWorkoutAsRoutine = (workoutId: string, routineName: string) => {
  const trimmedName = routineName.trim();
  if (!trimmedName) {
    throw new Error('Informe um nome para salvar o treino.');
  }

  const model = getWorkoutLiveModel(workoutId);
  if (!model) {
    throw new Error('Treino não encontrado.');
  }

  if (model.workout.source !== 'empty') {
    throw new Error('Só treinos rápidos podem ser salvos na Biblioteca.');
  }

  const routineId = saveRoutine(buildRoutineComposerInputFromQuickWorkout(model, trimmedName));

  writeAuditLog('workout', workoutId, 'saved_as_routine', {
    routineId,
    name: trimmedName,
  });

  return routineId;
};

const insertPrRecord = ({
  exerciseId,
  workoutId,
  setEntryId,
  recordType,
  metric,
  value,
  achievedAt,
}: {
  exerciseId: string;
  workoutId: string;
  setEntryId: string;
  recordType: RecordType;
  metric: RecordMetric;
  value: number;
  achievedAt: string;
}) => {
  if (value <= 0) {
    return;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO pr_records (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        exercise_id, workout_id, set_entry_id, record_type, metric, value, achieved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    exerciseId,
    workoutId,
    setEntryId,
    recordType,
    metric,
    value,
    achievedAt,
  );
};

const rebuildPrRecords = () => {
  const completedSetRows = database.getAllSync<{
    set_entry_id: string;
    exercise_id: string;
    workout_id: string;
    weight_kg: number | null;
    reps: number | null;
    duration_seconds: number | null;
    distance_meters: number | null;
    achieved_at: string;
  }>(
    `
      SELECT
        se.id AS set_entry_id,
        we.exercise_id,
        we.workout_id,
        se.weight_kg,
        se.reps,
        se.duration_seconds,
        se.distance_meters,
        COALESCE(se.completed_at, w.ended_at, w.started_at) AS achieved_at
      FROM set_entries se
      JOIN workout_exercises we ON we.id = se.workout_exercise_id
      JOIN workouts w ON w.id = we.workout_id
      WHERE w.status = 'completed'
        AND w.deleted_at IS NULL
        AND we.deleted_at IS NULL
        AND se.deleted_at IS NULL
        AND se.is_completed = 1
      ORDER BY achieved_at ASC, w.started_at ASC, we.sort_order ASC, se.set_index ASC
    `,
  );

  const bestByMetric = new Map<string, number>();

  completedSetRows.forEach((row) => {
    const metrics: { recordType: RecordType; metric: RecordMetric; value: number }[] = [
      { recordType: 'pr', metric: 'heaviest_weight', value: row.weight_kg ?? 0 },
      { recordType: 'one_rm', metric: 'estimated_1rm', value: calculateEstimated1Rm(row.weight_kg, row.reps) },
      { recordType: 'pr', metric: 'best_reps', value: row.reps ?? 0 },
      { recordType: 'pr', metric: 'best_duration', value: row.duration_seconds ?? 0 },
      { recordType: 'pr', metric: 'best_distance', value: row.distance_meters ?? 0 },
      { recordType: 'pr', metric: 'best_volume', value: calculateSetVolume(row.weight_kg, row.reps) },
    ];

    metrics.forEach((candidate) => {
      if (candidate.value <= 0) {
        return;
      }

      const key = `${row.exercise_id}:${candidate.recordType}:${candidate.metric}`;
      const currentBest = bestByMetric.get(key) ?? 0;
      if (candidate.value <= currentBest) {
        return;
      }

      insertPrRecord({
        exerciseId: row.exercise_id,
        workoutId: row.workout_id,
        setEntryId: row.set_entry_id,
        recordType: candidate.recordType,
        metric: candidate.metric,
        value: candidate.value,
        achievedAt: row.achieved_at,
      });
      bestByMetric.set(key, candidate.value);
    });
  });
};

const rebuildExerciseHistorySnapshots = () => {
  const rows = database.getAllSync<{
    exercise_id: string;
    workouts_count: number;
    sets_count: number;
    total_volume: number;
    total_reps: number;
    best_weight: number;
    best_estimated_1rm: number;
  }>(
    `
      SELECT
        we.exercise_id,
        COUNT(DISTINCT w.id) AS workouts_count,
        COUNT(se.id) AS sets_count,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(SUM(se.reps), 0) AS total_reps,
        COALESCE(MAX(se.weight_kg), 0) AS best_weight,
        COALESCE(MAX(CASE
          WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * (1 + se.reps / 30.0)
          ELSE 0
        END), 0) AS best_estimated_1rm
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1
      WHERE w.status = 'completed' AND w.deleted_at IS NULL AND we.deleted_at IS NULL
      GROUP BY we.exercise_id
    `,
  );

  rows.forEach((row) => {
    const base = createEntityBase();
    database.runSync(
      `
        INSERT INTO exercise_history_snapshots (
          id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
          exercise_id, period_key, workouts_count, sets_count, total_volume, total_reps, best_weight, best_estimated_1rm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      row.exercise_id,
      'all_time',
      row.workouts_count,
      row.sets_count,
      row.total_volume,
      row.total_reps,
      row.best_weight,
      row.best_estimated_1rm,
    );
  });
};

const rebuildCompletedWorkoutDerivedData = () => {
  database.execSync('BEGIN');

  try {
    database.runSync('DELETE FROM pr_records');
    database.runSync('DELETE FROM exercise_history_snapshots');
    rebuildPrRecords();
    rebuildExerciseHistorySnapshots();
    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  refreshAnalyticsCaches();
};

const buildWorkoutTotalsFromDraft = (draft: CompletedWorkoutEditDraft) =>
  draft.exercises.reduce(
    (totals, exercise) => {
      exercise.sets.forEach((set) => {
        if (!set.isCompleted) {
          return;
        }

        totals.totalVolume += calculateSetVolume(set.weightKg, set.reps);
        totals.totalReps += set.reps ?? 0;
        totals.totalDistanceMeters += set.distanceMeters ?? 0;
      });

      return totals;
    },
    {
      totalVolume: 0,
      totalReps: 0,
      totalDistanceMeters: 0,
    },
  );

const isAllCardioWorkoutHistoryDraft = (draft: CompletedWorkoutEditDraft) =>
  draft.exercises.length > 0 && draft.exercises.every((exercise) => isCardioExercise(exercise.exercise));

const sumWorkoutHistoryCardioDurationSeconds = (draft: CompletedWorkoutEditDraft) =>
  draft.exercises.reduce((totalDuration, exercise) => {
    if (!isCardioExercise(exercise.exercise)) {
      return totalDuration;
    }

    return (
      totalDuration +
      exercise.sets.reduce((exerciseDuration, set) => exerciseDuration + (set.durationSeconds ?? 0), 0)
    );
  }, 0);

const buildCompletedWorkoutHistoryMeta = (draft: CompletedWorkoutEditDraft) => {
  const durationSeconds = isAllCardioWorkoutHistoryDraft(draft)
    ? sumWorkoutHistoryCardioDurationSeconds(draft)
    : draft.workout.durationSeconds;

  if (durationSeconds <= 0) {
    return {
      ...draft.workout,
      title: draft.workout.title.trim(),
      durationSeconds: 0,
      endedAt: draft.workout.startedAt,
    };
  }

  return applyWorkoutSessionMeta(draft.workout, {
    title: draft.workout.title,
    durationSeconds,
  });
};

export const listCompletedWorkoutsHistory = ({
  limit,
  offset,
  dateFrom,
  dateTo,
}: {
  limit: number;
  offset: number;
  dateFrom?: string | null;
  dateTo?: string | null;
}): WorkoutHistoryItem[] => {
  const params: (string | number)[] = [];
  const dateClause =
    dateFrom && dateTo
      ? (() => {
          params.push(dateFrom, dateTo);
          return 'AND SUBSTR(w.started_at, 1, 10) BETWEEN ? AND ?';
        })()
      : '';

  const workouts = database.getAllSync<{
    id: string;
    title: string;
    source: WorkoutHistoryItem['source'];
    started_at: string;
    duration_seconds: number;
    total_volume: number;
  }>(
    `
      SELECT w.id, w.title, w.source, w.started_at, w.duration_seconds, w.total_volume
      FROM workouts w
      WHERE w.status = 'completed' AND w.deleted_at IS NULL
      ${dateClause}
      ORDER BY w.started_at DESC
      LIMIT ? OFFSET ?
    `,
    ...params,
    limit,
    offset,
  );

  if (workouts.length === 0) {
    return [];
  }

  const workoutIds = workouts.map((workout) => workout.id);
  const placeholders = workoutIds.map(() => '?').join(', ');

  const exerciseRows = database.getAllSync<{
    workout_id: string;
    workout_exercise_id: string;
    exercise_id: string;
    exercise_name: string;
    muscle_group: WorkoutHistoryItem['exercises'][number]['muscleGroup'];
    duration_seconds: number | null;
    sets_count: number;
    sort_order: number;
  }>(
    `
      SELECT
        we.workout_id,
        we.id AS workout_exercise_id,
        we.exercise_id,
        e.name AS exercise_name,
        e.muscle_group,
        SUM(se.duration_seconds) AS duration_seconds,
        COUNT(se.id) AS sets_count,
        we.sort_order
      FROM workout_exercises we
      JOIN exercises e ON e.id = we.exercise_id
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL
      WHERE we.deleted_at IS NULL AND we.workout_id IN (${placeholders})
      GROUP BY we.id
      ORDER BY we.workout_id ASC, we.sort_order ASC
    `,
    ...workoutIds,
  );

  const exercisesByWorkoutId = new Map<string, WorkoutHistoryItem['exercises']>();
  exerciseRows.forEach((row) => {
    const items = exercisesByWorkoutId.get(row.workout_id) ?? [];
    items.push({
      workoutExerciseId: row.workout_exercise_id,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      muscleGroup: row.muscle_group,
      durationSeconds: row.duration_seconds,
      setsCount: row.sets_count,
    });
    exercisesByWorkoutId.set(row.workout_id, items);
  });

  return workouts.map((workout) => ({
    id: workout.id,
    title: workout.title,
    source: workout.source,
    startedAt: workout.started_at,
    durationSeconds: workout.duration_seconds,
    totalVolume: workout.total_volume,
    exercises: exercisesByWorkoutId.get(workout.id) ?? [],
  }));
};

export const getCompletedWorkoutEditDraft = (workoutId: string): CompletedWorkoutEditDraft | null => {
  const model = getWorkoutLiveModel(workoutId);
  if (!model || model.workout.status !== 'completed' || model.workout.deletedAt) {
    return null;
  }

  return model;
};

export const deleteCompletedWorkoutHistory = (workoutId: string) => {
  const workout = database.getFirstSync<{ id: string }>(
    `
      SELECT id
      FROM workouts
      WHERE id = ? AND status = 'completed' AND deleted_at IS NULL
      LIMIT 1
    `,
    workoutId,
  );

  if (!workout) {
    return false;
  }

  const deletedAt = nowIso();

  database.execSync('BEGIN');

  try {
    database.runSync(
      'UPDATE workouts SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?',
      'discarded',
      deletedAt,
      deletedAt,
      workoutId,
    );
    database.runSync(
      'UPDATE workout_exercises SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL',
      deletedAt,
      deletedAt,
      workoutId,
    );
    database.runSync(
      `
        UPDATE set_entries
        SET deleted_at = ?, updated_at = ?
        WHERE workout_exercise_id IN (
          SELECT id FROM workout_exercises WHERE workout_id = ?
        ) AND deleted_at IS NULL
      `,
      deletedAt,
      deletedAt,
      workoutId,
    );
    database.runSync(
      'UPDATE pr_records SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL',
      deletedAt,
      deletedAt,
      workoutId,
    );
    database.runSync(
      'UPDATE workout_media SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL',
      deletedAt,
      deletedAt,
      workoutId,
    );
    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  rebuildCompletedWorkoutDerivedData();
  writeAuditLog('workout', workoutId, 'history_deleted', {});
  return true;
};

export const updateCompletedWorkoutSessionMeta = (
  workoutId: string,
  nextMeta: {
    title: string;
    startedAt?: string;
    durationSeconds: number;
  },
) => {
  const workout = database.getFirstSync<{
    id: string;
    title: string;
    status: WorkoutStatus;
    deleted_at: string | null;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number;
  }>(
    `
      SELECT id, title, status, deleted_at, started_at, ended_at, duration_seconds
      FROM workouts
      WHERE id = ?
      LIMIT 1
    `,
    workoutId,
  );

  if (!workout || workout.status !== 'completed' || workout.deleted_at != null) {
    throw new Error('Treino finalizado não encontrado.');
  }

  const workoutMeta = applyWorkoutSessionMeta(
    {
      startedAt: workout.started_at,
      title: workout.title,
      durationSeconds: workout.duration_seconds,
      endedAt: workout.ended_at,
    },
    nextMeta,
  );
  const updatedAt = nowIso();
  const shouldMoveCompletedSets = workoutMeta.startedAt !== workout.started_at;

  database.execSync('BEGIN');

  try {
    database.runSync(
      `
        UPDATE workouts
        SET title = ?, started_at = ?, duration_seconds = ?, ended_at = ?, updated_at = ?
        WHERE id = ?
      `,
      workoutMeta.title,
      workoutMeta.startedAt,
      workoutMeta.durationSeconds,
      workoutMeta.endedAt ?? null,
      updatedAt,
      workoutId,
    );

    if (shouldMoveCompletedSets) {
      const completedSets = database.getAllSync<{ id: string; completed_at: string | null }>(
        `
          SELECT se.id, se.completed_at
          FROM set_entries se
          JOIN workout_exercises we ON we.id = se.workout_exercise_id
          WHERE we.workout_id = ?
            AND se.deleted_at IS NULL
            AND se.is_completed = 1
            AND se.completed_at IS NOT NULL
        `,
        workoutId,
      );

      completedSets.forEach((set) => {
        database.runSync(
          'UPDATE set_entries SET completed_at = ?, updated_at = ? WHERE id = ?',
          moveCompletedAtToWorkoutDate(set.completed_at, workoutMeta.startedAt),
          updatedAt,
          set.id,
        );
      });
    }

    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  rebuildCompletedWorkoutDerivedData();
  writeAuditLog('workout', workoutId, 'session_meta_updated', {
    title: workoutMeta.title,
    startedAt: workoutMeta.startedAt,
    durationSeconds: workoutMeta.durationSeconds,
  });

  return getWorkoutLiveModel(workoutId);
};

export const saveCompletedWorkoutHistoryEdit = (workoutId: string, draft: CompletedWorkoutEditDraft) => {
  const workout = database.getFirstSync<{
    id: string;
    status: WorkoutStatus;
    deleted_at: string | null;
  }>(
    `
      SELECT id, status, deleted_at
      FROM workouts
      WHERE id = ?
      LIMIT 1
    `,
    workoutId,
  );

  if (!workout || workout.status !== 'completed' || workout.deleted_at != null) {
    throw new Error('Treino histórico não encontrado.');
  }

  const updatedAt = nowIso();
  const workoutMeta = buildCompletedWorkoutHistoryMeta(draft);
  const totals = buildWorkoutTotalsFromDraft(draft);
  const existingWorkoutExerciseIds = database
    .getAllSync<{ id: string }>('SELECT id FROM workout_exercises WHERE workout_id = ?', workoutId)
    .map((row) => row.id);

  database.execSync('BEGIN');

  try {
    database.runSync(
      `
        UPDATE workouts
        SET title = ?, general_note = ?, total_volume = ?, total_reps = ?, total_distance_meters = ?, started_at = ?, duration_seconds = ?, ended_at = ?, updated_at = ?
        WHERE id = ?
      `,
      workoutMeta.title,
      draft.workout.generalNote ?? '',
      totals.totalVolume,
      totals.totalReps,
      totals.totalDistanceMeters,
      workoutMeta.startedAt,
      workoutMeta.durationSeconds,
      workoutMeta.endedAt ?? null,
      updatedAt,
      workoutId,
    );

    if (existingWorkoutExerciseIds.length > 0) {
      const placeholders = existingWorkoutExerciseIds.map(() => '?').join(', ');
      database.runSync(
        `DELETE FROM set_entries WHERE workout_exercise_id IN (${placeholders})`,
        ...existingWorkoutExerciseIds,
      );
    }

    database.runSync('DELETE FROM workout_exercises WHERE workout_id = ?', workoutId);
    database.runSync('DELETE FROM pr_records WHERE workout_id = ?', workoutId);

    draft.exercises.forEach((exercise, exerciseIndex) => {
      const workoutExerciseBase = createEntityBase();
      database.runSync(
        `
          INSERT INTO workout_exercises (
            id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
            workout_id, exercise_id, sort_order, note, rest_seconds, previous_performance, superset_group
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        workoutExerciseBase.id,
        workoutExerciseBase.createdAt,
        updatedAt,
        null,
        workoutExerciseBase.version,
        workoutExerciseBase.schemaVersion,
        null,
        workoutExerciseBase.syncState,
        null,
        workoutExerciseBase.originDeviceId,
        workoutId,
        exercise.exercise.id,
        exerciseIndex,
        exercise.workoutExercise.note ?? '',
        exercise.workoutExercise.restSeconds,
        exercise.previousPerformance ?? '',
        exercise.workoutExercise.supersetGroup ?? '',
      );

      exercise.sets.forEach((set, setIndex) => {
        const setBase = createEntityBase();
        const completedAt = set.isCompleted
          ? moveCompletedAtToWorkoutDate(set.completedAt, workoutMeta.startedAt) ?? workoutMeta.endedAt ?? workoutMeta.startedAt
          : null;

        database.runSync(
          `
            INSERT INTO set_entries (
              id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
              workout_exercise_id, set_index, type, reps, weight_kg, duration_seconds, distance_meters, speed, elevation, rpe, completed_at, is_completed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          setBase.id,
          setBase.createdAt,
          updatedAt,
          null,
          setBase.version,
          setBase.schemaVersion,
          null,
          setBase.syncState,
          null,
          setBase.originDeviceId,
          workoutExerciseBase.id,
          setIndex,
          set.type,
          set.reps ?? null,
          set.weightKg ?? null,
          set.durationSeconds ?? null,
          set.distanceMeters ?? null,
          set.speed ?? null,
          set.elevation ?? null,
          set.rpe ?? null,
          completedAt,
          set.isCompleted ? 1 : 0,
        );
      });
    });

    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  rebuildCompletedWorkoutDerivedData();
  writeAuditLog('workout', workoutId, 'history_edited', {
    exerciseCount: draft.exercises.length,
  });
  return true;
};

export const finishWorkout = (workoutId: string) => {
  const previousStatus = recalculateWorkoutAggregates(workoutId, 'completed');
  database.runSync('DELETE FROM workout_draft_snapshots WHERE workout_id = ?', workoutId);
  if (previousStatus === 'completed') {
    rebuildCompletedWorkoutDerivedData();
  } else {
    updateSnapshots(workoutId);
    refreshAnalyticsCaches();
  }
  writeAuditLog('workout', workoutId, 'finished', {});
};

export const discardWorkout = (workoutId: string) => {
  database.runSync('UPDATE workouts SET status = ?, updated_at = ? WHERE id = ?', 'discarded', nowIso(), workoutId);
  database.runSync('DELETE FROM workout_draft_snapshots WHERE workout_id = ?', workoutId);
};
