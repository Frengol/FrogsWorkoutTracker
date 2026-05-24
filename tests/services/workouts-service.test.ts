jest.mock('@/src/shared/db/database', () => ({
  createEntityBase: jest.fn(() => ({
    id: 'entity-1',
    createdAt: '2026-03-25T10:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    version: 1,
    schemaVersion: 3,
    syncState: 'local_only',
    originDeviceId: 'device-1',
  })),
  database: {
    execSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  },
  writeAuditLog: jest.fn(),
}));

jest.mock('@/src/modules/progress/service', () => ({
  refreshAnalyticsCaches: jest.fn(),
}));

jest.mock('@/src/modules/routines/service', () => ({
  getRoutineDetails: jest.fn(),
  saveRoutine: jest.fn(() => 'routine-1'),
}));

import {
  addExerciseToWorkout,
  addSetToWorkoutExercise,
  applyPreviousValuesToSet,
  completeSetEntry,
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  getRoutineUpdateSuggestionForWorkout,
  getWorkoutLiveModel,
  listCompletedWorkoutHistoryIds,
  listCompletedWorkoutsHistory,
  listWorkoutPrs,
  removeSetFromWorkoutExercise,
  reorderWorkoutExercises,
  replaceWorkoutExerciseExercise,
  saveCompletedWorkoutHistoryEdit,
  saveQuickWorkoutAsRoutine,
  startEmptyWorkout,
  startRoutineWorkout,
  undoCompleteSetEntry,
  updateCompletedWorkoutSessionMeta,
  updateRoutineFromWorkout,
  updateSetEntry,
  updateSetEntryFields,
  updateWorkoutExerciseNote,
  updateWorkoutNote,
} from '@/src/modules/workouts/service';
import { getRoutineDetails, saveRoutine } from '@/src/modules/routines/service';
import { createEntityBase, database, writeAuditLog } from '@/src/shared/db/database';
import { refreshAnalyticsCaches } from '@/src/modules/progress/service';

const createWorkoutRow = (overrides: Partial<any> = {}) => ({
  id: 'workout-routine',
  created_at: '2026-03-25T10:00:00.000Z',
  updated_at: '2026-03-25T10:00:00.000Z',
  deleted_at: null,
  version: 1,
  schema_version: 3,
  remote_id: null,
  sync_state: 'local_only',
  last_exported_at: null,
  origin_device_id: 'device-1',
  routine_id: 'routine-1',
  title: 'Push Day',
  status: 'completed',
  source: 'routine',
  started_at: '2026-03-25T10:00:00.000Z',
  ended_at: '2026-03-25T11:00:00.000Z',
  duration_seconds: 3600,
  general_note: '',
  total_volume: 1000,
  total_reps: 31,
  total_distance_meters: 0,
  ...overrides,
});

const createWorkoutExerciseRow = (overrides: Partial<any> = {}) => ({
  id: 'we-1',
  created_at: '2026-03-25T10:00:00.000Z',
  updated_at: '2026-03-25T10:00:00.000Z',
  deleted_at: null,
  version: 1,
  schema_version: 3,
  remote_id: null,
  sync_state: 'local_only',
  last_exported_at: null,
  origin_device_id: 'device-1',
  workout_id: 'workout-routine',
  exercise_id: 'exercise-1',
  sort_order: 0,
  note: '',
  rest_seconds: 90,
  previous_performance: '',
  superset_group: '',
  exercise_name: 'Supino reto',
  muscle_group: 'chest',
  equipment: 'barbell',
  modality: 'strength',
  secondary_muscles_json: '[]',
  is_custom: 0,
  instructions: null,
  ...overrides,
});

const createSetRow = (overrides: Partial<any> = {}) => ({
  id: 'set-1',
  created_at: '2026-03-25T10:00:00.000Z',
  updated_at: '2026-03-25T10:00:00.000Z',
  deleted_at: null,
  version: 1,
  schema_version: 3,
  remote_id: null,
  sync_state: 'local_only',
  last_exported_at: null,
  origin_device_id: 'device-1',
  workout_exercise_id: 'we-1',
  set_index: 0,
  type: 'normal',
  reps: 10,
  weight_kg: 60,
  duration_seconds: null,
  distance_meters: null,
  speed: null,
  elevation: null,
  rpe: null,
  completed_at: null,
  is_completed: 1,
  ...overrides,
});

const createRoutineExercise = (overrides: Partial<any> = {}) => ({
  id: 're-1',
  exercise_id: 'exercise-1',
  name: 'Supino reto',
  muscle_group: 'chest',
  equipment: 'barbell',
  target_sets: 2,
  target_reps_label: '8-10',
  rest_seconds: 90,
  cardio_duration_seconds: null,
  cardio_distance_meters: null,
  cardio_speed: null,
  cardio_elevation: null,
  note: '',
  private_link: null,
  superset_group: '',
  warmup_enabled: 0,
  ...overrides,
});

const createRoutineDetails = (exercises: any[] = [createRoutineExercise()], overrides: Partial<any> = {}) => ({
  routine: {
    id: 'routine-1',
    name: 'Push Day',
    description: 'Peito e ombro',
    source: 'custom',
    estimated_minutes: 45,
    folder_name: 'Força',
    ...overrides,
  },
  exercises,
});

const mockWorkoutLiveModelQueries = ({
  workout = createWorkoutRow(),
  exercises = [createWorkoutExerciseRow()],
  setsByWorkoutExerciseId = {
    'we-1': [
      createSetRow({ id: 'set-1', workout_exercise_id: 'we-1', set_index: 0, reps: 10 }),
      createSetRow({ id: 'set-2', workout_exercise_id: 'we-1', set_index: 1, reps: 8 }),
    ],
  },
}: {
  workout?: any;
  exercises?: any[];
  setsByWorkoutExerciseId?: Record<string, any[]>;
} = {}) => {
  (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
    const query = String(sql);
    if (query.includes('SELECT * FROM workouts')) {
      return workout;
    }
    if (query.includes('SELECT se.weight_kg') || query.includes('SELECT we.id')) {
      return null;
    }
    return null;
  });
  (database.getAllSync as jest.Mock).mockImplementation((sql: string, firstParam?: string) => {
    const query = String(sql);
    if (query.includes('FROM workout_exercises we') && query.includes('JOIN exercises e')) {
      return exercises;
    }
    if (query.includes('SELECT * FROM set_entries')) {
      return setsByWorkoutExerciseId[firstParam ?? ''] ?? [];
    }
    return [];
  });
};

