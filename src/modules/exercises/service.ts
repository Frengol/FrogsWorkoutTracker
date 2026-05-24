import { z } from 'zod';

import { equipmentOptions, modalityOptions, muscleGroups } from '@/src/modules/exercises/constants';
import { createEntityBase, database, mapExerciseRow, writeAuditLog } from '@/src/shared/db/database';
import { CustomExerciseDraft, Equipment, Exercise, ExerciseModality, MuscleGroup } from '@/src/shared/types/domain';
import { nowIso } from '@/src/shared/utils/date';

const customExerciseSchema = z.object({
  name: z.string().trim().min(1).max(60),
  muscleGroup: z.enum(muscleGroups as [MuscleGroup, ...MuscleGroup[]]),
  secondaryMuscles: z
    .array(z.enum(muscleGroups as [MuscleGroup, ...MuscleGroup[]]))
    .max(4)
    .default([])
    .transform((value) => [...new Set(value)]),
  equipment: z.enum(equipmentOptions as [Equipment, ...Equipment[]]),
  modality: z.enum(modalityOptions as [ExerciseModality, ...ExerciseModality[]]),
  instructions: z.string().trim().max(500).default(''),
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const normalizeExerciseSearchText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const getExerciseSearchRank = (exercise: Exercise, normalizedSearch: string) => {
  const normalizedName = normalizeExerciseSearchText(exercise.name);
  const normalizedSlug = normalizeExerciseSearchText(exercise.slug);

  if (normalizedName === normalizedSearch) {
    return 0;
  }
  if (normalizedName.startsWith(normalizedSearch)) {
    return 1;
  }
  if (normalizedName.includes(normalizedSearch)) {
    return 2;
  }
  if (normalizedSlug.includes(normalizedSearch)) {
    return 3;
  }

  return null;
};

const buildUniqueSlug = (name: string, currentExerciseId?: string) => {
  const baseSlug = slugify(name) || 'custom-exercise';
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = database.getFirstSync<{ id: string }>(
      'SELECT id FROM exercises WHERE slug = ? LIMIT 1',
      slug,
    );

    if (!existing || existing.id === currentExerciseId) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
};

export const listExercises = ({
  search = '',
  muscleGroup = 'all',
  equipment = 'all',
  onlyCustom = false,
  limit,
  offset = 0,
}: {
  search?: string;
  muscleGroup?: MuscleGroup | 'all';
  equipment?: Equipment | 'all';
  onlyCustom?: boolean;
  limit?: number;
  offset?: number;
}) => {
  const clauses: string[] = ['deleted_at IS NULL'];
  const params: (string | number)[] = [];
  const normalizedSearch = normalizeExerciseSearchText(search);

  if (muscleGroup !== 'all') {
    clauses.push('muscle_group = ?');
    params.push(muscleGroup);
  }

  if (equipment !== 'all') {
    clauses.push('equipment = ?');
    params.push(equipment);
  }

  if (onlyCustom) {
    clauses.push('is_custom = 1');
  }

  const rows = database.getAllSync<Record<string, unknown>>(
    `SELECT * FROM exercises WHERE ${clauses.join(' AND ')} ORDER BY is_custom DESC, name ASC`,
    ...params,
  );

  const exercises = rows.map(mapExerciseRow) as Exercise[];
  const filteredExercises = normalizedSearch
    ? exercises
        .map((exercise, index) => ({
          exercise,
          index,
          rank: getExerciseSearchRank(exercise, normalizedSearch),
        }))
        .filter((entry): entry is { exercise: Exercise; index: number; rank: number } => entry.rank != null)
        .sort((first, second) => first.rank - second.rank || first.index - second.index)
        .map((entry) => entry.exercise)
    : exercises;

  const normalizedOffset = Math.max(0, Math.trunc(offset));

  if (limit === undefined) {
    return filteredExercises.slice(normalizedOffset);
  }

  const normalizedLimit = Math.max(0, Math.trunc(limit));
  return filteredExercises.slice(normalizedOffset, normalizedOffset + normalizedLimit);
};

export const listCustomExercises = () => listExercises({ onlyCustom: true });

export const getExerciseById = (exerciseId: string) => {
  const row = database.getFirstSync<Record<string, unknown>>('SELECT * FROM exercises WHERE id = ?', exerciseId);
  if (!row) {
    return null;
  }

  return mapExerciseRow(row) as Exercise;
};

export type CustomExerciseUsage = {
  workoutExercises: number;
  routineExercises: number;
  prRecords: number;
  historySnapshots: number;
  total: number;
};

export type DeleteCustomExerciseResult = {
  mode: 'physical' | 'logical';
  usage: CustomExerciseUsage;
};

const getExerciseReferenceCount = (tableName: string, exerciseId: string) =>
  database.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName} WHERE exercise_id = ?`, exerciseId)?.count ?? 0;

export const getCustomExerciseUsage = (exerciseId: string): CustomExerciseUsage => {
  const workoutExercises = getExerciseReferenceCount('workout_exercises', exerciseId);
  const routineExercises = getExerciseReferenceCount('routine_exercises', exerciseId);
  const prRecords = getExerciseReferenceCount('pr_records', exerciseId);
  const historySnapshots = getExerciseReferenceCount('exercise_history_snapshots', exerciseId);

  return {
    workoutExercises,
    routineExercises,
    prRecords,
    historySnapshots,
    total: workoutExercises + routineExercises + prRecords + historySnapshots,
  };
};

export const saveCustomExercise = (input: CustomExerciseDraft, exerciseId?: string) => {
  const parsed = customExerciseSchema.parse(input);
  const slug = buildUniqueSlug(parsed.name, exerciseId);
  const timestamp = nowIso();

  if (exerciseId) {
    const existing = getExerciseById(exerciseId);
    if (!existing?.isCustom) {
      throw new Error('Somente exercícios personalizados podem ser editados.');
    }

    database.runSync(
      `
        UPDATE exercises
        SET slug = ?, name = ?, muscle_group = ?, secondary_muscles_json = ?, equipment = ?, modality = ?, instructions = ?, updated_at = ?
        WHERE id = ?
      `,
      slug,
      parsed.name,
      parsed.muscleGroup,
      JSON.stringify(parsed.secondaryMuscles),
      parsed.equipment,
      parsed.modality,
      parsed.instructions || 'Exercício personalizado criado neste aparelho.',
      timestamp,
      exerciseId,
    );

    writeAuditLog('exercise', exerciseId, 'custom_updated', parsed as Record<string, unknown>);
    return exerciseId;
  }

  const base = createEntityBase();
  database.runSync(
    `
      INSERT INTO exercises (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        slug, name, muscle_group, secondary_muscles_json, equipment, modality, is_custom, instructions
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
    slug,
    parsed.name,
    parsed.muscleGroup,
    JSON.stringify(parsed.secondaryMuscles),
    parsed.equipment,
    parsed.modality,
    1,
    parsed.instructions || 'Exercício personalizado criado neste aparelho.',
  );

  writeAuditLog('exercise', base.id, 'custom_created', parsed as Record<string, unknown>);
  return base.id;
};

