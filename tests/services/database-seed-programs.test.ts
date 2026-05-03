type FakeRoutineRow = {
  id: string;
  name: string;
  source: string;
  created_at: string;
  deleted_at: string | null;
  folder_id?: string | null;
  description?: string | null;
  estimated_minutes?: number | null;
};

type FakeFolderRow = {
  id: string;
  name: string;
  color_token: string;
  deleted_at: string | null;
};

type FakeDatabaseState = {
  userVersion: number;
  meta: Map<string, string>;
  users: Array<{ id: string }>;
  routines: FakeRoutineRow[];
  routineFolders: FakeFolderRow[];
};

const buildFakeDatabase = (seed?: Partial<FakeDatabaseState>) => {
  const state: FakeDatabaseState = {
    userVersion: 4,
    meta: new Map<string, string>(),
    users: [],
    routines: [],
    routineFolders: [],
    ...seed,
  };

  const execSync = jest.fn((sql: string) => {
    if (sql.startsWith('PRAGMA user_version = ')) {
      state.userVersion = Number(sql.replace('PRAGMA user_version = ', ''));
      return;
    }

    const deleteMatch = sql.match(/^DELETE FROM ([a-z_]+)$/);
    if (!deleteMatch) {
      return;
    }

    const [, tableName] = deleteMatch;
    switch (tableName) {
      case 'users':
        state.users = [];
        return;
      case 'routines':
        state.routines = [];
        return;
      case 'routine_folders':
        state.routineFolders = [];
        return;
      default:
        return;
    }
  });

  const getFirstSync = jest.fn((sql: string, ...args: unknown[]) => {
    if (sql === 'PRAGMA user_version') {
      return { user_version: state.userVersion };
    }

    if (sql === 'SELECT value FROM app_meta WHERE key = ?') {
      const value = state.meta.get(String(args[0]));
      return value == null ? null : { value };
    }

    if (sql === 'SELECT COUNT(*) AS count FROM routines WHERE source = ?') {
      return {
        count: state.routines.filter((routine) => routine.source === String(args[0])).length,
      };
    }

    if (sql === 'SELECT COUNT(*) AS count FROM users') {
      return { count: state.users.length };
    }

    if (sql === 'SELECT id FROM routine_folders WHERE deleted_at IS NULL AND (name = ? OR name = ?) LIMIT 1') {
      const folder = state.routineFolders.find(
        (entry) => entry.deleted_at == null && (entry.name === String(args[0]) || entry.name === String(args[1])),
      );
      return folder ? { id: folder.id } : null;
    }

    if (sql === 'SELECT id FROM routines WHERE source = ? AND (name = ? OR name = ?) LIMIT 1') {
      const routine = state.routines.find(
        (entry) => entry.source === String(args[0]) && (entry.name === String(args[1]) || entry.name === String(args[2])),
      );
      return routine ? { id: routine.id } : null;
    }

    if (sql === 'SELECT created_at FROM routines WHERE id = ? LIMIT 1') {
      const routine = state.routines.find((entry) => entry.id === String(args[0]));
      return routine ? { created_at: routine.created_at } : null;
    }

    if (sql === 'SELECT id FROM exercises WHERE slug = ? LIMIT 1') {
      return null;
    }

    return null;
  });

  const getAllSync = jest.fn(() => []);

  const runSync = jest.fn((sql: string, ...args: unknown[]) => {
    if (sql.startsWith('INSERT INTO app_meta')) {
      state.meta.set(String(args[0]), String(args[1]));
      return;
    }

    if (sql === 'DELETE FROM app_meta WHERE key = ?') {
      state.meta.delete(String(args[0]));
      return;
    }

    if (sql.includes('INSERT INTO users')) {
      state.users.push({ id: String(args[0]) });
      return;
    }

    if (sql.includes('INSERT INTO routine_folders')) {
      state.routineFolders.push({
        id: String(args[0]),
        name: String(args[10]),
        color_token: String(args[11]),
        deleted_at: args[3] == null ? null : String(args[3]),
      });
      return;
    }

    if (sql === 'UPDATE routine_folders SET name = ?, color_token = ?, updated_at = ? WHERE id = ?') {
      const folder = state.routineFolders.find((entry) => entry.id === String(args[3]));
      if (folder) {
        folder.name = String(args[0]);
        folder.color_token = String(args[1]);
      }
      return;
    }

    if (sql.includes('INSERT INTO routines')) {
      state.routines.push({
        id: String(args[0]),
        created_at: String(args[1]),
        name: String(args[11]),
        source: String(args[13]),
        deleted_at: args[3] == null ? null : String(args[3]),
        folder_id: args[10] == null ? null : String(args[10]),
        description: args[12] == null ? null : String(args[12]),
        estimated_minutes: args[14] == null ? null : Number(args[14]),
      });
      return;
    }

    if (sql.includes('UPDATE routines')) {
      const routine = state.routines.find((entry) => entry.id === String(args[5]));
      if (routine) {
        routine.folder_id = args[0] == null ? null : String(args[0]);
        routine.name = String(args[1]);
        routine.description = args[2] == null ? null : String(args[2]);
        routine.estimated_minutes = args[3] == null ? null : Number(args[3]);
        routine.deleted_at = null;
      }
      return;
    }
  });

  return {
    state,
    db: {
      execSync,
      getAllSync,
      getFirstSync,
      runSync,
    },
  };
};