describe('workouts service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (database.getFirstSync as jest.Mock).mockReset();
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([]);
    (database.runSync as jest.Mock).mockReset();
    (database.execSync as jest.Mock).mockReset();
    let entityIndex = 0;
    (createEntityBase as jest.Mock).mockImplementation(() => {
      entityIndex += 1;
      return {
        id: `entity-${entityIndex}`,
        createdAt: '2026-03-25T10:00:00.000Z',
        updatedAt: '2026-03-25T10:00:00.000Z',
        version: 1,
        schemaVersion: 3,
        syncState: 'local_only',
        originDeviceId: 'device-1',
      };
    });
  });

  it('returns the active workout when one is already in progress', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({
      id: 'workout-1',
      title: 'Treino A',
      started_at: '2026-03-25T10:00:00.000Z',
      status: 'in_progress',
    });

    expect(getActiveWorkout()).toEqual({
      id: 'workout-1',
      title: 'Treino A',
      started_at: '2026-03-25T10:00:00.000Z',
      status: 'in_progress',
    });
    expect(startEmptyWorkout()).toBe('workout-1');
  });

  it('starts an empty workout when there is no active session', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        title: 'Treino rápido',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 0,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null);

    const workoutId = startEmptyWorkout();

    expect(workoutId).toBe('entity-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      'entity-1',
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
      'in_progress',
      'empty',
      expect.any(String),
      null,
      0,
      '',
      0,
      0,
      0,
    );
    expect(writeAuditLog).toHaveBeenCalledWith('workout', 'entity-1', 'started_empty', {});
  });

  it('starts an empty workout even when there are no saved preferences', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        title: 'Treino rápido',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 0,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null);

    startEmptyWorkout();

    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      'entity-1',
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
      'in_progress',
      'empty',
      expect.any(String),
      null,
      0,
      '',
      0,
      0,
      0,
    );
  });

  it('converts a completed quick workout into a reusable routine in the library', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'workout-quick',
        created_at: '2026-03-25T10:00:00.000Z',
        updated_at: '2026-03-25T10:00:00.000Z',
        deleted_at: null,
        version: 1,
        schema_version: 3,
        remote_id: null,
        sync_state: 'local_only',
        last_exported_at: null,
        origin_device_id: 'device-1',
        routine_id: null,
        title: 'Treino rápido',
        status: 'completed',
        source: 'empty',
        started_at: '2026-03-25T10:00:00.000Z',
        ended_at: '2026-03-25T11:00:00.000Z',
        duration_seconds: 3600,
        general_note: '',
        total_volume: 1000,
        total_reps: 31,
        total_distance_meters: 0,
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'we-1',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_id: 'workout-quick',
          exercise_id: 'exercise-1',
          sort_order: 0,
          note: 'Segurar 1s',
          rest_seconds: 90,
          previous_performance: '72 kg x 8',
          superset_group: 'A',
          exercise_name: 'Supino reto',
          muscle_group: 'chest',
          equipment: 'barbell',
          modality: 'strength',
          secondary_muscles_json: '[]',
          is_custom: 0,
          instructions: null,
        },
      ])
      .mockReturnValueOnce([
        {
          id: 'set-1',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_exercise_id: 'we-1',
          set_index: 0,
          type: 'warmup',
          reps: 12,
          weight_kg: 20,
          duration_seconds: null,
          distance_meters: null,
          rpe: null,
          completed_at: null,
          is_completed: 0,
        },
        {
          id: 'set-2',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_exercise_id: 'we-1',
          set_index: 1,
          type: 'normal',
          reps: 10,
          weight_kg: 60,
          duration_seconds: null,
          distance_meters: null,
          rpe: null,
          completed_at: null,
          is_completed: 1,
        },
        {
          id: 'set-3',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_exercise_id: 'we-1',
          set_index: 2,
          type: 'failure',
          reps: 6,
          weight_kg: 70,
          duration_seconds: null,
          distance_meters: null,
          rpe: null,
          completed_at: null,
          is_completed: 1,
        },
      ]);

    expect(saveQuickWorkoutAsRoutine('workout-quick', 'Upper salva')).toBe('routine-1');

    expect(saveRoutine).toHaveBeenCalledWith({
      name: 'Upper salva',
      description: '',
      folderName: '',
      exercises: [
        {
          cardioDurationSeconds: null,
          cardioDistanceMeters: null,
          cardioSpeed: null,
          cardioElevation: null,
          exerciseId: 'exercise-1',
          targetSets: 2,
          targetRepsLabel: '6-10',
          restSeconds: 90,
          note: 'Segurar 1s',
          privateLink: '',
          supersetGroup: 'A',
          warmupEnabled: true,
        },
      ],
    });
    expect(writeAuditLog).toHaveBeenCalledWith('workout', 'workout-quick', 'saved_as_routine', {
      routineId: 'routine-1',
      name: 'Upper salva',
    });
  });

  it('uses the reps fallback when saving a quick workout without non-warmup reps', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'workout-quick',
        created_at: '2026-03-25T10:00:00.000Z',
        updated_at: '2026-03-25T10:00:00.000Z',
        deleted_at: null,
        version: 1,
        schema_version: 3,
        remote_id: null,
        sync_state: 'local_only',
        last_exported_at: null,
        origin_device_id: 'device-1',
        routine_id: null,
        title: 'Treino rápido',
        status: 'completed',
        source: 'empty',
        started_at: '2026-03-25T10:00:00.000Z',
        ended_at: '2026-03-25T11:00:00.000Z',
        duration_seconds: 3600,
        general_note: '',
        total_volume: 0,
        total_reps: 0,
        total_distance_meters: 0,
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'we-1',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_id: 'workout-quick',
          exercise_id: 'exercise-1',
          sort_order: 0,
          note: '',
          rest_seconds: 60,
          previous_performance: '',
          superset_group: '',
          exercise_name: 'Rosca direta',
          muscle_group: 'biceps',
          equipment: 'ez_bar',
          modality: 'strength',
          secondary_muscles_json: '[]',
          is_custom: 0,
          instructions: null,
        },
      ])
      .mockReturnValueOnce([
        {
          id: 'set-1',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_exercise_id: 'we-1',
          set_index: 0,
          type: 'normal',
          reps: null,
          weight_kg: 20,
          duration_seconds: null,
          distance_meters: null,
          rpe: null,
          completed_at: null,
          is_completed: 0,
        },
      ]);

    saveQuickWorkoutAsRoutine('workout-quick', 'Braços');

    expect(saveRoutine).toHaveBeenLastCalledWith({
      name: 'Braços',
      description: '',
      folderName: '',
      exercises: [
        expect.objectContaining({
          targetSets: 1,
          targetRepsLabel: '8-10',
          warmupEnabled: false,
        }),
      ],
    });
  });

  it('does not suggest routine updates for quick workouts, missing routines or unchanged structure', () => {
    mockWorkoutLiveModelQueries({
      workout: createWorkoutRow({ source: 'empty', routine_id: null, title: 'Treino rápido' }),
    });

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toBeNull();
    expect(getRoutineDetails).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockWorkoutLiveModelQueries();
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toBeNull();

    jest.clearAllMocks();
    mockWorkoutLiveModelQueries();
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails());

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toBeNull();
  });

  it('suggests routine updates when exercises are added, removed, replaced or reordered', () => {
    const exerciseA = createWorkoutExerciseRow({ id: 'we-a', exercise_id: 'exercise-a', exercise_name: 'Supino reto' });
    const exerciseB = createWorkoutExerciseRow({
      id: 'we-b',
      exercise_id: 'exercise-b',
      exercise_name: 'Desenvolvimento',
      sort_order: 1,
    });
    const routineA = createRoutineExercise({ id: 're-a', exercise_id: 'exercise-a', name: 'Supino reto' });
    const routineB = createRoutineExercise({ id: 're-b', exercise_id: 'exercise-b', name: 'Desenvolvimento' });
    const baseSets = {
      'we-a': [
        createSetRow({ id: 'set-a-1', workout_exercise_id: 'we-a', set_index: 0 }),
        createSetRow({ id: 'set-a-2', workout_exercise_id: 'we-a', set_index: 1 }),
      ],
      'we-b': [
        createSetRow({ id: 'set-b-1', workout_exercise_id: 'we-b', set_index: 0 }),
        createSetRow({ id: 'set-b-2', workout_exercise_id: 'we-b', set_index: 1 }),
      ],
    };

    mockWorkoutLiveModelQueries({ exercises: [exerciseA, exerciseB], setsByWorkoutExerciseId: baseSets });
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails([routineA]));

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toEqual({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 1,
    });

    jest.clearAllMocks();
    mockWorkoutLiveModelQueries({ exercises: [exerciseA], setsByWorkoutExerciseId: baseSets });
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails([routineA, routineB]));

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toEqual({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 1,
    });

    jest.clearAllMocks();
    mockWorkoutLiveModelQueries({
      exercises: [createWorkoutExerciseRow({ id: 'we-c', exercise_id: 'exercise-c', exercise_name: 'Crucifixo' })],
      setsByWorkoutExerciseId: {
        'we-c': [
          createSetRow({ id: 'set-c-1', workout_exercise_id: 'we-c', set_index: 0 }),
          createSetRow({ id: 'set-c-2', workout_exercise_id: 'we-c', set_index: 1 }),
        ],
      },
    });
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails([routineA]));

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toEqual({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 1,
    });

    jest.clearAllMocks();
    mockWorkoutLiveModelQueries({
      exercises: [
        createWorkoutExerciseRow({ id: 'we-b', exercise_id: 'exercise-b', exercise_name: 'Desenvolvimento', sort_order: 0 }),
        createWorkoutExerciseRow({ id: 'we-a', exercise_id: 'exercise-a', exercise_name: 'Supino reto', sort_order: 1 }),
      ],
      setsByWorkoutExerciseId: baseSets,
    });
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails([routineA, routineB]));

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toEqual({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 2,
    });
  });

  it('suggests routine updates when structural set count or warmup changes', () => {
    mockWorkoutLiveModelQueries({
      setsByWorkoutExerciseId: {
        'we-1': [
          createSetRow({ id: 'set-1', workout_exercise_id: 'we-1', set_index: 0 }),
          createSetRow({ id: 'set-2', workout_exercise_id: 'we-1', set_index: 1 }),
          createSetRow({ id: 'set-3', workout_exercise_id: 'we-1', set_index: 2 }),
        ],
      },
    });
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails());

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toEqual({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 1,
    });

    jest.clearAllMocks();
    mockWorkoutLiveModelQueries({
      setsByWorkoutExerciseId: {
        'we-1': [
          createSetRow({ id: 'set-warmup', workout_exercise_id: 'we-1', set_index: 0, type: 'warmup' }),
          createSetRow({ id: 'set-1', workout_exercise_id: 'we-1', set_index: 1 }),
          createSetRow({ id: 'set-2', workout_exercise_id: 'we-1', set_index: 2 }),
        ],
      },
    });
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails());

    expect(getRoutineUpdateSuggestionForWorkout('workout-routine')).toEqual({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 1,
    });
  });

  it('updates the source routine from a completed workout while preserving routine metadata', () => {
    mockWorkoutLiveModelQueries({
      exercises: [
        createWorkoutExerciseRow({
          note: 'Controle',
          rest_seconds: 120,
          superset_group: 'A',
        }),
      ],
      setsByWorkoutExerciseId: {
        'we-1': [
          createSetRow({ id: 'set-warmup', workout_exercise_id: 'we-1', set_index: 0, type: 'warmup', reps: 12 }),
          createSetRow({ id: 'set-1', workout_exercise_id: 'we-1', set_index: 1, reps: 10 }),
          createSetRow({ id: 'set-2', workout_exercise_id: 'we-1', set_index: 2, reps: 8 }),
        ],
      },
    });
    (getRoutineDetails as jest.Mock).mockReturnValue(createRoutineDetails());

    expect(updateRoutineFromWorkout('workout-routine')).toBe('routine-1');

    expect(saveRoutine).toHaveBeenCalledWith(
      {
        name: 'Push Day',
        description: 'Peito e ombro',
        folderName: 'Força',
        exercises: [
          {
            exerciseId: 'exercise-1',
            targetSets: 2,
            targetRepsLabel: '8-10',
            restSeconds: 120,
            cardioDurationSeconds: null,
            cardioDistanceMeters: null,
            cardioSpeed: null,
            cardioElevation: null,
            note: 'Controle',
            privateLink: '',
            supersetGroup: 'A',
            warmupEnabled: true,
          },
        ],
      },
      'routine-1',
    );
    expect(writeAuditLog).toHaveBeenCalledWith('workout', 'workout-routine', 'routine_updated_from_workout', {
      routineId: 'routine-1',
      changedExercisesCount: 1,
    });
  });

  it('starts a workout from a saved workout and creates exercise blocks', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({ id: 'routine-1', name: 'Push Day' })
      .mockReturnValueOnce({
        weight_kg: 60,
        reps: 8,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
      })
      .mockReturnValueOnce({ id: 'draft-1' });
    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      {
        exercise_id: 'exercise-1',
        sort_order: 0,
        target_sets: 2,
        rest_seconds: 120,
        note: 'Controle',
        superset_group: '',
        warmup_enabled: 1,
      },
    ]);

    const workoutId = startRoutineWorkout('routine-1');

    expect(workoutId).toBe('entity-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workouts'),
      'entity-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'routine-1',
      'Push Day',
      'in_progress',
      'routine',
      expect.any(String),
      null,
      0,
      '',
      0,
      0,
      0,
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_exercises'),
      'entity-2',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'entity-1',
      'exercise-1',
      0,
      'Controle',
      120,
      '60 kg x 8',
      '',
    );
    expect(writeAuditLog).toHaveBeenCalledWith('workout', 'entity-1', 'started_from_routine', { routineId: 'routine-1' });
  });

  it('returns null when the saved workout cannot be found', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue(null);

    expect(startRoutineWorkout('missing-routine')).toBeNull();
  });

  it('formats previous performance from duration, distance and reps-only fallbacks when starting a saved workout', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({ id: 'routine-1', name: 'Condicionamento' })
      .mockReturnValueOnce({
        weight_kg: null,
        reps: null,
        duration_seconds: 45,
        distance_meters: 250,
        rpe: null,
      })
      .mockReturnValueOnce({
        weight_kg: null,
        reps: null,
        duration_seconds: 30,
        distance_meters: null,
        rpe: null,
      })
      .mockReturnValueOnce({
        weight_kg: null,
        reps: null,
        duration_seconds: null,
        distance_meters: 400,
        rpe: null,
      })
      .mockReturnValueOnce({
        weight_kg: null,
        reps: 20,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
      })
      .mockReturnValueOnce({ id: 'draft-1' });
    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      {
        exercise_id: 'exercise-1',
        sort_order: 0,
        target_sets: 1,
        rest_seconds: 60,
        note: null,
        superset_group: null,
        warmup_enabled: 0,
      },
      {
        exercise_id: 'exercise-2',
        sort_order: 1,
        target_sets: 1,
        rest_seconds: 60,
        note: null,
        superset_group: null,
        warmup_enabled: 0,
      },
      {
        exercise_id: 'exercise-3',
        sort_order: 2,
        target_sets: 1,
        rest_seconds: 60,
        note: null,
        superset_group: null,
        warmup_enabled: 0,
      },
      {
        exercise_id: 'exercise-4',
        sort_order: 3,
        target_sets: 1,
        rest_seconds: 60,
        note: null,
        superset_group: null,
        warmup_enabled: 0,
      },
    ]);

    startRoutineWorkout('routine-1');

    const workoutExerciseInserts = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO workout_exercises'),
    );
    expect(workoutExerciseInserts[0][16]).toBe('0m 45s · 0,25 km');
    expect(workoutExerciseInserts[1][16]).toBe('0m 30s');
    expect(workoutExerciseInserts[2][16]).toBe('0,4 km');
    expect(workoutExerciseInserts[3][16]).toBe('20 reps');
  });

  it('falls back to an empty previous performance when the saved workout history has no comparable values', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({ id: 'routine-1', name: 'Sessão técnica' })
      .mockReturnValueOnce({
        weight_kg: null,
        reps: null,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
      })
      .mockReturnValueOnce({
        title: 'Sessão técnica',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null);
    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      {
        exercise_id: 'exercise-technique',
        sort_order: 0,
        target_sets: 1,
        rest_seconds: 75,
        note: null,
        superset_group: null,
        warmup_enabled: 0,
      },
    ]);

    startRoutineWorkout('routine-1');

    const workoutExerciseInserts = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO workout_exercises'),
    );
    expect(workoutExerciseInserts[0][16]).toBe('');
  });

  it('adds exercises and sets to the current workout', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({ max_sort_order: 1 })
      .mockReturnValueOnce({ default_rest_seconds: 75 })
      .mockReturnValueOnce({ muscle_group: 'chest', equipment: 'barbell' })
      .mockReturnValueOnce({
        weight_kg: 42.5,
        reps: 10,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
      })
      .mockReturnValueOnce({
        title: 'Treino A',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 2,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ next_index: 4 });

    const workoutExerciseId = addExerciseToWorkout('workout-1', 'exercise-1');
    addSetToWorkoutExercise(workoutExerciseId);

    expect(workoutExerciseId).toBe('entity-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_exercises'),
      'entity-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'workout-1',
      'exercise-1',
      2,
      '',
      75,
      '42.5 kg x 10',
      '',
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(
        ([sql, id, , , , , , , , , , workoutExerciseId, setIndex, type]) =>
          String(sql).includes('INSERT INTO set_entries') &&
          String(id).startsWith('entity-') &&
          workoutExerciseId === 'entity-1' &&
          setIndex === 4 &&
          type === 'normal',
      ),
    ).toBe(true);
  });

  it('uses safe defaults when adding an exercise or set without saved preferences or index history', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ muscle_group: 'cardio', equipment: 'cardio_machine' })
      .mockReturnValueOnce({
        weight_kg: null,
        reps: null,
        duration_seconds: 32,
        distance_meters: 200,
        rpe: null,
      })
      .mockReturnValueOnce({
        title: 'Treino B',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 0,
      })
      .mockReturnValueOnce({ id: 'draft-2' })
      .mockReturnValueOnce(null);

    const workoutExerciseId = addExerciseToWorkout('workout-2', 'exercise-cardio');
    addSetToWorkoutExercise(workoutExerciseId);

    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_exercises'),
      'entity-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'workout-2',
      'exercise-cardio',
      0,
      '',
      0,
      '0m 32s · 0,2 km',
      '',
    );
    expect(
      (database.runSync as jest.Mock).mock.calls.some(
        ([sql, id, , , , , , , , , , nextWorkoutExerciseId, setIndex]) =>
          String(sql).includes('INSERT INTO set_entries') &&
          nextWorkoutExerciseId === 'entity-1' &&
          setIndex === 0 &&
          String(id).startsWith('entity-'),
      ),
    ).toBe(true);
  });

  it('stores an empty previous performance when a newly added exercise has only null history metrics', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({ max_sort_order: 0 })
      .mockReturnValueOnce({ default_rest_seconds: 60 })
      .mockReturnValueOnce({
        weight_kg: null,
        reps: null,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
      })
      .mockReturnValueOnce({
        title: 'Treino C',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 2,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null);

    addExerciseToWorkout('workout-3', 'exercise-null-history');

    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_exercises'),
      'entity-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'workout-3',
      'exercise-null-history',
      1,
      '',
      60,
      '',
      '',
    );
  });

  it('reapplies previous values using the matched previous row for the set type', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        exercise_id: 'exercise-1',
        workout_id: 'workout-1',
        workout_exercise_id: 'workout-exercise-1',
      })
      .mockReturnValueOnce({ id: 'previous-workout-exercise-1' })
      .mockReturnValueOnce({
        title: 'Push Day',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null);

    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'set-1',
          type: 'normal',
          reps: null,
          weight_kg: null,
          duration_seconds: null,
          distance_meters: null,
          rpe: null,
        },
      ])
      .mockReturnValueOnce([
        {
          type: 'normal',
          reps: 8,
          weight_kg: 60,
          duration_seconds: null,
          distance_meters: null,
          rpe: 8,
        },
      ]);

    const applied = applyPreviousValuesToSet('set-1');

    expect(applied).toBe(true);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE set_entries'),
      8,
      60,
      null,
      null,
      null,
      null,
      8,
      expect.any(String),
      'set-1',
    );
  });

  it('reapplies cardio-oriented previous values when weight, reps and rpe are missing', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        exercise_id: 'exercise-cardio',
        workout_id: 'workout-4',
        workout_exercise_id: 'workout-exercise-4',
      })
      .mockReturnValueOnce({ id: 'previous-workout-exercise-4' })
      .mockReturnValueOnce({
        title: 'Cardio Day',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null);

    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'set-cardio-1',
          type: 'normal',
          reps: null,
          weight_kg: null,
          duration_seconds: null,
          distance_meters: null,
          rpe: null,
        },
      ])
      .mockReturnValueOnce([
        {
          type: 'normal',
          reps: null,
          weight_kg: null,
          duration_seconds: 45,
          distance_meters: 200,
          rpe: null,
        },
      ]);

    const applied = applyPreviousValuesToSet('set-cardio-1');

    expect(applied).toBe(true);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE set_entries'),
      null,
      null,
      45,
      200,
      null,
      null,
      null,
      expect.any(String),
      'set-cardio-1',
    );
  });

  it('returns false when there is no matched previous row', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        exercise_id: 'exercise-1',
        workout_id: 'workout-1',
        workout_exercise_id: 'workout-exercise-1',
      })
      .mockReturnValueOnce(null);

    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      {
        id: 'set-1',
        type: 'failure',
        reps: null,
        weight_kg: null,
        duration_seconds: null,
        distance_meters: null,
        rpe: null,
      },
    ]);

    const applied = applyPreviousValuesToSet('set-1');

    expect(applied).toBe(false);
  });

  it('returns false when the set is not linked to a workout exercise and deletes a set with PR cleanup', () => {
    (database.getFirstSync as jest.Mock).mockReturnValueOnce(null);

    expect(applyPreviousValuesToSet('missing-set')).toBe(false);

    expect(removeSetFromWorkoutExercise('set-delete-1')).toBe(false);

    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        workout_id: 'workout-1',
        workout_exercise_id: 'workout-exercise-1',
      })
      .mockReturnValueOnce({
        title: 'Treino rápido',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 1,
      })
      .mockReturnValueOnce(null);

    expect(removeSetFromWorkoutExercise('set-delete-1')).toBe(true);
    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM pr_records WHERE set_entry_id = ?', 'set-delete-1');
    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM set_entries WHERE id = ?', 'set-delete-1');
  });

  it('undoes a completed set and removes related PRs', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        workout_id: 'workout-1',
        is_completed: 1,
      })
      .mockReturnValueOnce({
        title: 'Treino rápido',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 0,
      })
      .mockReturnValueOnce(null);

    expect(undoCompleteSetEntry('set-1')).toBe(true);
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE set_entries SET is_completed = 0, completed_at = NULL, updated_at = ? WHERE id = ?',
      expect.any(String),
      'set-1',
    );
    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM pr_records WHERE set_entry_id = ?', 'set-1');
  });

  it('returns false when undoing a missing or already-open set', () => {
    (database.getFirstSync as jest.Mock).mockReturnValueOnce(null);
    expect(undoCompleteSetEntry('missing-set')).toBe(false);

    (database.getFirstSync as jest.Mock).mockReturnValueOnce({
      workout_id: 'workout-1',
      is_completed: 0,
    });
    expect(undoCompleteSetEntry('set-open')).toBe(false);
  });

  it('persists the new exercise order', () => {
    reorderWorkoutExercises('workout-1', ['exercise-b', 'exercise-a']);

    expect(database.execSync).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(database.runSync).toHaveBeenNthCalledWith(
      1,
      'UPDATE workout_exercises SET sort_order = ?, updated_at = ? WHERE id = ? AND workout_id = ?',
      0,
      expect.any(String),
      'exercise-b',
      'workout-1',
    );
    expect(database.runSync).toHaveBeenNthCalledWith(
      2,
      'UPDATE workout_exercises SET sort_order = ?, updated_at = ? WHERE id = ? AND workout_id = ?',
      1,
      expect.any(String),
      'exercise-a',
      'workout-1',
    );
    expect(database.execSync).toHaveBeenNthCalledWith(2, 'COMMIT');
  });

  it('rolls back exercise reordering when a write fails', () => {
    (database.runSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    expect(() => reorderWorkoutExercises('workout-1', ['exercise-a'])).toThrow('write failed');
    expect(database.execSync).toHaveBeenCalledWith('ROLLBACK');
  });

  it('replaces the exercise inside the block and resets the recorded values', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        workout_id: 'workout-1',
        exercise_id: 'exercise-old',
      })
      .mockReturnValueOnce({
        weight_kg: 80,
        reps: 5,
        duration_seconds: null,
        distance_meters: null,
        rpe: 9,
      })
      .mockReturnValueOnce({
        title: 'Pull Day',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 2,
        completed_sets: 1,
      })
      .mockReturnValueOnce(null);

    const replaced = replaceWorkoutExerciseExercise('workout-exercise-1', 'exercise-new');

    expect(replaced).toBe(true);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workout_exercises'),
      'exercise-new',
      '',
      '80 kg x 5',
      expect.any(String),
      'workout-exercise-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE set_entries'),
      expect.any(String),
      'workout-exercise-1',
    );
  });

  it('returns false when replacing with the same exercise and rolls back replacement failures', () => {
    (database.getFirstSync as jest.Mock).mockReturnValueOnce({
      workout_id: 'workout-1',
      exercise_id: 'exercise-same',
    });

    expect(replaceWorkoutExerciseExercise('workout-exercise-1', 'exercise-same')).toBe(false);

    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        workout_id: 'workout-1',
        exercise_id: 'exercise-old',
      })
      .mockReturnValueOnce(null);
    (database.runSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('replace failed');
    });

    expect(() => replaceWorkoutExerciseExercise('workout-exercise-1', 'exercise-next')).toThrow('replace failed');
    expect(database.execSync).toHaveBeenCalledWith('ROLLBACK');
  });

  it('updates set fields and notes directly', () => {
    updateSetEntry({ setId: 'set-1', field: 'reps', value: 10 });
    updateWorkoutExerciseNote('workout-exercise-1', 'Controle');
    updateWorkoutNote('workout-1', 'Treino forte');

    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE set_entries SET reps = ?, updated_at = ? WHERE id = ?',
      10,
      expect.any(String),
      'set-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE workout_exercises SET note = ?, updated_at = ? WHERE id = ?',
      'Controle',
      expect.any(String),
      'workout-exercise-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE workouts SET general_note = ?, updated_at = ? WHERE id = ?',
      'Treino forte',
      expect.any(String),
      'workout-1',
    );
  });

  it('updates live set fields together and touches the in-progress workout snapshot', () => {
    updateSetEntryFields({
      setId: 'set-1',
      values: {
        weight_kg: 72.5,
        reps: 8,
      },
    });

    expect(database.execSync).toHaveBeenCalledWith('BEGIN');
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE set_entries SET reps = ?, weight_kg = ?, updated_at = ? WHERE id = ?',
      8,
      72.5,
      expect.any(String),
      'set-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workout_draft_snapshots SET updated_at = ?'),
      expect.any(String),
      'set-1',
    );
    expect(database.execSync).toHaveBeenCalledWith('COMMIT');
  });

  it('touches the in-progress workout snapshot when live notes change', () => {
    updateWorkoutExerciseNote('workout-exercise-1', 'Controle novo');
    updateWorkoutNote('workout-1', 'Treino forte');

    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workout_draft_snapshots SET updated_at = ?'),
      expect.any(String),
      'workout-exercise-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE workout_draft_snapshots SET updated_at = ? WHERE workout_id = ?',
      expect.any(String),
      'workout-1',
    );
  });

  it('completes a set with default fallbacks when rows are missing', () => {
    (database.getFirstSync as jest.Mock).mockReturnValueOnce(null);

    expect(completeSetEntry('missing-set')).toEqual({ restSeconds: 90, prMessage: null });

    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'set-1',
        workout_exercise_id: 'workout-exercise-1',
        reps: 8,
        weight_kg: 60,
        duration_seconds: null,
        distance_meters: null,
      })
      .mockReturnValueOnce(null);

    expect(completeSetEntry('set-1')).toEqual({ restSeconds: 90, prMessage: null });
  });

  it('completes a set without creating PRs when all values are zero or below the current record', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'set-1',
        workout_exercise_id: 'workout-exercise-1',
        reps: 0,
        weight_kg: 0,
        duration_seconds: 0,
        distance_meters: 0,
      })
      .mockReturnValueOnce({
        id: 'workout-exercise-1',
        exercise_id: 'exercise-1',
        workout_id: 'workout-1',
        rest_seconds: 75,
      })
      .mockReturnValueOnce({
        title: 'Treino A',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 1,
      })
      .mockReturnValueOnce(null);

    expect(completeSetEntry('set-1')).toEqual({ restSeconds: 75, prMessage: null });
    expect(
      (database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO pr_records')),
    ).toBe(false);
  });

  it('returns a generic PR message when the exercise name is unavailable', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'set-1',
        workout_exercise_id: 'workout-exercise-1',
        reps: 5,
        weight_kg: 40,
        duration_seconds: null,
        distance_meters: null,
      })
      .mockReturnValueOnce({
        id: 'workout-exercise-1',
        exercise_id: 'exercise-1',
        workout_id: 'workout-1',
        rest_seconds: 60,
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ value: 100 })
      .mockReturnValueOnce({ value: 100 })
      .mockReturnValueOnce({ value: 100 })
      .mockReturnValueOnce({ value: 100 })
      .mockReturnValueOnce({
        title: 'Treino A',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 1,
      })
      .mockReturnValueOnce(null);

    expect(completeSetEntry('set-1')).toEqual({
      restSeconds: 60,
      prMessage: 'Novos recordes: carga(40 kg), 1RM(46.7 kg) e volume(200 kg)',
    });
  });

  it('completes a set, stores PRs and returns the rest timer', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'set-1',
        workout_exercise_id: 'workout-exercise-1',
        reps: 8,
        weight_kg: 60,
        duration_seconds: 45,
        distance_meters: 100,
      })
      .mockReturnValueOnce({
        id: 'workout-exercise-1',
        exercise_id: 'exercise-1',
        workout_id: 'workout-1',
        rest_seconds: 90,
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ name: 'Supino reto' })
      .mockReturnValueOnce({
        title: 'Treino A',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 1,
      })
      .mockReturnValueOnce(null);

    const result = completeSetEntry('set-1');

    expect(result).toEqual({
      restSeconds: 90,
      prMessage: 'Supino reto: carga(60 kg), 1RM(76 kg), repetições(8), duração(0m 45s), distância(0,1 km) e volume(480 kg)',
    });
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE set_entries SET is_completed = 1, completed_at = ?, updated_at = ? WHERE id = ?',
      expect.any(String),
      expect.any(String),
      'set-1',
    );
  });

  it('completes cardio-focused sets and records duration and distance PRs when weight and reps are missing', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'set-cardio-1',
        workout_exercise_id: 'workout-exercise-cardio-1',
        reps: null,
        weight_kg: null,
        duration_seconds: 45,
        distance_meters: 1200,
      })
      .mockReturnValueOnce({
        id: 'workout-exercise-cardio-1',
        exercise_id: 'exercise-cardio',
        workout_id: 'workout-cardio-1',
        rest_seconds: 45,
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ name: 'Corrida' })
      .mockReturnValueOnce({
        title: 'Cardio Day',
        started_at: '2026-03-25T10:00:00.000Z',
        exercises_count: 1,
        completed_sets: 1,
      })
      .mockReturnValueOnce(null);

    const result = completeSetEntry('set-cardio-1');

    expect(result).toEqual({ restSeconds: 45, prMessage: 'Corrida: duração(0m 45s) e distância(1,2 km)' });
    const prInsertCalls = (database.runSync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO pr_records'),
    );
    expect(prInsertCalls.some((call) => call[14] === 'pr' && call[15] === 'best_duration')).toBe(true);
    expect(prInsertCalls.some((call) => call[14] === 'pr' && call[15] === 'best_distance')).toBe(true);
  });

  it('maps PR records and the live workout model', () => {
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'pr-1',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          exercise_id: 'exercise-1',
          workout_id: 'workout-1',
          set_entry_id: 'set-1',
          record_type: 'pr',
          metric: 'heaviest_weight',
          value: 80,
          achieved_at: '2026-03-25T10:10:00.000Z',
          exercise_name: 'Supino reto',
        },
      ])
      .mockReturnValueOnce([
        {
          id: 'workout-exercise-1',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_id: 'workout-1',
          exercise_id: 'exercise-1',
          sort_order: 0,
          note: 'Nota',
          rest_seconds: 90,
          previous_performance: '60 kg x 8',
          superset_group: '',
          exercise_name: 'Supino reto',
          muscle_group: 'chest',
          equipment: 'machine',
          modality: 'strength',
          secondary_muscles_json: '[]',
          is_custom: 0,
          instructions: 'Controle',
        },
      ])
      .mockReturnValueOnce([
        {
          type: 'normal',
          reps: 8,
          weight_kg: 60,
          duration_seconds: null,
          distance_meters: null,
          speed: null,
          elevation: null,
          rpe: 8,
        },
      ])
      .mockReturnValueOnce([
        {
          id: 'set-1',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_exercise_id: 'workout-exercise-1',
          set_index: 0,
          type: 'normal',
          reps: 8,
          weight_kg: 60,
          duration_seconds: null,
          distance_meters: null,
          rpe: 8,
          completed_at: null,
          is_completed: 0,
        },
      ]);
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'workout-1',
        created_at: '2026-03-25T10:00:00.000Z',
        updated_at: '2026-03-25T10:00:00.000Z',
        deleted_at: null,
        version: 1,
        schema_version: 3,
        remote_id: null,
        sync_state: 'local_only',
        last_exported_at: null,
        origin_device_id: 'device-1',
        routine_id: null,
        title: 'Treino A',
        status: 'completed',
        source: 'empty',
        started_at: '2026-03-25T10:00:00.000Z',
        ended_at: '2026-03-25T10:30:00.000Z',
        duration_seconds: 1800,
        general_note: 'Boa sessão',
        total_volume: 1200,
        total_reps: 30,
        total_distance_meters: 0,
      })
      .mockReturnValueOnce({
        weight_kg: 60,
        reps: 8,
        duration_seconds: null,
        distance_meters: null,
        rpe: 8,
      })
      .mockReturnValueOnce({ id: 'previous-workout-exercise-1' });

    expect(listWorkoutPrs('workout-1')).toHaveLength(1);
    const model = getWorkoutLiveModel('workout-1');
    expect(model?.workout.title).toBe('Treino A');
    expect(model?.exercises[0].exercise.name).toBe('Supino reto');
    expect(model?.exercises[0].sets[0].seriesLabel).toBe('1');
    expect(model?.exercises[0].sets[0].previousMatchLabel).toBe('60 kg x 8');
  });

  it('returns null when the live workout model cannot find the workout', () => {
    (database.getFirstSync as jest.Mock).mockReturnValueOnce(null);

    expect(getWorkoutLiveModel('missing-workout')).toBeNull();
  });

  it('falls back to an empty secondary muscle list when the exercise row omits that field', () => {
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'workout-exercise-2',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_id: 'workout-2',
          exercise_id: 'exercise-2',
          sort_order: 0,
          note: '',
          rest_seconds: 60,
          previous_performance: '',
          superset_group: '',
          exercise_name: 'Bike',
          muscle_group: 'legs',
          equipment: 'bike',
          modality: 'cardio',
          secondary_muscles_json: null,
          is_custom: 0,
          instructions: 'Pedale com constância',
        },
      ])
      .mockReturnValueOnce([
        {
          id: 'set-2',
          created_at: '2026-03-25T10:00:00.000Z',
          updated_at: '2026-03-25T10:00:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          workout_exercise_id: 'workout-exercise-2',
          set_index: 0,
          type: 'normal',
          reps: null,
          weight_kg: null,
          duration_seconds: 60,
          distance_meters: 500,
          rpe: null,
          completed_at: null,
          is_completed: 0,
        },
      ]);
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'workout-2',
        created_at: '2026-03-25T10:00:00.000Z',
        updated_at: '2026-03-25T10:00:00.000Z',
        deleted_at: null,
        version: 1,
        schema_version: 3,
        remote_id: null,
        sync_state: 'local_only',
        last_exported_at: null,
        origin_device_id: 'device-1',
        routine_id: null,
        title: 'Cardio',
        status: 'in_progress',
        source: 'empty',
        started_at: '2026-03-25T10:00:00.000Z',
        ended_at: null,
        duration_seconds: 0,
        general_note: '',
        total_volume: 0,
        total_reps: 0,
        total_distance_meters: 0,
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);

    const model = getWorkoutLiveModel('workout-2');

    expect(model?.exercises[0].exercise.secondaryMuscles).toEqual([]);
  });

  it('finishes and discards workouts', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        total_volume: 1200,
        total_reps: 30,
        total_distance_meters: 0,
        total_cardio_duration_seconds: 0,
        started_at: '2026-03-25T10:00:00.000Z',
      })
      .mockReturnValueOnce({
        exercise_id: 'exercise-1',
        workouts_count: 2,
        sets_count: 5,
        total_volume: 2400,
        total_reps: 30,
        best_weight: 80,
        best_estimated_1rm: 96,
      })
      .mockReturnValueOnce(null);
    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      {
        exercise_id: 'exercise-1',
        workouts_count: 2,
        sets_count: 5,
        total_volume: 2400,
        total_reps: 30,
        best_weight: 80,
        best_estimated_1rm: 96,
      },
    ]);

    finishWorkout('workout-1');
    discardWorkout('workout-2');

    expect(refreshAnalyticsCaches).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith('workout', 'workout-1', 'finished', {});
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE workouts SET status = ?, updated_at = ? WHERE id = ?',
      'discarded',
      expect.any(String),
      'workout-2',
    );
  });

  it('finishes workouts even when aggregates are missing and creates snapshots when none exist', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);
    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      {
        exercise_id: 'exercise-1',
        workouts_count: 1,
        sets_count: 3,
        total_volume: 800,
        total_reps: 24,
        best_weight: 40,
        best_estimated_1rm: 48,
      },
    ]);

    finishWorkout('workout-3');

    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exercise_history_snapshots'),
      'entity-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'exercise-1',
      'all_time',
      1,
      3,
      800,
      24,
      40,
      48,
    );
    expect(refreshAnalyticsCaches).toHaveBeenCalledTimes(1);
  });

  it('uses the summed cardio duration when it is longer than the real elapsed time', () => {
    (database.getFirstSync as jest.Mock).mockReset().mockReturnValueOnce({
      total_volume: 0,
      total_reps: 0,
      total_distance_meters: 0,
      total_cardio_duration_seconds: 1800,
      started_at: '2999-01-01T10:00:00.000Z',
    });
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([]);
    (database.runSync as jest.Mock).mockReset();

    finishWorkout('workout-cardio-1');

    const workoutUpdateCall = (database.runSync as jest.Mock).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE workouts'),
    );

    expect(workoutUpdateCall?.[3]).toBe(1800);
  });

  it('keeps the real elapsed time when it is longer than the cardio duration', () => {
    (database.getFirstSync as jest.Mock).mockReset().mockReturnValueOnce({
      total_volume: 0,
      total_reps: 0,
      total_distance_meters: 0,
      total_cardio_duration_seconds: 600,
      started_at: '2000-01-01T10:00:00.000Z',
    });
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([]);
    (database.runSync as jest.Mock).mockReset();

    finishWorkout('workout-cardio-2');

    const workoutUpdateCall = (database.runSync as jest.Mock).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE workouts'),
    );

    expect(Number(workoutUpdateCall?.[3] ?? 0)).toBeGreaterThan(600);
  });

  it('refinalizes completed workouts with the current elapsed duration and rebuilds derived data', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:22:00.000Z'));
    (database.getFirstSync as jest.Mock).mockReset().mockReturnValueOnce({
      status: 'completed',
      total_volume: 1500,
      total_reps: 36,
      total_distance_meters: 0,
      total_cardio_duration_seconds: 0,
      started_at: '2026-03-25T10:00:00.000Z',
    });
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([]);
    (database.runSync as jest.Mock).mockReset();

    finishWorkout('workout-1');

    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workouts'),
      'completed',
      '2026-03-25T10:22:00.000Z',
      1320,
      1500,
      36,
      0,
      '2026-03-25T10:22:00.000Z',
      'workout-1',
    );
    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM pr_records');
    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM exercise_history_snapshots');
    expect(refreshAnalyticsCaches).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('lists completed workout history ordered by session with exercise summaries', () => {
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'workout-1',
          title: 'Treino rápido',
          source: 'empty',
          started_at: '2026-04-20T10:00:00.000Z',
          duration_seconds: 1800,
          total_volume: 1200,
        },
      ])
      .mockReturnValueOnce([
        {
          workout_id: 'workout-1',
          workout_exercise_id: 'we-1',
          exercise_id: 'exercise-1',
          exercise_name: 'Supino reto',
          muscle_group: 'chest',
          duration_seconds: null,
          sets_count: 3,
          sort_order: 0,
        },
        {
          workout_id: 'workout-1',
          workout_exercise_id: 'we-unchecked',
          exercise_id: 'exercise-unchecked',
          exercise_name: 'Tríceps mergulho nas paralelas',
          muscle_group: 'triceps',
          duration_seconds: null,
          sets_count: 0,
          sort_order: 1,
        },
      ]);

    expect(
      listCompletedWorkoutsHistory({
        limit: 5,
        offset: 0,
        dateFrom: '2026-04-01',
        dateTo: '2026-04-20',
      }),
    ).toEqual([
      {
        id: 'workout-1',
        title: 'Treino rápido',
        source: 'empty',
        startedAt: '2026-04-20T10:00:00.000Z',
        durationSeconds: 1800,
        totalVolume: 1200,
        exercises: [
          {
            workoutExerciseId: 'we-1',
            exerciseId: 'exercise-1',
            exerciseName: 'Supino reto',
            muscleGroup: 'chest',
            durationSeconds: null,
            setsCount: 3,
          },
        ],
      },
    ]);
    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).toContain('se.is_completed = 1');
    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).toContain('HAVING COUNT(se.id) > 0');
  });

  it('lists completed workout history ids ordered by the profile history period', () => {
    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      { id: 'workout-newer' },
      { id: 'workout-older' },
    ]);

    expect(
      listCompletedWorkoutHistoryIds({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-20',
      }),
    ).toEqual(['workout-newer', 'workout-older']);
    expect(database.getAllSync).toHaveBeenCalledWith(
      expect.stringContaining('SUBSTR(w.started_at, 1, 10) BETWEEN ? AND ?'),
      '2026-04-01',
      '2026-04-20',
    );
    expect((database.getAllSync as jest.Mock).mock.calls[0][0]).toContain('ORDER BY w.started_at DESC');
  });

  it('returns cardio exercises in history with summed duration for the profile summary', () => {
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'workout-cardio',
          title: 'Treino rápido',
          source: 'empty',
          started_at: '2026-04-20T10:00:00.000Z',
          duration_seconds: 1800,
          total_volume: 0,
        },
      ])
      .mockReturnValueOnce([
        {
          workout_id: 'workout-cardio',
          workout_exercise_id: 'we-cardio-1',
          exercise_id: 'exercise-cardio-1',
          exercise_name: 'Corrida na esteira',
          muscle_group: 'cardio',
          duration_seconds: 1800,
          sets_count: 1,
          sort_order: 0,
        },
        {
          workout_id: 'workout-cardio',
          workout_exercise_id: 'we-cardio-unchecked',
          exercise_id: 'exercise-cardio-unchecked',
          exercise_name: 'Bike solta',
          muscle_group: 'cardio',
          duration_seconds: 900,
          sets_count: 0,
          sort_order: 1,
        },
      ]);

    expect(
      listCompletedWorkoutsHistory({
        limit: 5,
        offset: 0,
      }),
    ).toEqual([
      {
        id: 'workout-cardio',
        title: 'Treino rápido',
        source: 'empty',
        startedAt: '2026-04-20T10:00:00.000Z',
        durationSeconds: 1800,
        totalVolume: 0,
        exercises: [
          {
            workoutExerciseId: 'we-cardio-1',
            exerciseId: 'exercise-cardio-1',
            exerciseName: 'Corrida na esteira',
            muscleGroup: 'cardio',
            durationSeconds: 1800,
            setsCount: 1,
          },
        ],
      },
    ]);

    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).toContain('SUM(se.duration_seconds) AS duration_seconds');
    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).toContain('se.is_completed = 1');
    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).toContain('HAVING COUNT(se.id) > 0');
    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).toContain('e.muscle_group');
  });

  it('uses only completed cardio sets when recalculating completed workout duration', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:22:00.000Z'));
    (database.getFirstSync as jest.Mock).mockReset().mockReturnValueOnce({
      status: 'completed',
      total_volume: 0,
      total_reps: 0,
      total_distance_meters: 0,
      total_cardio_duration_seconds: 2700,
      started_at: '2026-03-25T10:00:00.000Z',
    });
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([]);
    (database.runSync as jest.Mock).mockReset();

    finishWorkout('workout-cardio');

    expect((database.getFirstSync as jest.Mock).mock.calls[0][0]).toContain('se_cardio.is_completed = 1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workouts'),
      'completed',
      '2026-03-25T10:22:00.000Z',
      2700,
      0,
      0,
      0,
      '2026-03-25T10:22:00.000Z',
      'workout-cardio',
    );
    jest.useRealTimers();
  });

  it('persists edited workout history title, date and duration', () => {
    (database.getFirstSync as jest.Mock).mockReset().mockReturnValue({
      id: 'workout-1',
      status: 'completed',
      deleted_at: null,
    });
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([{ id: 'workout-exercise-old' }]);
    (database.runSync as jest.Mock).mockReset();
    (database.execSync as jest.Mock).mockReset();
    (writeAuditLog as jest.Mock).mockReset();

    saveCompletedWorkoutHistoryEdit('workout-1', {
      workout: {
        id: 'workout-1',
        title: 'Treino revisado',
        source: 'empty',
        status: 'completed',
        startedAt: '2026-03-24T10:00:00.000Z',
        endedAt: '2026-03-24T11:15:00.000Z',
        durationSeconds: 4500,
        generalNote: '',
      },
      exercises: [
        {
          workoutExercise: {
            id: 'draft-we-1',
            note: 'Controle total',
            restSeconds: 90,
            supersetGroup: null,
          },
          exercise: {
            id: 'exercise-1',
            name: 'Supino reto',
            muscleGroup: 'chest',
          },
          previousPerformance: '',
          previousValues: null,
          sets: [
            {
              id: 'draft-set-1',
              type: 'normal',
              reps: 10,
              weightKg: 50,
              durationSeconds: null,
              distanceMeters: null,
              rpe: null,
              isCompleted: true,
              completedAt: null,
            },
          ],
        },
      ],
    } as any);

    const workoutUpdateCall = (database.runSync as jest.Mock).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE workouts'),
    );

    expect(workoutUpdateCall).toEqual([
      expect.stringContaining('duration_seconds = ?'),
      'Treino revisado',
      '',
      500,
      10,
      0,
      '2026-03-24T10:00:00.000Z',
      4500,
      '2026-03-24T11:15:00.000Z',
      expect.any(String),
      'workout-1',
    ]);
    expect(workoutUpdateCall?.[0]).toContain('started_at = ?');
    expect(writeAuditLog).toHaveBeenCalledWith('workout', 'workout-1', 'history_edited', {
      exerciseCount: 1,
    });
  });

  it('recalculates the saved session duration from cardio sets in 100% cardio history edits', () => {
    (database.getFirstSync as jest.Mock).mockReset().mockReturnValue({
      id: 'workout-cardio-1',
      status: 'completed',
      deleted_at: null,
    });
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([{ id: 'workout-exercise-old' }]);
    (database.runSync as jest.Mock).mockReset();
    (database.execSync as jest.Mock).mockReset();
    (writeAuditLog as jest.Mock).mockReset();

    saveCompletedWorkoutHistoryEdit('workout-cardio-1', {
      workout: {
        id: 'workout-cardio-1',
        title: 'Cardio revisado',
        source: 'empty',
        status: 'completed',
        startedAt: '2026-03-25T10:00:00.000Z',
        endedAt: '2026-03-25T10:10:00.000Z',
        durationSeconds: 600,
        generalNote: '',
      },
      exercises: [
        {
          workoutExercise: {
            id: 'draft-we-cardio-1',
            note: '',
            restSeconds: 0,
            supersetGroup: null,
          },
          exercise: {
            id: 'exercise-cardio-1',
            name: 'Corrida na esteira',
            muscleGroup: 'cardio',
            equipment: 'cardio_machine',
          },
          previousPerformance: '',
          previousValues: null,
          sets: [
            {
              id: 'draft-set-cardio-1',
              type: 'normal',
              reps: null,
              weightKg: null,
              durationSeconds: 2700,
              distanceMeters: 7800,
              speed: 12,
              elevation: 6,
              rpe: null,
              isCompleted: true,
              completedAt: null,
            },
          ],
        },
      ],
    } as any);

    const workoutUpdateCall = (database.runSync as jest.Mock).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE workouts'),
    );

    expect(workoutUpdateCall).toEqual([
      expect.stringContaining('duration_seconds = ?'),
      'Cardio revisado',
      '',
      0,
      0,
      7800,
      '2026-03-25T10:00:00.000Z',
      2700,
      '2026-03-25T10:45:00.000Z',
      expect.any(String),
      'workout-cardio-1',
    ]);
  });

  it('updates the session meta of a completed workout and preserves the start time when changing the date', () => {
    (database.getFirstSync as jest.Mock).mockReset().mockReturnValueOnce({
      id: 'workout-1',
      title: 'Treino rápido',
      status: 'completed',
      deleted_at: null,
      started_at: '2026-03-25T10:00:00.000Z',
      ended_at: '2026-03-25T10:20:00.000Z',
      duration_seconds: 1200,
    });
    (database.runSync as jest.Mock).mockReset();
    (database.execSync as jest.Mock).mockReset();
    (database.getAllSync as jest.Mock).mockReset().mockReturnValue([]);
    (writeAuditLog as jest.Mock).mockReset();

    updateCompletedWorkoutSessionMeta('workout-1', {
      title: 'Treino revisado',
      startedAt: '2026-03-24T10:00:00.000Z',
      durationSeconds: 5400,
    });

    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE workouts'),
      'Treino revisado',
      '2026-03-24T10:00:00.000Z',
      5400,
      '2026-03-24T11:30:00.000Z',
      expect.any(String),
      'workout-1',
    );
    expect(writeAuditLog).toHaveBeenCalledWith('workout', 'workout-1', 'session_meta_updated', {
      title: 'Treino revisado',
      startedAt: '2026-03-24T10:00:00.000Z',
      durationSeconds: 5400,
    });
  });

});
