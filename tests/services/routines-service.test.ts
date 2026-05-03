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

import {
  deleteRoutine,
  deleteRoutineFolder,
  duplicateRoutine,
  getRoutineDetails,
  listRoutineFolders,
  listRoutines,
  saveRoutine,
} from '@/src/modules/routines/service';
import { createEntityBase, database, writeAuditLog } from '@/src/shared/db/database';

describe('routines service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createEntityBase as jest.Mock).mockReset();
    (database.execSync as jest.Mock).mockReset();
    (database.getAllSync as jest.Mock).mockReset();
    (database.getFirstSync as jest.Mock).mockReset();
    (database.runSync as jest.Mock).mockReset();
    (writeAuditLog as jest.Mock).mockReset();
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

  it('lists saved workout folders and workouts', () => {
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([{ id: 'folder-1', name: 'Push', color_token: 'blue' }])
      .mockReturnValueOnce([
        {
          id: 'routine-1',
          name: 'Treino A',
          description: 'Peito e tríceps',
          source: 'custom',
          estimated_minutes: 45,
          folder_name: 'Push',
          exercises_count: 4,
        },
      ]);

    expect(listRoutineFolders()).toEqual([{ id: 'folder-1', name: 'Push', color_token: 'blue' }]);
    expect(listRoutines()).toEqual([
      {
        id: 'routine-1',
        name: 'Treino A',
        description: 'Peito e tríceps',
        source: 'custom',
        estimated_minutes: 45,
        folder_name: 'Push',
        exercises_count: 4,
      },
    ]);
  });

  it('deletes a folder while keeping its workouts without a folder', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({ id: 'folder-1', name: 'Push' });
    (database.getAllSync as jest.Mock).mockReturnValue([{ id: 'routine-1', name: 'Upper Blue' }]);

    expect(deleteRoutineFolder('folder-1', 'keep_routines')).toBe(true);

    expect(database.execSync).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE routines SET folder_id = NULL, updated_at = ? WHERE folder_id = ? AND deleted_at IS NULL',
      expect.any(String),
      'folder-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE routine_folders SET deleted_at = ?, updated_at = ? WHERE id = ?',
      expect.any(String),
      expect.any(String),
      'folder-1',
    );
    expect(database.execSync).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(writeAuditLog).toHaveBeenCalledWith('routine_folder', 'folder-1', 'deleted', {
      name: 'Push',
      mode: 'keep_routines',
      routines: [{ id: 'routine-1', name: 'Upper Blue' }],
      routinesCount: 1,
    });
  });

  it('deletes a folder together with its workouts', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({ id: 'folder-1', name: 'Push' });
    (database.getAllSync as jest.Mock).mockReturnValue([
      { id: 'routine-1', name: 'Upper Blue' },
      { id: 'routine-2', name: 'Push B' },
    ]);

    expect(deleteRoutineFolder('folder-1', 'delete_routines')).toBe(true);

    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE routines SET deleted_at = ?, updated_at = ? WHERE folder_id = ? AND deleted_at IS NULL',
      expect.any(String),
      expect.any(String),
      'folder-1',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE routine_exercises'),
      expect.any(String),
      expect.any(String),
      'folder-1',
    );
    expect(writeAuditLog).toHaveBeenCalledWith('routine_folder', 'folder-1', 'deleted', {
      name: 'Push',
      mode: 'delete_routines',
      routines: [
        { id: 'routine-1', name: 'Upper Blue' },
        { id: 'routine-2', name: 'Push B' },
      ],
      routinesCount: 2,
    });
    expect(writeAuditLog).toHaveBeenCalledWith('routine', 'routine-1', 'deleted_with_folder', {
      folderId: 'folder-1',
      folderName: 'Push',
    });
    expect(writeAuditLog).toHaveBeenCalledWith('routine', 'routine-2', 'deleted_with_folder', {
      folderId: 'folder-1',
      folderName: 'Push',
    });
  });

  it('returns false when trying to delete a missing folder', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue(null);

    expect(deleteRoutineFolder('missing-folder', 'keep_routines')).toBe(false);
    expect(database.execSync).not.toHaveBeenCalled();
  });

  it('returns null when the saved workout does not exist', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue(null);

    expect(getRoutineDetails('missing-routine')).toBeNull();
  });

  it('creates a saved workout with a new folder and exercises', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue(null);

    const routineId = saveRoutine({
      name: 'Treino A',
      description: 'Peito e tríceps',
      folderName: 'Push',
      exercises: [
        {
          exerciseId: 'exercise-1',
          targetSets: 4,
          targetRepsLabel: '6-8',
          restSeconds: 120,
          note: 'Cadência controlada',
          privateLink: '',
          supersetGroup: '',
          warmupEnabled: true,
        },
        {
          exerciseId: 'exercise-2',
          targetSets: 3,
          targetRepsLabel: '10-12',
          restSeconds: 90,
          note: '',
          privateLink: 'https://example.com',
          supersetGroup: 'A',
          warmupEnabled: false,
        },
      ],
    });

    expect(routineId).toBe('entity-2');
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routine_folders'),
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
      'Push',
      'blue',
      0,
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routines'),
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
      'Treino A',
      'Peito e tríceps',
      'custom',
      20,
      0,
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routine_exercises'),
      'entity-3',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'entity-2',
      'exercise-1',
      0,
      4,
      '6-8',
      120,
      null,
      null,
      null,
      null,
      'Cadência controlada',
      '',
      '',
      1,
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO routine_exercises'),
      'entity-4',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'entity-2',
      'exercise-2',
      1,
      3,
      '10-12',
      90,
      null,
      null,
      null,
      null,
      '',
      'https://example.com',
      'A',
      0,
    );
    expect(writeAuditLog).toHaveBeenCalledWith('routine', 'entity-2', 'created', {
      name: 'Treino A',
      exercises: 2,
    });
  });

  it('updates a saved workout, reuses the folder and replaces all exercise rows', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({ id: 'folder-1' });

    const updatedRoutineId = saveRoutine(
      {
        name: 'Treino B',
        description: 'Costas e bíceps',
        folderName: 'Pull',
        exercises: [
          {
            exerciseId: 'exercise-3',
            targetSets: 5,
            targetRepsLabel: '5',
            restSeconds: 150,
            note: '',
            privateLink: '',
            supersetGroup: '',
            warmupEnabled: false,
          },
        ],
      },
      'routine-1',
    );

    expect(updatedRoutineId).toBe('routine-1');
    expect(database.runSync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE routines'),
      'Treino B',
      'Costas e bíceps',
      'folder-1',
      expect.any(String),
      20,
      'routine-1',
    );
    expect(database.runSync).toHaveBeenNthCalledWith(2, 'DELETE FROM routine_exercises WHERE routine_id = ?', 'routine-1');
    expect(database.runSync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO routine_exercises'),
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
      'routine-1',
      'exercise-3',
      0,
      5,
      '5',
      150,
      null,
      null,
      null,
      null,
      '',
      '',
      '',
      0,
    );
    expect(writeAuditLog).toHaveBeenCalledWith('routine', 'routine-1', 'updated', {
      name: 'Treino B',
      exercises: 1,
    });
  });

  it('duplicates a saved workout with the expected suffix and returns null for unknown items', () => {
    (database.getFirstSync as jest.Mock)
      .mockReturnValueOnce({
        id: 'routine-1',
        name: 'Treino base',
        description: 'Descrição',
        source: 'custom',
        estimated_minutes: 42,
        folder_name: 'Push',
      })
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ id: 'routine-2' })
      .mockReturnValueOnce(null);
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'routine-exercise-1',
        exercise_id: 'exercise-1',
        name: 'Supino reto',
        target_sets: 4,
        target_reps_label: '6-8',
        rest_seconds: 120,
        note: 'Cadência controlada',
        private_link: '',
        superset_group: '',
        warmup_enabled: 1,
      },
    ]);

    const duplicatedId = duplicateRoutine('routine-1');

    expect(duplicatedId).toBe('entity-2');
    expect(writeAuditLog).toHaveBeenCalledWith('routine', 'entity-2', 'created', {
      name: 'Treino base - Cópia',
      exercises: 1,
    });

    (database.getFirstSync as jest.Mock).mockReset();
    (database.getFirstSync as jest.Mock).mockReturnValue(null);
    expect(duplicateRoutine('missing-routine')).toBeNull();
  });

  it('soft deletes the saved workout and keeps workout history untouched', () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({
      id: 'routine-1',
      name: 'Treino A',
      description: null,
      source: 'custom',
      estimated_minutes: 45,
      folder_name: 'Push',
    });
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'routine-exercise-1',
        exercise_id: 'exercise-1',
        name: 'Supino reto',
        target_sets: 4,
        target_reps_label: '6-8',
        rest_seconds: 120,
        note: null,
        private_link: null,
        superset_group: null,
        warmup_enabled: 1,
      },
    ]);

    const deleted = deleteRoutine('routine-1');

    expect(deleted).toBe(true);
    expect(database.runSync).toHaveBeenNthCalledWith(
      1,
      'UPDATE routines SET deleted_at = ?, updated_at = ? WHERE id = ?',
      expect.any(String),
      expect.any(String),
      'routine-1',
    );
    expect(database.runSync).toHaveBeenNthCalledWith(
      2,
      'UPDATE routine_exercises SET deleted_at = ?, updated_at = ? WHERE routine_id = ?',
      expect.any(String),
      expect.any(String),
      'routine-1',
    );
    expect(writeAuditLog).toHaveBeenCalledWith('routine', 'routine-1', 'deleted', {
      name: 'Treino A',
      exercises: 1,
    });
    expect((database.runSync as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('workouts'))).toBe(false);
  });
});