export const deleteCustomExercise = (exerciseId: string): DeleteCustomExerciseResult => {
  const exercise = getExerciseById(exerciseId);
  if (!exercise?.isCustom) {
    throw new Error('Somente exercícios personalizados podem ser excluídos.');
  }

  const usage = getCustomExerciseUsage(exerciseId);
  if (usage.total === 0) {
    database.runSync('DELETE FROM exercises WHERE id = ? AND is_custom = 1', exerciseId);
    writeAuditLog('exercise', exerciseId, 'custom_deleted_physical', { usage });
    return { mode: 'physical', usage };
  }

  const timestamp = nowIso();
  database.runSync('UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ?', timestamp, timestamp, exerciseId);
  writeAuditLog('exercise', exerciseId, 'custom_deleted_logical', { usage });
  return { mode: 'logical', usage };
};

export const getExerciseHistory = (exerciseId: string) =>
  database.getAllSync<{
    started_at: string;
    total_volume: number;
    total_reps: number;
    best_weight: number;
    best_estimated_1rm: number;
  }>(
    `
      SELECT
        w.started_at,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(SUM(se.reps), 0) AS total_reps,
        COALESCE(MAX(se.weight_kg), 0) AS best_weight,
        COALESCE(MAX(CASE
          WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * (1 + se.reps / 30.0)
          ELSE 0
        END), 0) AS best_estimated_1rm
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1
      WHERE we.exercise_id = ? AND w.status = 'completed'
      GROUP BY w.id
      ORDER BY w.started_at DESC
      LIMIT 12
    `,
    exerciseId,
  );
