import { openDatabaseSync } from 'expo-sqlite';

import { exerciseCatalog, workoutLibrary } from '@/src/shared/content/library-content';
import { createDeviceId, createId } from '@/src/shared/utils/id';
import { nowIso } from '@/src/shared/utils/date';

const DB_NAME = 'frog-workout-tracker.db';
const SCHEMA_VERSION = 9;
const STARTER_PROGRAMS_SEED_KEY = 'starter_library_seed_v1_completed';

const db = openDatabaseSync(DB_NAME);

let initialized = false;

const stringOrNull = (value: unknown) => (value == null ? null : String(value));

const parseJsonArray = <T>(value: string | null | undefined): T[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const assertTableName = (tableName: string) => {
  if (!/^[a-z_]+$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  return tableName;
};

const baseColumnsSql = `
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  remote_id TEXT,
  sync_state TEXT NOT NULL,
  last_exported_at TEXT,
  origin_device_id TEXT NOT NULL
`;

const createTables = () => {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      ${baseColumnsSql},
      mode TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_uri TEXT,
      unit_system TEXT NOT NULL,
      experience_level TEXT NOT NULL,
      onboarding_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      ${baseColumnsSql},
      user_id TEXT NOT NULL,
      default_rest_seconds INTEGER NOT NULL,
      keep_awake INTEGER NOT NULL,
      haptics_enabled INTEGER NOT NULL,
      show_rpe INTEGER NOT NULL,
      show_previous_values INTEGER NOT NULL,
      rest_overlay_enabled INTEGER NOT NULL DEFAULT 0,
      week_starts_on INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      ${baseColumnsSql},
      user_id TEXT NOT NULL,
      rest_timer_enabled INTEGER NOT NULL,
      pr_enabled INTEGER NOT NULL,
      reminders_enabled INTEGER NOT NULL,
      reports_enabled INTEGER NOT NULL,
      reminder_time_local TEXT,
      reminder_days_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS exercises (
      ${baseColumnsSql},
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      secondary_muscles_json TEXT NOT NULL,
      equipment TEXT NOT NULL,
      modality TEXT NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      instructions TEXT
    );

    CREATE TABLE IF NOT EXISTS routine_folders (
      ${baseColumnsSql},
      name TEXT NOT NULL,
      color_token TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routines (
      ${baseColumnsSql},
      folder_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      source TEXT NOT NULL,
      estimated_minutes INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS routine_exercises (
      ${baseColumnsSql},
      routine_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      target_sets INTEGER NOT NULL,
      target_reps_label TEXT NOT NULL,
      rest_seconds INTEGER NOT NULL,
      cardio_duration_seconds INTEGER,
      cardio_distance_meters REAL,
      cardio_speed REAL,
      cardio_elevation REAL,
      note TEXT,
      private_link TEXT,
      superset_group TEXT,
      warmup_enabled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workouts (
      ${baseColumnsSql},
      routine_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      general_note TEXT,
      total_volume REAL NOT NULL DEFAULT 0,
      total_reps INTEGER NOT NULL DEFAULT 0,
      total_distance_meters REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      ${baseColumnsSql},
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      note TEXT,
      rest_seconds INTEGER NOT NULL DEFAULT 90,
      previous_performance TEXT,
      superset_group TEXT
    );

    CREATE TABLE IF NOT EXISTS set_entries (
      ${baseColumnsSql},
      workout_exercise_id TEXT NOT NULL,
      set_index INTEGER NOT NULL,
      type TEXT NOT NULL,
      reps INTEGER,
      weight_kg REAL,
      duration_seconds INTEGER,
      distance_meters REAL,
      speed REAL,
      elevation REAL,
      rpe REAL,
      completed_at TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_media (
      ${baseColumnsSql},
      workout_id TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      media_type TEXT NOT NULL,
      thumbnail_uri TEXT,
      storage_scope TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER,
      width INTEGER,
      height INTEGER,
      mime_type TEXT
    );

    CREATE TABLE IF NOT EXISTS body_measurements (
      ${baseColumnsSql},
      user_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      weight_kg REAL,
      chest_cm REAL,
      waist_cm REAL,
      hips_cm REAL,
      arm_cm REAL,
      thigh_cm REAL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS pr_records (
      ${baseColumnsSql},
      exercise_id TEXT NOT NULL,
      workout_id TEXT NOT NULL,
      set_entry_id TEXT NOT NULL,
      record_type TEXT NOT NULL DEFAULT 'pr',
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      achieved_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_history_snapshots (
      ${baseColumnsSql},
      exercise_id TEXT NOT NULL,
      period_key TEXT NOT NULL,
      workouts_count INTEGER NOT NULL,
      sets_count INTEGER NOT NULL,
      total_volume REAL NOT NULL,
      total_reps INTEGER NOT NULL,
      best_weight REAL NOT NULL,
      best_estimated_1rm REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue_items (
      ${baseColumnsSql},
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_draft_snapshots (
      ${baseColumnsSql},
      workout_id TEXT NOT NULL UNIQUE,
      summary_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      ${baseColumnsSql},
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_daily (
      day_key TEXT PRIMARY KEY NOT NULL,
      workouts_count INTEGER NOT NULL DEFAULT 0,
      total_volume REAL NOT NULL DEFAULT 0,
      total_reps INTEGER NOT NULL DEFAULT 0,
      total_distance_meters REAL NOT NULL DEFAULT 0,
      total_duration_seconds INTEGER NOT NULL DEFAULT 0,
      record_count INTEGER NOT NULL DEFAULT 0,
      pr_count INTEGER NOT NULL DEFAULT 0,
      one_rm_count INTEGER NOT NULL DEFAULT 0,
      last_workout_at TEXT
    );

    CREATE TABLE IF NOT EXISTS muscle_period_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      period_key TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      sets_count INTEGER NOT NULL DEFAULT 0,
      total_volume REAL NOT NULL DEFAULT 0,
      UNIQUE(period_key, muscle_group)
    );

    CREATE TABLE IF NOT EXISTS monthly_reports (
      month_key TEXT PRIMARY KEY NOT NULL,
      payload_json TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS yearly_reviews (
      year_key TEXT PRIMARY KEY NOT NULL,
      payload_json TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      status TEXT NOT NULL,
      summary_json TEXT,
      error_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_routine_exercises_routine_id ON routine_exercises(routine_id);
    CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id ON workout_exercises(workout_id);
    CREATE INDEX IF NOT EXISTS idx_set_entries_workout_exercise_id ON set_entries(workout_exercise_id);
    CREATE INDEX IF NOT EXISTS idx_pr_records_exercise_metric ON pr_records(exercise_id, record_type, metric);
    CREATE INDEX IF NOT EXISTS idx_pr_records_achieved_at ON pr_records(achieved_at);
    CREATE INDEX IF NOT EXISTS idx_workouts_status ON workouts(status);
    CREATE INDEX IF NOT EXISTS idx_workouts_started_at ON workouts(started_at);
    CREATE INDEX IF NOT EXISTS idx_body_measurements_recorded_at ON body_measurements(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_daily_day_key ON analytics_daily(day_key);
    CREATE INDEX IF NOT EXISTS idx_muscle_period_snapshots_period_key ON muscle_period_snapshots(period_key);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_checksum ON import_jobs(checksum);
  `);
};

const getMeta = (key: string) => {
  const result = db.getFirstSync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', key);
  return result?.value ?? null;
};

const setMeta = (key: string, value: string) => {
  db.runSync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
};

const clearMeta = (key: string) => {
  db.runSync('DELETE FROM app_meta WHERE key = ?', key);
};

const getSchemaVersion = () => db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;

const tableHasColumn = (tableName: string, columnName: string) =>
  db
    .getAllSync<{ name: string }>(`PRAGMA table_info(${assertTableName(tableName)})`)
    .some((column) => column.name === columnName);

const migrateToV2 = () => {
  if (!tableHasColumn('body_measurements', 'note')) {
    db.execSync('ALTER TABLE body_measurements ADD COLUMN note TEXT');
  }
};

const migrateToV3 = () => {
  if (!tableHasColumn('notification_preferences', 'reminder_time_local')) {
    db.execSync('ALTER TABLE notification_preferences ADD COLUMN reminder_time_local TEXT');
  }

  if (!tableHasColumn('notification_preferences', 'reminder_days_json')) {
    db.execSync("ALTER TABLE notification_preferences ADD COLUMN reminder_days_json TEXT NOT NULL DEFAULT '[]'");
  }

  if (!tableHasColumn('exercises', 'is_archived')) {
    db.execSync('ALTER TABLE exercises ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0');
  }

  if (!tableHasColumn('workout_media', 'file_name')) {
    db.execSync("ALTER TABLE workout_media ADD COLUMN file_name TEXT NOT NULL DEFAULT ''");
  }

  if (!tableHasColumn('workout_media', 'file_size_bytes')) {
    db.execSync('ALTER TABLE workout_media ADD COLUMN file_size_bytes INTEGER NOT NULL DEFAULT 0');
  }

  if (!tableHasColumn('workout_media', 'duration_seconds')) {
    db.execSync('ALTER TABLE workout_media ADD COLUMN duration_seconds INTEGER');
  }

  if (!tableHasColumn('workout_media', 'width')) {
    db.execSync('ALTER TABLE workout_media ADD COLUMN width INTEGER');
  }

  if (!tableHasColumn('workout_media', 'height')) {
    db.execSync('ALTER TABLE workout_media ADD COLUMN height INTEGER');
  }

  if (!tableHasColumn('workout_media', 'mime_type')) {
    db.execSync('ALTER TABLE workout_media ADD COLUMN mime_type TEXT');
  }
};

const migrateToV4 = () => {
  if (!tableHasColumn('user_preferences', 'rest_overlay_enabled')) {
    db.execSync('ALTER TABLE user_preferences ADD COLUMN rest_overlay_enabled INTEGER NOT NULL DEFAULT 0');
  }
};

const migrateToV5 = () => {
  if (getMeta(STARTER_PROGRAMS_SEED_KEY)) {
    return;
  }

  const existingLibraryRoutines =
    db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM routines WHERE source = ?', 'library')?.count ?? 0;

  if (existingLibraryRoutines > 0) {
    setMeta(STARTER_PROGRAMS_SEED_KEY, nowIso());
  }
};

const migrateToV6 = () => {
  if (!tableHasColumn('routine_exercises', 'cardio_duration_seconds')) {
    db.execSync('ALTER TABLE routine_exercises ADD COLUMN cardio_duration_seconds INTEGER');
  }

  if (!tableHasColumn('routine_exercises', 'cardio_distance_meters')) {
    db.execSync('ALTER TABLE routine_exercises ADD COLUMN cardio_distance_meters REAL');
  }

  if (!tableHasColumn('routine_exercises', 'cardio_speed')) {
    db.execSync('ALTER TABLE routine_exercises ADD COLUMN cardio_speed REAL');
  }

  if (!tableHasColumn('routine_exercises', 'cardio_elevation')) {
    db.execSync('ALTER TABLE routine_exercises ADD COLUMN cardio_elevation REAL');
  }

  if (!tableHasColumn('set_entries', 'speed')) {
    db.execSync('ALTER TABLE set_entries ADD COLUMN speed REAL');
  }

  if (!tableHasColumn('set_entries', 'elevation')) {
    db.execSync('ALTER TABLE set_entries ADD COLUMN elevation REAL');
  }
};

const rebuildUserPreferencesWithoutVisibility = () => {
  db.execSync(`
    CREATE TABLE user_preferences_v7 (
      ${baseColumnsSql},
      user_id TEXT NOT NULL,
      default_rest_seconds INTEGER NOT NULL,
      keep_awake INTEGER NOT NULL,
      haptics_enabled INTEGER NOT NULL,
      show_rpe INTEGER NOT NULL,
      show_previous_values INTEGER NOT NULL,
      rest_overlay_enabled INTEGER NOT NULL DEFAULT 0,
      week_starts_on INTEGER NOT NULL
    )
  `);

  db.execSync(`
    INSERT INTO user_preferences_v7 (
      id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
      user_id, default_rest_seconds, keep_awake, haptics_enabled, show_rpe, show_previous_values, rest_overlay_enabled, week_starts_on
    )
    SELECT
      id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
      user_id, default_rest_seconds, keep_awake, haptics_enabled, show_rpe, show_previous_values, rest_overlay_enabled, week_starts_on
    FROM user_preferences
  `);

  db.execSync('DROP TABLE user_preferences');
  db.execSync('ALTER TABLE user_preferences_v7 RENAME TO user_preferences');
};

const rebuildWorkoutsWithoutVisibility = () => {
  db.execSync(`
    CREATE TABLE workouts_v7 (
      ${baseColumnsSql},
      routine_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      general_note TEXT,
      total_volume REAL NOT NULL DEFAULT 0,
      total_reps INTEGER NOT NULL DEFAULT 0,
      total_distance_meters REAL NOT NULL DEFAULT 0
    )
  `);

  db.execSync(`
    INSERT INTO workouts_v7 (
      id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
      routine_id, title, status, source, started_at, ended_at, duration_seconds, general_note, total_volume, total_reps, total_distance_meters
    )
    SELECT
      id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
      routine_id, title, status, source, started_at, ended_at, duration_seconds, general_note, total_volume, total_reps, total_distance_meters
    FROM workouts
  `);

  db.execSync('DROP TABLE workouts');
  db.execSync('ALTER TABLE workouts_v7 RENAME TO workouts');
  db.execSync('CREATE INDEX IF NOT EXISTS idx_workouts_status ON workouts(status)');
  db.execSync('CREATE INDEX IF NOT EXISTS idx_workouts_started_at ON workouts(started_at)');
};

const migrateToV7 = () => {
  db.execSync('PRAGMA foreign_keys = OFF');

  try {
    if (tableHasColumn('user_preferences', 'default_workout_visibility')) {
      rebuildUserPreferencesWithoutVisibility();
    }

    if (tableHasColumn('workouts', 'visibility')) {
      rebuildWorkoutsWithoutVisibility();
    }
  } finally {
    db.execSync('PRAGMA foreign_keys = ON');
  }
};

const rebuildBodyMeasurementsWithoutRelatedWorkout = () => {
  db.execSync(`
    CREATE TABLE body_measurements_v8 (
      ${baseColumnsSql},
      user_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      weight_kg REAL,
      chest_cm REAL,
      waist_cm REAL,
      hips_cm REAL,
      arm_cm REAL,
      thigh_cm REAL,
      note TEXT
    )
  `);

  db.execSync(`
    INSERT INTO body_measurements_v8 (
      id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
      user_id, recorded_at, weight_kg, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, note
    )
    SELECT
      id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
      user_id, recorded_at, weight_kg, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, note
    FROM body_measurements
  `);

  db.execSync('DROP TABLE body_measurements');
  db.execSync('ALTER TABLE body_measurements_v8 RENAME TO body_measurements');
  db.execSync('CREATE INDEX IF NOT EXISTS idx_body_measurements_recorded_at ON body_measurements(recorded_at)');
};

const migrateToV8 = () => {
  db.execSync('PRAGMA foreign_keys = OFF');

  try {
    if (tableHasColumn('body_measurements', 'related_workout_id')) {
      rebuildBodyMeasurementsWithoutRelatedWorkout();
    }
  } finally {
    db.execSync('PRAGMA foreign_keys = ON');
  }
};

const migrateToV9 = () => {
  if (!tableHasColumn('pr_records', 'record_type')) {
    db.execSync("ALTER TABLE pr_records ADD COLUMN record_type TEXT NOT NULL DEFAULT 'pr'");
  }

  db.execSync("UPDATE pr_records SET record_type = 'one_rm' WHERE metric = 'estimated_1rm'");
  db.execSync('DROP INDEX IF EXISTS idx_pr_records_exercise_metric');
  db.execSync('CREATE INDEX IF NOT EXISTS idx_pr_records_exercise_metric ON pr_records(exercise_id, record_type, metric)');

  if (!tableHasColumn('analytics_daily', 'record_count')) {
    db.execSync('ALTER TABLE analytics_daily ADD COLUMN record_count INTEGER NOT NULL DEFAULT 0');
  }

  if (!tableHasColumn('analytics_daily', 'one_rm_count')) {
    db.execSync('ALTER TABLE analytics_daily ADD COLUMN one_rm_count INTEGER NOT NULL DEFAULT 0');
  }

  db.execSync(`
    DELETE FROM analytics_daily;
    DELETE FROM monthly_reports;
    DELETE FROM yearly_reviews;
  `);
};

const ensureDeviceId = () => {
  const existing = getMeta('device_id');
  if (existing) {
    return existing;
  }

  const created = createDeviceId();
  setMeta('device_id', created);
  return created;
};

const createBase = (originDeviceId: string) => {
  const timestamp = nowIso();
  return {
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    syncState: 'local_only',
    originDeviceId,
  } as const;
};

const seedUser = (originDeviceId: string) => {
  const user = createBase(originDeviceId);
  db.runSync(
    `
      INSERT INTO users (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        mode, display_name, avatar_uri, unit_system, experience_level, onboarding_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    user.id,
    user.createdAt,
    user.updatedAt,
    null,
    user.version,
    user.schemaVersion,
    null,
    user.syncState,
    null,
    user.originDeviceId,
    'guest',
    'Frog Athlete',
    null,
    'metric',
    'intermediate',
    0,
  );

  const preferences = createBase(originDeviceId);
  db.runSync(
    `
      INSERT INTO user_preferences (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        user_id, default_rest_seconds, keep_awake, haptics_enabled, show_rpe, show_previous_values, rest_overlay_enabled, week_starts_on
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    preferences.id,
    preferences.createdAt,
    preferences.updatedAt,
    null,
    preferences.version,
    preferences.schemaVersion,
    null,
    preferences.syncState,
    null,
    preferences.originDeviceId,
    user.id,
    90,
    1,
    1,
    1,
    1,
    0,
    1,
  );

  const notifications = createBase(originDeviceId);
  db.runSync(
    `
      INSERT INTO notification_preferences (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        user_id, rest_timer_enabled, pr_enabled, reminders_enabled, reports_enabled, reminder_time_local, reminder_days_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    notifications.id,
    notifications.createdAt,
    notifications.updatedAt,
    null,
    notifications.version,
    notifications.schemaVersion,
    null,
    notifications.syncState,
    null,
    notifications.originDeviceId,
    user.id,
    1,
    1,
    0,
    1,
    '19:00',
    JSON.stringify([1, 3, 5]),
  );
};

const syncSeedExercises = (originDeviceId: string) => {
  exerciseCatalog.forEach((seed) => {
    const existing = db.getFirstSync<{ id: string }>('SELECT id FROM exercises WHERE slug = ? LIMIT 1', seed.slug);

    if (existing?.id) {
      db.runSync(
        `
          UPDATE exercises
          SET
            name = ?,
            muscle_group = ?,
            secondary_muscles_json = ?,
            equipment = ?,
            modality = ?,
            instructions = ?,
            updated_at = ?,
            deleted_at = NULL,
            is_archived = 0
          WHERE id = ?
        `,
        seed.name,
        seed.muscleGroup,
        JSON.stringify(seed.secondaryMuscles),
        seed.equipment,
        seed.modality,
        seed.instructions,
        nowIso(),
        existing.id,
      );
      return;
    }

    const base = createBase(originDeviceId);
    db.runSync(
      `
        INSERT INTO exercises (
          id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
          slug, name, muscle_group, secondary_muscles_json, equipment, modality, is_custom, instructions, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      seed.slug,
      seed.name,
      seed.muscleGroup,
      JSON.stringify(seed.secondaryMuscles),
      seed.equipment,
      seed.modality,
      0,
      seed.instructions,
      0,
    );
  });
};

const findOrCreateSeedFolder = (folderName: string, colorToken: string, originDeviceId: string) => {
  const existing = db.getFirstSync<{ id: string }>(
    'SELECT id FROM routine_folders WHERE deleted_at IS NULL AND (name = ? OR name = ?) LIMIT 1',
    folderName,
    'Starter Blocks',
  );

  if (existing?.id) {
    db.runSync(
      'UPDATE routine_folders SET name = ?, color_token = ?, updated_at = ? WHERE id = ?',
      folderName,
      colorToken,
      nowIso(),
      existing.id,
    );
    return existing.id;
  }

  const folderBase = createBase(originDeviceId);
  db.runSync(
    `
      INSERT INTO routine_folders (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        name, color_token, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    folderBase.id,
    folderBase.createdAt,
    folderBase.updatedAt,
    null,
    folderBase.version,
    folderBase.schemaVersion,
    null,
    folderBase.syncState,
    null,
    folderBase.originDeviceId,
    folderName,
    colorToken,
    0,
  );
  return folderBase.id;
};

const syncSeedPrograms = (originDeviceId: string) => {
  const legacyNamesByProgram: Record<string, string> = {
    'Superior foco A': 'Upper Focus A',
    'Inferior força B': 'Lower Power B',
    'Corpo todo rápido': 'Quick Full Body',
  };

  workoutLibrary.forEach((program) => {
    const folderId = findOrCreateSeedFolder(program.folderName, program.colorToken, originDeviceId);
    const legacyName = legacyNamesByProgram[program.name];
    const existing = db.getFirstSync<{ id: string }>(
      'SELECT id FROM routines WHERE source = ? AND (name = ? OR name = ?) LIMIT 1',
      'library',
      program.name,
      legacyName ?? program.name,
    );

    const routineId = existing?.id ?? createBase(originDeviceId).id;
    const createdAt =
      db.getFirstSync<{ created_at: string }>('SELECT created_at FROM routines WHERE id = ? LIMIT 1', routineId)?.created_at ??
      nowIso();
    const updatedAt = nowIso();

    if (existing?.id) {
      db.runSync(
        `
          UPDATE routines
          SET folder_id = ?, name = ?, description = ?, estimated_minutes = ?, updated_at = ?, deleted_at = NULL, is_archived = 0
          WHERE id = ?
        `,
        folderId,
        program.name,
        program.description,
        program.estimatedMinutes,
        updatedAt,
        routineId,
      );
      db.runSync('DELETE FROM routine_exercises WHERE routine_id = ?', routineId);
    } else {
      db.runSync(
        `
          INSERT INTO routines (
            id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
            folder_id, name, description, source, estimated_minutes, is_archived
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        routineId,
        createdAt,
        updatedAt,
        null,
        1,
        SCHEMA_VERSION,
        null,
        'local_only',
        null,
        originDeviceId,
        folderId,
        program.name,
        program.description,
        program.source,
        program.estimatedMinutes,
        0,
      );
    }

    program.exercises.forEach((exerciseSeed, exerciseIndex) => {
      const exercise = db.getFirstSync<{ id: string }>('SELECT id FROM exercises WHERE slug = ? LIMIT 1', exerciseSeed.exerciseSlug);
      if (!exercise) {
        return;
      }

      const routineExerciseBase = createBase(originDeviceId);
      db.runSync(
        `
          INSERT INTO routine_exercises (
            id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
            routine_id, exercise_id, sort_order, target_sets, target_reps_label, rest_seconds, cardio_duration_seconds, cardio_distance_meters, cardio_speed, cardio_elevation,
            note, private_link, superset_group, warmup_enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        routineExerciseBase.id,
        routineExerciseBase.createdAt,
        routineExerciseBase.updatedAt,
        null,
        routineExerciseBase.version,
        routineExerciseBase.schemaVersion,
        null,
        routineExerciseBase.syncState,
        null,
        routineExerciseBase.originDeviceId,
        routineId,
        exercise.id,
        exerciseIndex,
        exerciseSeed.targetSets,
        exerciseSeed.targetRepsLabel,
        exerciseSeed.restSeconds,
        null,
        null,
        null,
        null,
        exerciseSeed.note ?? '',
        exerciseSeed.privateLink ?? '',
        exerciseSeed.supersetGroup ?? '',
        exerciseSeed.warmupEnabled ? 1 : 0,
      );
    });
  });
};

const ensureStarterProgramsSeeded = (originDeviceId: string) => {
  if (getMeta(STARTER_PROGRAMS_SEED_KEY)) {
    return;
  }

  const existingLibraryRoutines =
    db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM routines WHERE source = ?', 'library')?.count ?? 0;

  if (existingLibraryRoutines > 0) {
    setMeta(STARTER_PROGRAMS_SEED_KEY, nowIso());
    return;
  }

  syncSeedPrograms(originDeviceId);
  setMeta(STARTER_PROGRAMS_SEED_KEY, nowIso());
};

export const initializeDatabase = () => {
  if (initialized) {
    return;
  }

  createTables();

  if (getSchemaVersion() < SCHEMA_VERSION) {
    if (getSchemaVersion() < 2) {
      migrateToV2();
    }

    if (getSchemaVersion() < 3) {
      migrateToV3();
    }

    if (getSchemaVersion() < 4) {
      migrateToV4();
    }

    if (getSchemaVersion() < 5) {
      migrateToV5();
    }

    if (getSchemaVersion() < 6) {
      migrateToV6();
    }

    if (getSchemaVersion() < 7) {
      migrateToV7();
    }

    if (getSchemaVersion() < 8) {
      migrateToV8();
    }

    if (getSchemaVersion() < 9) {
      migrateToV9();
    }
  }

  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  const originDeviceId = ensureDeviceId();
  const hasUsers = db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM users');
  if ((hasUsers?.count ?? 0) === 0) {
    seedUser(originDeviceId);
  }

  syncSeedExercises(originDeviceId);
  ensureStarterProgramsSeeded(originDeviceId);
  initialized = true;
};

export const database = db;

export const getDeviceId = () => ensureDeviceId();

export const createEntityBase = () => createBase(ensureDeviceId());

export const runInTransaction = <T>(callback: () => T) => {
  database.execSync('BEGIN IMMEDIATE TRANSACTION');

  try {
    const result = callback();
    database.execSync('COMMIT');
    return result;
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  }
};

export const getTableRows = (tableName: string) =>
  database.getAllSync<Record<string, unknown>>(`SELECT * FROM ${assertTableName(tableName)}`);

export const clearTable = (tableName: string) => {
  database.execSync(`DELETE FROM ${assertTableName(tableName)}`);
};

export const insertRow = (tableName: string, row: Record<string, unknown>) => {
  const validatedTable = assertTableName(tableName);
  const columns = Object.keys(row);

  if (columns.length === 0) {
    return;
  }

  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map(
    (column) => (row[column] ?? null) as string | number | null | Uint8Array | boolean,
  );

  database.runSync(
    `INSERT INTO ${validatedTable} (${columns.join(', ')}) VALUES (${placeholders})`,
    ...values,
  );
};

export const getAppUser = () =>
  database.getFirstSync<{
    id: string;
    mode: string;
    display_name: string;
    avatar_uri: string | null;
    unit_system: string;
    experience_level: string;
    onboarding_completed: number;
  }>('SELECT * FROM users ORDER BY created_at LIMIT 1');

export const getUserPreferences = () =>
  database.getFirstSync<{
    id: string;
    user_id: string;
    default_rest_seconds: number;
    keep_awake: number;
    haptics_enabled: number;
    show_rpe: number;
    show_previous_values: number;
    rest_overlay_enabled: number;
    week_starts_on: 0 | 1;
  }>('SELECT * FROM user_preferences ORDER BY created_at LIMIT 1');

export const getNotificationPreferences = () =>
  database.getFirstSync<{
    id: string;
    user_id: string;
    rest_timer_enabled: number;
    pr_enabled: number;
    reminders_enabled: number;
    reports_enabled: number;
    reminder_time_local: string | null;
    reminder_days_json: string | null;
  }>('SELECT * FROM notification_preferences ORDER BY created_at LIMIT 1');

export const mapExerciseRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: stringOrNull(row.deleted_at),
  version: Number(row.version),
  schemaVersion: Number(row.schema_version),
  remoteId: stringOrNull(row.remote_id),
  syncState: String(row.sync_state),
  lastExportedAt: stringOrNull(row.last_exported_at),
  originDeviceId: String(row.origin_device_id),
  slug: String(row.slug),
  name: String(row.name),
  muscleGroup: String(row.muscle_group),
  secondaryMuscles: parseJsonArray(row.secondary_muscles_json as string | null),
  equipment: String(row.equipment),
  modality: String(row.modality),
  isCustom: Number(row.is_custom) === 1,
  isArchived: Number(row.is_archived) === 1,
  instructions: stringOrNull(row.instructions),
});

const RESET_TABLES = [
  'import_jobs',
  'yearly_reviews',
  'monthly_reports',
  'muscle_period_snapshots',
  'analytics_daily',
  'audit_logs',
  'workout_draft_snapshots',
  'sync_queue_items',
  'exercise_history_snapshots',
  'pr_records',
  'body_measurements',
  'workout_media',
  'set_entries',
  'workout_exercises',
  'workouts',
  'routine_exercises',
  'routines',
  'routine_folders',
  'exercises',
  'notification_preferences',
  'user_preferences',
  'users',
] as const;

export const resetSeededDatabase = () => {
  const originDeviceId = ensureDeviceId();

  database.execSync('PRAGMA foreign_keys = OFF');
  database.execSync('BEGIN IMMEDIATE TRANSACTION');

  try {
    RESET_TABLES.forEach((tableName) => {
      database.execSync(`DELETE FROM ${tableName}`);
    });

    clearMeta(STARTER_PROGRAMS_SEED_KEY);
    seedUser(originDeviceId);
    syncSeedExercises(originDeviceId);
    syncSeedPrograms(originDeviceId);
    setMeta(STARTER_PROGRAMS_SEED_KEY, nowIso());

    database.execSync('COMMIT');
  } catch (error) {
    database.execSync('ROLLBACK');
    throw error;
  } finally {
    database.execSync('PRAGMA foreign_keys = ON');
  }
};

export const writeAuditLog = (entityType: string, entityId: string, action: string, payload: Record<string, unknown>) => {
  const base = createBase(ensureDeviceId());
  database.runSync(
    `
      INSERT INTO audit_logs (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        entity_type, entity_id, action, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    entityType,
    entityId,
    action,
    JSON.stringify(payload),
  );
};
