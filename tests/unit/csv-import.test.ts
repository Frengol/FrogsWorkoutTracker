import {
  detectCsvImportKind,
  inferHevySetType,
  isHevyWorkoutCsv,
  parseNullableImportNumber,
} from '@/src/modules/data-transfer/adapters';
import { parseCsv, simpleChecksum, toCsv } from '@/src/shared/utils/csv';

describe('csv helpers and adapters', () => {
  it('serializes and parses CSV rows with quoted cells', () => {
    const csv = toCsv([
      {
        workout_id: 'w1',
        note: 'bench, pause',
      },
    ]);

    const parsed = parseCsv(csv);

    expect(parsed.headers).toEqual(['workout_id', 'note']);
    expect(parsed.rows[0]).toEqual({ workout_id: 'w1', note: 'bench, pause' });
  });

  it('generates stable checksums for the same content', () => {
    expect(simpleChecksum('frog')).toBe(simpleChecksum('frog'));
    expect(simpleChecksum('frog')).not.toBe(simpleChecksum('toad'));
  });

  it('detects native Frogs workout and measurement CSV formats', () => {
    expect(
      detectCsvImportKind([
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
      ]),
    ).toBe('frog_workouts');

    expect(
      detectCsvImportKind([
        'measurement_id',
        'recorded_at',
        'weight_kg',
        'chest_cm',
        'waist_cm',
        'hips_cm',
        'arm_cm',
        'thigh_cm',
        'note',
      ]),
    ).toBe('frog_measurements');

    expect(
      detectCsvImportKind([
        'measurement_id',
        'recorded_at',
        'weight_kg',
        'chest_cm',
        'waist_cm',
        'hips_cm',
        'arm_cm',
        'thigh_cm',
        'related_workout_id',
        'note',
      ]),
    ).toBe('frog_measurements');
  });

  it('accepts Hevy CSV only when the expected snake_case headers exist', () => {
    const hevyHeaders = [
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
    ];

    expect(isHevyWorkoutCsv(hevyHeaders)).toBe(true);
    expect(detectCsvImportKind(hevyHeaders)).toBe('hevy_workouts');
    expect(isHevyWorkoutCsv(['Date', 'Workout Name', 'Exercise Name', 'Weight', 'Reps'])).toBe(false);
    expect(detectCsvImportKind(['Date', 'Workout Name', 'Exercise Name', 'Weight', 'Reps'])).toBe('unknown');
  });

  it('infers Hevy set types and parses nullable numeric fields', () => {
    expect(inferHevySetType({ set_type: 'warmup' })).toBe('warmup');
    expect(inferHevySetType({ set_type: 'dropset' })).toBe('drop');
    expect(inferHevySetType({ set_type: 'failure' })).toBe('failure');
    expect(inferHevySetType({ set_type: 'normal', duration_seconds: '45' })).toBe('timed');
    expect(inferHevySetType({ set_type: 'normal', distance_km: '1.2' })).toBe('distance');
    expect(parseNullableImportNumber('12,5')).toBe(12.5);
    expect(parseNullableImportNumber('')).toBeNull();
  });
});
