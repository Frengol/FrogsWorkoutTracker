import { database, createEntityBase, writeAuditLog } from '@/src/shared/db/database';
import { RoutineComposerInput } from '@/src/shared/types/domain';
import { nowIso } from '@/src/shared/utils/date';

type DeleteRoutineFolderMode = 'keep_routines' | 'delete_routines';

const findOrCreateFolder = (folderName: string) => {
  const normalized = folderName.trim();
  if (!normalized) {
    return null;
  }

  const existing = database.getFirstSync<{ id: string }>(
    'SELECT id FROM routine_folders WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1',
    normalized,
  );

  if (existing?.id) {
    return existing.id;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO routine_folders (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        name, color_token, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    normalized,
    'blue',
    0,
  );
  return base.id;
};

export const listRoutineFolders = () =>
  database.getAllSync<{
    id: string;
    name: string;
    color_token: string;
  }>('SELECT id, name, color_token FROM routine_folders WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC');

export const listRoutines = () =>
  database.getAllSync<{
    id: string;
    name: string;
    description: string | null;
    source: string;
    estimated_minutes: number | null;
    folder_name: string | null;
    exercises_count: number;
  }>(
    `
      SELECT
        r.id,
        r.name,
        r.description,
        r.source,
        r.estimated_minutes,
        rf.name AS folder_name,
        COUNT(re.id) AS exercises_count
      FROM routines r
      LEFT JOIN routine_folders rf ON rf.id = r.folder_id AND rf.deleted_at IS NULL
      LEFT JOIN routine_exercises re ON re.routine_id = r.id
      WHERE r.deleted_at IS NULL AND r.is_archived = 0
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `,
  );

export const getRoutineDetails = (routineId: string) => {
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
    name: string;
    muscle_group: string;
    equipment: string;
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
  }>(
    `
      SELECT
        re.id,
        re.exercise_id,
        e.name,
        e.muscle_group,
        e.equipment,
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
        re.warmup_enabled
      FROM routine_exercises re
      JOIN exercises e ON e.id = re.exercise_id
      WHERE re.routine_id = ? AND re.deleted_at IS NULL
      ORDER BY re.sort_order ASC
    `,
    routineId,
  );

  return {
    routine,
    exercises,
  };
};

export const saveRoutine = (input: RoutineComposerInput, routineId?: string) => {
  const folderId = findOrCreateFolder(input.folderName);
  const timestamp = nowIso();
  const entityBase = createEntityBase();

  if (routineId) {
    database.runSync(
      `
        UPDATE routines
        SET name = ?, description = ?, folder_id = ?, updated_at = ?, estimated_minutes = ?
        WHERE id = ?
      `,
      input.name.trim(),
      input.description.trim(),
      folderId,
      timestamp,
      Math.max(20, input.exercises.length * 9),
      routineId,
    );

    database.runSync('DELETE FROM routine_exercises WHERE routine_id = ?', routineId);
  } else {
    database.runSync(
      `
        INSERT INTO routines (
          id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
          folder_id, name, description, source, estimated_minutes, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      entityBase.id,
      entityBase.createdAt,
      entityBase.updatedAt,
      null,
      entityBase.version,
      entityBase.schemaVersion,
      null,
      entityBase.syncState,
      null,
      entityBase.originDeviceId,
      folderId,
      input.name.trim(),
      input.description.trim(),
      'custom',
      Math.max(20, input.exercises.length * 9),
      0,
    );
  }

  const effectiveRoutineId = routineId ?? entityBase.id;
  input.exercises.forEach((exercise, index) => {
    const base = createEntityBase();
    database.runSync(
      `
        INSERT INTO routine_exercises (
          id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
          routine_id, exercise_id, sort_order, target_sets, target_reps_label, rest_seconds, cardio_duration_seconds, cardio_distance_meters, cardio_speed, cardio_elevation,
          note, private_link, superset_group, warmup_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      effectiveRoutineId,
      exercise.exerciseId,
      index,
      exercise.targetSets,
      exercise.targetRepsLabel,
      exercise.restSeconds,
      exercise.cardioDurationSeconds ?? null,
      exercise.cardioDistanceMeters ?? null,
      exercise.cardioSpeed ?? null,
      exercise.cardioElevation ?? null,
      exercise.note.trim(),
      exercise.privateLink.trim(),
      exercise.supersetGroup.trim(),
      exercise.warmupEnabled ? 1 : 0,
    );
  });

  writeAuditLog('routine', effectiveRoutineId, routineId ? 'updated' : 'created', {
    name: input.name,
    exercises: input.exercises.length,
  });

  return effectiveRoutineId;
};

export const duplicateRoutine = (routineId: string) => {
  const details = getRoutineDetails(routineId);
  if (!details) {
    return null;
  }

  return saveRoutine(
    {
      name: `${details.routine.name} - Cópia`,
      description: details.routine.description ?? '',
      folderName: details.routine.folder_name ?? '',
      exercises: details.exercises.map((exercise) => ({
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
      })),
    },
    undefined,
  );
};

export const deleteRoutine = (routineId: string) => {
  const details = getRoutineDetails(routineId);
  if (!details) {
    return false;
  }

  const timestamp = nowIso();
  database.runSync('UPDATE routines SET deleted_at = ?, updated_at = ? WHERE id = ?', timestamp, timestamp, routineId);
  database.runSync(
    'UPDATE routine_exercises SET deleted_at = ?, updated_at = ? WHERE routine_id = ?',
    timestamp,
    timestamp,
    routineId,
  );

  writeAuditLog('routine', routineId, 'deleted', {
    name: details.routine.name,
    exercises: details.exercises.length,
  });

  return true;
};

export const deleteRoutineFolder = (folderId: string, mode: DeleteRoutineFolderMode) => {
  const folder = database.getFirstSync<{ id: string; name: string }>(
    'SELECT id, name FROM routine_folders WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    folderId,
  );

  if (!folder) {
    return false;
  }

  const routinesInFolder = database.getAllSync<{ id: string; name: string }>(
    'SELECT id, name FROM routines WHERE folder_id = ? AND deleted_at IS NULL',
    folderId,
  );
  const timestamp = nowIso();

  database.execSync('BEGIN');

  try {
    if (mode === 'keep_routines') {
      database.runSync('UPDATE routines SET folder_id = NULL, updated_at = ? WHERE folder_id = ? AND deleted_at IS NULL', timestamp, folderId);
    } else {
      database.runSync(
        'UPDATE routines SET deleted_at = ?, updated_at = ? WHERE folder_id = ? AND deleted_at IS NULL',
        timestamp,
        timestamp,
        folderId,
      );
      database.runSync(
        `
          UPDATE routine_exercises
          SET deleted_at = ?, updated_at = ?
          WHERE routine_id IN (
            SELECT id FROM routines WHERE folder_id = ?
          ) AND deleted_at IS NULL
        `,
        timestamp,
        timestamp,
        folderId,
      );
    }

    database.runSync(
      'UPDATE routine_folders SET deleted_at = ?, updated_at = ? WHERE id = ?',
      timestamp,
      timestamp,
      folderId,
    );
    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }

  writeAuditLog('routine_folder', folderId, 'deleted', {
    name: folder.name,
    mode,
    routines: routinesInFolder.map((routine) => ({ id: routine.id, name: routine.name })),
    routinesCount: routinesInFolder.length,
  });

  if (mode === 'delete_routines') {
    routinesInFolder.forEach((routine) => {
      writeAuditLog('routine', routine.id, 'deleted_with_folder', {
        folderId,
        folderName: folder.name,
      });
    });
  }

  return true;
};
