jest.mock('@/src/shared/db/database', () => ({
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
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  },
  mapExerciseRow: jest.fn((row) => row),
  writeAuditLog: jest.fn(),
}));

import {
  deleteCustomExercise,
  getExerciseById,
  getExerciseHistory,
  getCustomExerciseUsage,
  listExercises,
  listCustomExercises,
  saveCustomExercise,
} from '@/src/modules/exercises/service';
import { database, writeAuditLog } from '@/src/shared/db/database';

describe('exercises service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists exercises using the mapped rows', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'exercise-1',
        name: 'Supino reto',
        slug: 'supino-reto',
        muscleGroup: 'chest',
        equipment: 'barbell',
      },
    ]);

    expect(listExercises({ search: 'Supino' })).toEqual([
      expect.objectContaining({
        id: 'exercise-1',
        name: 'Supino reto',
      }),
    ]);
  });

  it('creates a custom exercise with a unique slug', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({ id: 'existing-slug' })
      .mockReturnValueOnce(null);

    const exerciseId = saveCustomExercise({
      name: 'Rosca direta',
      muscleGroup: 'biceps',
      secondaryMuscles: [],
      equipment: 'barbell',
      modality: 'strength',
      instructions: '',
    });

    expect(exerciseId).toBe('entity-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exercises'),
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
      'rosca-direta-2',
      'Rosca direta',
      'biceps',
      '[]',
      'barbell',
      'strength',
      1,
      'Exercício personalizado criado neste aparelho.',
    );
    expect(String((database.runSync as jest.Mock).mock.calls[0][0])).not.toContain('is_archived');
    expect(writeAuditLog).toHaveBeenCalledWith('exercise', 'entity-1', 'custom_created', expect.any(Object));
  });

  it('reads custom exercise usage across workouts, routines, records and snapshots', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM workout_exercises')) {
        return { count: 2 };
      }
      if (sql.includes('FROM routine_exercises')) {
        return { count: 1 };
      }
      if (sql.includes('FROM pr_records')) {
        return { count: 3 };
      }
      if (sql.includes('FROM exercise_history_snapshots')) {
        return { count: 4 };
      }

      return { count: 0 };
    });

    expect(getCustomExerciseUsage('exercise-1')).toEqual({
      workoutExercises: 2,
      routineExercises: 1,
      prRecords: 3,
      historySnapshots: 4,
      total: 10,
    });
  });

  it('physically deletes unused custom exercises', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT * FROM exercises WHERE id = ?') {
        return { id: 'exercise-1', isCustom: true };
      }

      return { count: 0 };
    });

    expect(deleteCustomExercise('exercise-1')).toEqual(
      expect.objectContaining({
        mode: 'physical',
        usage: expect.objectContaining({ total: 0 }),
      }),
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'DELETE FROM exercises WHERE id = ? AND is_custom = 1',
      'exercise-1',
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      'exercise',
      'exercise-1',
      'custom_deleted_physical',
      expect.objectContaining({ usage: expect.objectContaining({ total: 0 }) }),
    );
  });

  it.each([
    ['workout_exercises'],
    ['routine_exercises'],
    ['pr_records'],
    ['exercise_history_snapshots'],
  ])('logically deletes custom exercises with usage in %s', (tableName) => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql === 'SELECT * FROM exercises WHERE id = ?') {
        return { id: 'exercise-1', isCustom: true };
      }
      if (sql.includes(`FROM ${tableName}`)) {
        return { count: 1 };
      }

      return { count: 0 };
    });

    expect(deleteCustomExercise('exercise-1')).toEqual(
      expect.objectContaining({
        mode: 'logical',
        usage: expect.objectContaining({ total: 1 }),
      }),
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ?',
      expect.any(String),
      expect.any(String),
      'exercise-1',
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      'exercise',
      'exercise-1',
      'custom_deleted_logical',
      expect.objectContaining({ usage: expect.objectContaining({ total: 1 }) }),
    );
  });

  it('supports listing custom exercises and filtering by search, muscle and equipment without archive filters', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([]);

    listCustomExercises();
    listExercises({
      search: 'Supino',
      muscleGroup: 'chest',
      equipment: 'barbell',
      onlyCustom: true,
    });

    expect(database.getAllSync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('is_custom = 1'),
    );
    expect(database.getAllSync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('muscle_group = ?'),
      'chest',
      'barbell',
    );
    expect((database.getAllSync as jest.Mock).mock.calls[0][0]).not.toContain('is_archived');
    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).not.toContain('is_archived');
  });

  it('filters exercises by plate equipment', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'exercise-plate-1',
        name: 'Pinça com anilhas',
        slug: 'plate-pinch-hold',
        muscleGroup: 'forearms',
        equipment: 'plate',
      },
    ]);

    listExercises({
      equipment: 'plate',
    });

    expect(database.getAllSync).toHaveBeenCalledWith(expect.stringContaining('equipment = ?'), 'plate');
  });

  it('matches exercise search without accent sensitivity', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'exercise-1',
        name: 'Tríceps corda',
        slug: 'triceps-corda',
        muscleGroup: 'triceps',
        equipment: 'cable',
      },
      {
        id: 'exercise-2',
        name: 'Supino reto',
        slug: 'supino-reto',
        muscleGroup: 'chest',
        equipment: 'barbell',
      },
    ]);

    expect(listExercises({ search: 'Triceps' })).toEqual([
      expect.objectContaining({
        id: 'exercise-1',
        name: 'Tríceps corda',
      }),
    ]);
  });

  it('prioritizes visible exercise name matches before slug matches when searching', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'exercise-crucifixo-standing',
        name: 'Crucifixo reto em pé na polia',
        slug: 'standing-cable-fly',
        muscleGroup: 'chest',
        equipment: 'cable',
        isCustom: false,
      },
      {
        id: 'exercise-crucifixo-cable',
        name: 'Crucifixo reto na polia',
        slug: 'cable-fly',
        muscleGroup: 'chest',
        equipment: 'cable',
        isCustom: false,
      },
      {
        id: 'exercise-fly',
        name: 'Fly',
        slug: 'pec-deck-fly',
        muscleGroup: 'chest',
        equipment: 'machine',
        isCustom: false,
      },
      {
        id: 'exercise-fly-invertido',
        name: 'Fly invertido',
        slug: 'rear-delt-fly',
        muscleGroup: 'shoulders',
        equipment: 'dumbbell',
        isCustom: false,
      },
    ]);

    expect(listExercises({ search: 'Fly' }).map((exercise) => exercise.id)).toEqual([
      'exercise-fly',
      'exercise-fly-invertido',
      'exercise-crucifixo-standing',
      'exercise-crucifixo-cable',
    ]);
  });

  it('applies display limits after ranking visible name matches above slug matches', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'exercise-crucifixo-standing',
        name: 'Crucifixo reto em pé na polia',
        slug: 'standing-cable-fly',
        muscleGroup: 'chest',
        equipment: 'cable',
        isCustom: false,
      },
      {
        id: 'exercise-crucifixo-cable',
        name: 'Crucifixo reto na polia',
        slug: 'cable-fly',
        muscleGroup: 'chest',
        equipment: 'cable',
        isCustom: false,
      },
      {
        id: 'exercise-fly',
        name: 'Fly',
        slug: 'pec-deck-fly',
        muscleGroup: 'chest',
        equipment: 'machine',
        isCustom: false,
      },
      {
        id: 'exercise-fly-invertido',
        name: 'Fly invertido',
        slug: 'rear-delt-fly',
        muscleGroup: 'shoulders',
        equipment: 'dumbbell',
        isCustom: false,
      },
    ]);

    expect(listExercises({ search: 'fly', limit: 2 }).map((exercise) => exercise.id)).toEqual([
      'exercise-fly',
      'exercise-fly-invertido',
    ]);
  });

  it('keeps accent-insensitive visible name ranking ahead of slug-only matches', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'exercise-slug-only',
        name: 'Extensão na polia',
        slug: 'triceps-pushdown',
        muscleGroup: 'triceps',
        equipment: 'cable',
        isCustom: false,
      },
      {
        id: 'exercise-name-match',
        name: 'Tríceps corda',
        slug: 'rope-pushdown',
        muscleGroup: 'triceps',
        equipment: 'cable',
        isCustom: false,
      },
    ]);

    expect(listExercises({ search: 'TRICEPS' }).map((exercise) => exercise.id)).toEqual([
      'exercise-name-match',
      'exercise-slug-only',
    ]);
  });

  it('searches the complete local exercise list before applying display limits', () => {
    const rows = Array.from({ length: 205 }, (_, index) => ({
      id: `exercise-${index + 1}`,
      name: `Exercício comum ${index + 1}`,
      slug: `common-exercise-${index + 1}`,
      muscleGroup: 'chest',
      equipment: 'barbell',
      isCustom: false,
    }));
    rows[200] = {
      ...rows[200],
      id: 'exercise-target',
      name: 'Supino inclinado raro',
      slug: 'rare-incline-bench-press',
    };
    (database.getAllSync as jest.Mock).mockReturnValue(rows);

    expect(listExercises({ search: 'inclinado raro', limit: 20 })).toEqual([
      expect.objectContaining({
        id: 'exercise-target',
        name: 'Supino inclinado raro',
      }),
    ]);
    expect((database.getAllSync as jest.Mock).mock.calls[0][0]).not.toMatch(/\bLIMIT\s+180\b/i);
  });

  it('applies offset and limit only after filtering by any part of the visible name', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'exercise-1',
        name: 'Puxada alta aberta',
        slug: 'wide-grip-lat-pulldown',
        muscleGroup: 'back',
        equipment: 'cable',
        isCustom: false,
      },
      {
        id: 'exercise-2',
        name: 'Remada alta com halteres',
        slug: 'dumbbell-upright-row',
        muscleGroup: 'shoulders',
        equipment: 'dumbbell',
        isCustom: true,
      },
      {
        id: 'exercise-3',
        name: 'Elevação alta no cabo',
        slug: 'cable-high-raise',
        muscleGroup: 'shoulders',
        equipment: 'cable',
        isCustom: false,
      },
    ]);

    expect(listExercises({ search: 'ALTA', offset: 1, limit: 1 })).toEqual([
      expect.objectContaining({
        id: 'exercise-2',
        isCustom: true,
        name: 'Remada alta com halteres',
      }),
    ]);
  });

  it('reads exercise details and history and returns null for unknown ids', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'exercise-1',
        name: 'Supino reto',
        isCustom: false,
      })
      .mockReturnValueOnce(null);
    (database.getAllSync as jest.Mock).mockReturnValueOnce([
      {
        started_at: '2026-03-27T10:00:00.000Z',
        total_volume: 1200,
        total_reps: 32,
        best_weight: 80,
        best_estimated_1rm: 96,
      },
    ]);

    expect(getExerciseById('exercise-1')).toEqual(
      expect.objectContaining({
        id: 'exercise-1',
        name: 'Supino reto',
      }),
    );
    expect(getExerciseById('missing-exercise')).toBeNull();
    expect(getExerciseHistory('exercise-1')).toEqual([
      expect.objectContaining({
        total_volume: 1200,
        best_weight: 80,
      }),
    ]);
  });

  it('updates custom exercises and rejects non-custom edit/delete attempts', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({ id: 'exercise-1' })
      .mockReturnValueOnce({ id: 'exercise-1', isCustom: true });

    const updatedId = saveCustomExercise(
      {
        name: 'Rosca direta',
        muscleGroup: 'biceps',
        secondaryMuscles: ['forearms'],
        equipment: 'barbell',
        modality: 'strength',
        instructions: '',
      },
      'exercise-1',
    );

    expect(updatedId).toBe('exercise-1');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE exercises'),
      'rosca-direta',
      'Rosca direta',
      'biceps',
      '["forearms"]',
      'barbell',
      'strength',
      'Exercício personalizado criado neste aparelho.',
      expect.any(String),
      'exercise-1',
    );

    (database.getFirstSync as jest.Mock).mockReturnValue({ id: 'exercise-2', isCustom: false });

    expect(() =>
      saveCustomExercise(
        {
          name: 'Rosca martelo',
          muscleGroup: 'biceps',
          secondaryMuscles: [],
          equipment: 'dumbbell',
          modality: 'strength',
          instructions: '...',
        },
        'exercise-2',
      ),
    ).toThrow('Somente exercícios personalizados podem ser editados.');
    expect(() => deleteCustomExercise('exercise-2')).toThrow('Somente exercícios personalizados podem ser excluídos.');
  });
});
