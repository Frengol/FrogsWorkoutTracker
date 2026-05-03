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
  archiveCustomExercise,
  getExerciseById,
  getExerciseHistory,
  listExercises,
  listCustomExercises,
  restoreCustomExercise,
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
      0,
      'Exercício personalizado criado neste aparelho.',
    );
    expect(writeAuditLog).toHaveBeenCalledWith('exercise', 'entity-1', 'custom_created', expect.any(Object));
  });

  it('archives and restores only custom exercises', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({
      id: 'exercise-1',
      isCustom: true,
    });

    archiveCustomExercise('exercise-1');
    restoreCustomExercise('exercise-1');

    expect(database.runSync).toHaveBeenNthCalledWith(
      1,
      'UPDATE exercises SET is_archived = 1, updated_at = ? WHERE id = ?',
      expect.any(String),
      'exercise-1',
    );
    expect(database.runSync).toHaveBeenNthCalledWith(
      2,
      'UPDATE exercises SET is_archived = 0, updated_at = ? WHERE id = ?',
      expect.any(String),
      'exercise-1',
    );
  });

  it('supports listing custom exercises and filtering by search, muscle and equipment', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([]);

    listCustomExercises();
    listExercises({
      search: 'Supino',
      muscleGroup: 'chest',
      equipment: 'barbell',
      onlyCustom: true,
      includeArchived: true,
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
    expect((database.getAllSync as jest.Mock).mock.calls[1][0]).not.toContain('is_archived = 0');
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

  it('updates custom exercises and rejects non-custom edit/archive/restore attempts', () => {
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
    expect(() => archiveCustomExercise('exercise-2')).toThrow('Somente exercícios personalizados podem ser arquivados.');
    expect(() => restoreCustomExercise('exercise-2')).toThrow('Somente exercícios personalizados podem ser restaurados.');
  });
});