const starterPrograms = [
  {
    name: 'Superior foco A',
    description: 'Seed one',
    source: 'library',
    estimatedMinutes: 45,
    folderName: 'Blocos iniciais',
    colorToken: 'blue',
    exercises: [],
  },
  {
    name: 'Inferior força B',
    description: 'Seed two',
    source: 'library',
    estimatedMinutes: 50,
    folderName: 'Blocos iniciais',
    colorToken: 'blue',
    exercises: [],
  },
];

describe('database starter program bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const loadDatabaseModule = (seed?: Partial<FakeDatabaseState>) => {
    const fake = buildFakeDatabase(seed);
    let createIdCounter = 0;

    jest.doMock('expo-sqlite', () => ({
      openDatabaseSync: jest.fn(() => fake.db),
    }));

    jest.doMock('@/src/shared/content/library-content', () => ({
      exerciseCatalog: [],
      workoutLibrary: starterPrograms,
    }));

    jest.doMock('@/src/shared/utils/id', () => ({
      createDeviceId: jest.fn(() => 'device-1'),
      createId: jest.fn(() => {
        createIdCounter += 1;
        return `entity-${createIdCounter}`;
      }),
    }));

    jest.doMock('@/src/shared/utils/date', () => ({
      nowIso: jest.fn(() => '2026-04-21T12:00:00.000Z'),
    }));

    let databaseModule: typeof import('@/src/shared/db/database');
    jest.isolateModules(() => {
      databaseModule = require('@/src/shared/db/database');
    });

    return {
      fake,
      databaseModule: databaseModule!,
    };
  };

  it('seeds starter programs only once on a fresh local database', () => {
    const { fake, databaseModule } = loadDatabaseModule();

    databaseModule.initializeDatabase();

    expect(fake.state.routines.map((routine) => routine.name)).toEqual(['Superior foco A', 'Inferior força B']);
    expect(fake.state.meta.get('starter_library_seed_v1_completed')).toBe('2026-04-21T12:00:00.000Z');

    databaseModule.initializeDatabase();

    expect(fake.state.routines).toHaveLength(2);
  });

  it('marks the starter seed as completed without recreating visible library routines', () => {
    const { fake, databaseModule } = loadDatabaseModule({
      userVersion: 4,
      routines: [
        {
          id: 'routine-existing',
          name: 'Superior foco A',
          source: 'library',
          created_at: '2026-04-01T09:00:00.000Z',
          deleted_at: null,
        },
      ],
    });

    databaseModule.initializeDatabase();

    expect(fake.state.meta.get('starter_library_seed_v1_completed')).toBe('2026-04-21T12:00:00.000Z');
    expect(fake.state.routines).toHaveLength(1);
    expect(fake.state.routines[0]?.id).toBe('routine-existing');
  });

  it('does not resurrect deleted starter routines on existing installs', () => {
    const { fake, databaseModule } = loadDatabaseModule({
      userVersion: 4,
      routines: [
        {
          id: 'routine-deleted',
          name: 'Inferior força B',
          source: 'library',
          created_at: '2026-04-01T09:00:00.000Z',
          deleted_at: '2026-04-10T09:00:00.000Z',
        },
      ],
    });

    databaseModule.initializeDatabase();

    expect(fake.state.meta.get('starter_library_seed_v1_completed')).toBe('2026-04-21T12:00:00.000Z');
    expect(fake.state.routines).toHaveLength(1);
    expect(fake.state.routines[0]?.deleted_at).toBe('2026-04-10T09:00:00.000Z');
  });

  it('recreates starter programs only after an explicit reset of the local database', () => {
    const { fake, databaseModule } = loadDatabaseModule({
      meta: new Map([['starter_library_seed_v1_completed', '2026-04-01T10:00:00.000Z']]),
      routines: [
        {
          id: 'routine-old',
          name: 'Superior foco A',
          source: 'library',
          created_at: '2026-04-01T09:00:00.000Z',
          deleted_at: '2026-04-05T09:00:00.000Z',
        },
      ],
    });

    databaseModule.resetSeededDatabase();

    expect(fake.state.meta.get('starter_library_seed_v1_completed')).toBe('2026-04-21T12:00:00.000Z');
    expect(fake.state.routines.map((routine) => routine.name)).toEqual(['Superior foco A', 'Inferior força B']);
    expect(fake.state.users).toHaveLength(1);
  });
});
