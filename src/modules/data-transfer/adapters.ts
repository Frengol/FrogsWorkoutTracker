import { MeasurementCsvRow, WorkoutCsvRow } from '@/src/shared/types/domain';

export const workoutCsvHeaders: (keyof WorkoutCsvRow)[] = [
  'workout_id',
  'workout_title',
  'workout_started_at',
  'workout_ended_at',
  'workout_duration_seconds',
  'workout_status',
  'workout_source',
  'workout_note',
  'workout_exercise_id',
  'exercise_id',
  'exercise_name',
  'exercise_sort_order',
  'exercise_note',
  'rest_seconds',
  'previous_performance',
  'superset_group',
  'muscle_group',
  'secondary_muscles_json',
  'equipment',
  'modality',
  'instructions',
  'set_id',
  'set_index',
  'set_type',
  'reps',
  'weight_kg',
  'duration_seconds',
  'distance_meters',
  'speed',
  'elevation',
  'rpe',
  'is_completed',
];

const requiredWorkoutCsvHeaders = workoutCsvHeaders.filter(
  (header) => !['secondary_muscles_json', 'equipment', 'modality', 'instructions'].includes(header),
);

export const measurementCsvHeaders: (keyof MeasurementCsvRow)[] = [
  'measurement_id',
  'recorded_at',
  'weight_kg',
  'chest_cm',
  'waist_cm',
  'hips_cm',
  'arm_cm',
  'thigh_cm',
  'note',
];

export const hevyWorkoutCsvHeaders = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'weight_kg',
  'reps',
  'distance_km',
  'duration_seconds',
  'rpe',
] as const;

export const normalizeCsvHeader = (header: string) => header.trim().toLowerCase();

export const parseNullableImportNumber = (value?: string | null) => {
  if (value == null || value.trim() === '') {
    return null;
  }

  const normalized = Number(value.replace(',', '.'));
  return Number.isNaN(normalized) ? null : normalized;
};

export const isHevyWorkoutCsv = (headers: string[]) => {
  const normalized = headers.map(normalizeCsvHeader);
  return hevyWorkoutCsvHeaders.every((header) => normalized.includes(normalizeCsvHeader(header)));
};

export const detectCsvImportKind = (headers: string[]) => {
  const normalizedHeaders = headers.map(normalizeCsvHeader);

  if (requiredWorkoutCsvHeaders.every((header) => normalizedHeaders.includes(normalizeCsvHeader(header)))) {
    return 'frog_workouts';
  }

  if (measurementCsvHeaders.every((header) => normalizedHeaders.includes(normalizeCsvHeader(header)))) {
    return 'frog_measurements';
  }

  if (isHevyWorkoutCsv(headers)) {
    return 'hevy_workouts';
  }

  return 'unknown';
};

export const inferHevySetType = (row: Record<string, string>) => {
  const rawType = normalizeCsvHeader(row.set_type ?? '');

  if (rawType === 'warmup' || rawType.includes('warm')) {
    return 'warmup';
  }
  if (rawType === 'dropset' || rawType.includes('drop')) {
    return 'drop';
  }
  if (rawType.includes('failure')) {
    return 'failure';
  }
  if (rawType.includes('super')) {
    return 'superset';
  }
  if (parseNullableImportNumber(row.distance_km) != null) {
    return 'distance';
  }
  if (parseNullableImportNumber(row.duration_seconds) != null) {
    return 'timed';
  }

  return 'normal';
};
