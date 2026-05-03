import { getIdentitySnapshot } from '@/src/modules/identity/service';
import { listBodyMeasurementsWithContext } from '@/src/modules/measurements/service';
import {
  buildMonthlyReportSnapshot,
  buildYearInReviewSnapshot,
  calculatePercentageDelta,
  estimateBestPaceMetersPerMinute,
  getAlignedCalendarWeeks,
  getCalendarDayRange,
  getCurrentStreakFromDays,
  getLastClosedMonthKey,
  getLongestStreakFromDays,
  getMonthCalendarWeeks,
  getMonthKey,
  getPeriodWindow,
  getYearKey
} from '@/src/modules/progress/analytics';
import { database, initializeDatabase } from '@/src/shared/db/database';
import {
  AnalyticsPeriod,
  BodyProgressSnapshot,
  DashboardSnapshot,
  ExerciseAnalyticsSnapshot,
  MonthlyReportSnapshot,
  MuscleAnalyticsSnapshot,
  MuscleGroup,
  OverviewAnalyticsSnapshot,
  RecordMetric,
  RecordType,
  ReportMonthKey,
  ReportYearKey,
  Workout,
  YearInReviewSnapshot,
} from '@/src/shared/types/domain';
import { formatDuration, lastNDays } from '@/src/shared/utils/date';

type AggregateRow = {
  workouts_count: number;
  total_volume: number;
  total_reps: number;
  total_distance_meters: number;
  total_duration_seconds: number;
  record_count: number;
  pr_count: number;
  one_rm_count: number;
};

const emptyAggregate: AggregateRow = {
  workouts_count: 0,
  total_volume: 0,
  total_reps: 0,
  total_distance_meters: 0,
  total_duration_seconds: 0,
  record_count: 0,
  pr_count: 0,
  one_rm_count: 0,
};

const mapWorkoutRow = (workout: Record<string, unknown>): Workout => ({
  id: String(workout.id),
  createdAt: String(workout.created_at),
  updatedAt: String(workout.updated_at),
  deletedAt: workout.deleted_at == null ? null : String(workout.deleted_at),
  version: Number(workout.version),
  schemaVersion: Number(workout.schema_version),
  remoteId: workout.remote_id == null ? null : String(workout.remote_id),
  syncState: String(workout.sync_state) as Workout['syncState'],
  lastExportedAt: workout.last_exported_at == null ? null : String(workout.last_exported_at),
  originDeviceId: String(workout.origin_device_id),
  routineId: workout.routine_id == null ? null : String(workout.routine_id),
  title: String(workout.title),
  status: workout.status as Workout['status'],
  source: workout.source as Workout['source'],
  startedAt: String(workout.started_at),
  endedAt: workout.ended_at == null ? null : String(workout.ended_at),
  durationSeconds: Number(workout.duration_seconds),
  generalNote: workout.general_note == null ? null : String(workout.general_note),
  totalVolume: Number(workout.total_volume),
  totalReps: Number(workout.total_reps),
  totalDistanceMeters: Number(workout.total_distance_meters),
});

const buildPeriodClause = (columnName: string, period: AnalyticsPeriod, params: (string | number)[]) => {
  const window = getPeriodWindow(period);

  if (!window.startDayKey) {
    return '';
  }

  params.push(window.startDayKey, window.endDayKey);
  return `AND SUBSTR(${columnName}, 1, 10) BETWEEN ? AND ?`;
};

const getCompletedWorkoutDays = () =>
  database
    .getAllSync<{ day_key: string }>(
      `
        SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key
        FROM workouts
        WHERE status = 'completed'
        ORDER BY day_key DESC
      `,
    )
    .map((row) => row.day_key);

const getAggregateForPeriod = (period: AnalyticsPeriod) => {
  const params: (string | number)[] = [];
  const clause = buildPeriodClause('day_key', period, params);

  return (
    database.getFirstSync<AggregateRow>(
      `
        SELECT
          COALESCE(SUM(workouts_count), 0) AS workouts_count,
          COALESCE(SUM(total_volume), 0) AS total_volume,
          COALESCE(SUM(total_reps), 0) AS total_reps,
          COALESCE(SUM(total_distance_meters), 0) AS total_distance_meters,
          COALESCE(SUM(total_duration_seconds), 0) AS total_duration_seconds,
          COALESCE(SUM(record_count), 0) AS record_count,
          COALESCE(SUM(pr_count), 0) AS pr_count,
          COALESCE(SUM(one_rm_count), 0) AS one_rm_count
        FROM analytics_daily
        WHERE 1 = 1
        ${clause}
      `,
      ...params,
    ) ?? emptyAggregate
  );
};

const getPreviousAggregateForPeriod = (period: AnalyticsPeriod) => {
  const window = getPeriodWindow(period);
  if (!window.previousStartDayKey) {
    return emptyAggregate;
  }

  return (
    database.getFirstSync<AggregateRow>(
      `
        SELECT
          COALESCE(SUM(workouts_count), 0) AS workouts_count,
          COALESCE(SUM(total_volume), 0) AS total_volume,
          COALESCE(SUM(total_reps), 0) AS total_reps,
          COALESCE(SUM(total_distance_meters), 0) AS total_distance_meters,
          COALESCE(SUM(total_duration_seconds), 0) AS total_duration_seconds,
          COALESCE(SUM(record_count), 0) AS record_count,
          COALESCE(SUM(pr_count), 0) AS pr_count,
          COALESCE(SUM(one_rm_count), 0) AS one_rm_count
        FROM analytics_daily
        WHERE day_key BETWEEN ? AND ?
      `,
      window.previousStartDayKey,
      window.previousEndDayKey,
    ) ?? emptyAggregate
  );
};

const getActiveWorkout = () =>
  database.getFirstSync<Record<string, unknown>>(
    `
      SELECT *
      FROM workouts
      WHERE status IN ('draft', 'in_progress')
      ORDER BY started_at DESC
      LIMIT 1
    `,
  );

const getMuscleDistribution = (period: AnalyticsPeriod) => {
  const params: (string | number)[] = [];
  const clause = buildPeriodClause('period_key', period, params);

  const current = database.getAllSync<{
    muscle_group: MuscleGroup;
    sets: number;
    total_volume: number;
  }>(
    `
      SELECT muscle_group, COALESCE(SUM(sets_count), 0) AS sets, COALESCE(SUM(total_volume), 0) AS total_volume
      FROM muscle_period_snapshots
      WHERE 1 = 1
      ${clause}
      GROUP BY muscle_group
      ORDER BY sets DESC
    `,
    ...params,
  );

  const window = getPeriodWindow(period);
  const previous = window.previousStartDayKey
    ? database.getAllSync<{
        muscle_group: MuscleGroup;
        sets: number;
      }>(
        `
          SELECT muscle_group, COALESCE(SUM(sets_count), 0) AS sets
          FROM muscle_period_snapshots
          WHERE period_key BETWEEN ? AND ?
          GROUP BY muscle_group
        `,
        window.previousStartDayKey,
        window.previousEndDayKey,
      )
    : [];

  const totalSets = current.reduce((sum, row) => sum + row.sets, 0);

  return current.map((row) => ({
    muscle: row.muscle_group,
    sets: row.sets,
    totalVolume: row.total_volume,
    percentage: totalSets > 0 ? (row.sets / totalSets) * 100 : 0,
    previousSets: previous.find((entry) => entry.muscle_group === row.muscle_group)?.sets ?? 0,
  }));
};

const getRecentRecords = (period: AnalyticsPeriod) => {
  const params: (string | number)[] = [];
  const clause = buildPeriodClause('pr.achieved_at', period, params);

  return database.getAllSync<{
    id: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    version: number;
    schema_version: number;
    remote_id: string | null;
    sync_state: string;
    last_exported_at: string | null;
    origin_device_id: string;
    exercise_id: string;
    workout_id: string;
    set_entry_id: string;
    record_type: RecordType;
    metric: RecordMetric;
    value: number;
    achieved_at: string;
    exercise_name: string;
  }>(
    `
      SELECT pr.*, e.name AS exercise_name
      FROM pr_records pr
      JOIN exercises e ON e.id = pr.exercise_id
      WHERE pr.deleted_at IS NULL
      ${clause}
      ORDER BY pr.achieved_at DESC
      LIMIT 8
    `,
    ...params,
  );
};

const getTopExercises = (period: AnalyticsPeriod) => {
  const params: (string | number)[] = [];
  const clause = buildPeriodClause('w.started_at', period, params);

  return database.getAllSync<{
    exercise_id: string;
    exercise_name: string;
    sessions: number;
    total_volume: number;
    best_weight: number;
  }>(
    `
      SELECT
        e.id AS exercise_id,
        e.name AS exercise_name,
        COUNT(DISTINCT w.id) AS sessions,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(MAX(se.weight_kg), 0) AS best_weight
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      JOIN exercises e ON e.id = we.exercise_id
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
      WHERE w.status = 'completed'
      ${clause}
      GROUP BY e.id
      ORDER BY total_volume DESC, sessions DESC
      LIMIT 8
    `,
    ...params,
  );
};

const getCachedMonthKeys = () =>
  database.getAllSync<{ month_key: ReportMonthKey }>(
    'SELECT month_key FROM monthly_reports ORDER BY month_key DESC',
  );

const getCachedYearKeys = () =>
  database.getAllSync<{ year_key: ReportYearKey }>(
    'SELECT year_key FROM yearly_reviews ORDER BY year_key DESC',
  );

export const refreshAnalyticsCaches = () => {
  initializeDatabase();

  database.execSync(`
    DELETE FROM analytics_daily;
    DELETE FROM muscle_period_snapshots;
    DELETE FROM monthly_reports;
    DELETE FROM yearly_reviews;
  `);

  const recordCountsByDay = new Map(
    database
      .getAllSync<{ day_key: string; record_count: number; pr_count: number; one_rm_count: number }>(
        `
          SELECT
            SUBSTR(achieved_at, 1, 10) AS day_key,
            COUNT(*) AS record_count,
            COALESCE(SUM(CASE WHEN record_type = 'pr' THEN 1 ELSE 0 END), 0) AS pr_count,
            COALESCE(SUM(CASE WHEN record_type = 'one_rm' THEN 1 ELSE 0 END), 0) AS one_rm_count
          FROM pr_records
          WHERE deleted_at IS NULL
          GROUP BY day_key
        `,
      )
      .map((row) => [row.day_key, row]),
  );

  const dailyRows = database.getAllSync<{
    day_key: string;
    workouts_count: number;
    total_volume: number;
    total_reps: number;
    total_distance_meters: number;
    total_duration_seconds: number;
    last_workout_at: string;
  }>(
    `
      SELECT
        SUBSTR(started_at, 1, 10) AS day_key,
        COUNT(*) AS workouts_count,
        COALESCE(SUM(total_volume), 0) AS total_volume,
        COALESCE(SUM(total_reps), 0) AS total_reps,
        COALESCE(SUM(total_distance_meters), 0) AS total_distance_meters,
        COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
        MAX(started_at) AS last_workout_at
      FROM workouts
      WHERE status = 'completed'
      GROUP BY day_key
      ORDER BY day_key ASC
    `,
  );

  dailyRows.forEach((row) => {
    database.runSync(
      `
        INSERT INTO analytics_daily (
          day_key, workouts_count, total_volume, total_reps, total_distance_meters, total_duration_seconds,
          record_count, pr_count, one_rm_count, last_workout_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      row.day_key,
      row.workouts_count,
      row.total_volume,
      row.total_reps,
      row.total_distance_meters,
      row.total_duration_seconds,
      recordCountsByDay.get(row.day_key)?.record_count ?? 0,
      recordCountsByDay.get(row.day_key)?.pr_count ?? 0,
      recordCountsByDay.get(row.day_key)?.one_rm_count ?? 0,
      row.last_workout_at,
    );
  });

  const muscleRows = database.getAllSync<{
    period_key: string;
    muscle_group: MuscleGroup;
    sets_count: number;
    total_volume: number;
  }>(
    `
      SELECT
        SUBSTR(w.started_at, 1, 10) AS period_key,
        e.muscle_group,
        COUNT(se.id) AS sets_count,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume
      FROM set_entries se
      JOIN workout_exercises we ON we.id = se.workout_exercise_id
      JOIN workouts w ON w.id = we.workout_id
      JOIN exercises e ON e.id = we.exercise_id
      WHERE w.status = 'completed' AND se.is_completed = 1
      GROUP BY period_key, e.muscle_group
    `,
  );

  muscleRows.forEach((row) => {
    database.runSync(
      `
        INSERT INTO muscle_period_snapshots (id, period_key, muscle_group, sets_count, total_volume)
        VALUES (?, ?, ?, ?, ?)
      `,
      `${row.period_key}-${row.muscle_group}`,
      row.period_key,
      row.muscle_group,
      row.sets_count,
      row.total_volume,
    );
  });

  const monthlyBaseRows = database.getAllSync<{
    month_key: ReportMonthKey;
    workouts: number;
    active_days: number;
    total_volume: number;
    total_reps: number;
    total_duration_seconds: number;
  }>(
    `
      SELECT
        SUBSTR(started_at, 1, 7) AS month_key,
        COUNT(*) AS workouts,
        COUNT(DISTINCT SUBSTR(started_at, 1, 10)) AS active_days,
        COALESCE(SUM(total_volume), 0) AS total_volume,
        COALESCE(SUM(total_reps), 0) AS total_reps,
        COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
      FROM workouts
      WHERE status = 'completed'
      GROUP BY month_key
      ORDER BY month_key ASC
    `,
  );

  monthlyBaseRows.forEach((row) => {
    const recordCounts =
      database.getFirstSync<{ count?: number; record_count?: number; pr_count?: number; one_rm_count?: number }>(
        `
          SELECT
            COUNT(*) AS record_count,
            COALESCE(SUM(CASE WHEN record_type = 'pr' THEN 1 ELSE 0 END), 0) AS pr_count,
            COALESCE(SUM(CASE WHEN record_type = 'one_rm' THEN 1 ELSE 0 END), 0) AS one_rm_count
          FROM pr_records
          WHERE deleted_at IS NULL AND SUBSTR(achieved_at, 1, 7) = ?
        `,
        row.month_key,
      ) ?? { record_count: 0, pr_count: 0, one_rm_count: 0 };

    const topMuscle =
      database.getFirstSync<{ muscle_group: MuscleGroup }>(
        `
          SELECT muscle_group
          FROM muscle_period_snapshots
          WHERE SUBSTR(period_key, 1, 7) = ?
          GROUP BY muscle_group
          ORDER BY SUM(sets_count) DESC
          LIMIT 1
        `,
        row.month_key,
      )?.muscle_group ?? null;

    const topExercise =
      database.getFirstSync<{ exercise_name: string }>(
        `
          SELECT e.name AS exercise_name
          FROM workout_exercises we
          JOIN workouts w ON w.id = we.workout_id
          JOIN exercises e ON e.id = we.exercise_id
          LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
          WHERE w.status = 'completed' AND SUBSTR(w.started_at, 1, 7) = ?
          GROUP BY e.id
          ORDER BY COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) DESC
          LIMIT 1
        `,
        row.month_key,
      )?.exercise_name ?? null;

    const snapshot = buildMonthlyReportSnapshot({
      monthKey: row.month_key,
      workouts: row.workouts,
      activeDays: row.active_days,
      totalVolume: row.total_volume,
      totalReps: row.total_reps,
      totalDurationSeconds: row.total_duration_seconds,
      recordCount: recordCounts.record_count ?? recordCounts.count ?? 0,
      prCount: recordCounts.pr_count ?? recordCounts.count ?? 0,
      oneRmCount: recordCounts.one_rm_count ?? 0,
      topMuscle,
      topExercise,
    });

    database.runSync(
      'INSERT INTO monthly_reports (month_key, payload_json, generated_at) VALUES (?, ?, ?)',
      row.month_key,
      JSON.stringify(snapshot),
      new Date().toISOString(),
    );
  });

  const yearlyBaseRows = database.getAllSync<{
    year_key: ReportYearKey;
    workouts: number;
    active_days: number;
    total_volume: number;
    total_reps: number;
    total_distance_meters: number;
    total_duration_seconds: number;
  }>(
    `
      SELECT
        SUBSTR(started_at, 1, 4) AS year_key,
        COUNT(*) AS workouts,
        COUNT(DISTINCT SUBSTR(started_at, 1, 10)) AS active_days,
        COALESCE(SUM(total_volume), 0) AS total_volume,
        COALESCE(SUM(total_reps), 0) AS total_reps,
        COALESCE(SUM(total_distance_meters), 0) AS total_distance_meters,
        COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
      FROM workouts
      WHERE status = 'completed'
      GROUP BY year_key
      ORDER BY year_key ASC
    `,
  );

  yearlyBaseRows.forEach((row) => {
    const recordCounts =
      database.getFirstSync<{ count?: number; record_count?: number; pr_count?: number; one_rm_count?: number }>(
        `
          SELECT
            COUNT(*) AS record_count,
            COALESCE(SUM(CASE WHEN record_type = 'pr' THEN 1 ELSE 0 END), 0) AS pr_count,
            COALESCE(SUM(CASE WHEN record_type = 'one_rm' THEN 1 ELSE 0 END), 0) AS one_rm_count
          FROM pr_records
          WHERE deleted_at IS NULL AND SUBSTR(achieved_at, 1, 4) = ?
        `,
        row.year_key,
      ) ?? { record_count: 0, pr_count: 0, one_rm_count: 0 };

    const dayKeys = database
      .getAllSync<{ day_key: string }>(
        `
          SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key
          FROM workouts
          WHERE status = 'completed' AND SUBSTR(started_at, 1, 4) = ?
          ORDER BY day_key ASC
        `,
        row.year_key,
      )
      .map((entry) => entry.day_key);

    const strongestExercise =
      database.getFirstSync<{ exercise_name: string }>(
        `
          SELECT e.name AS exercise_name
          FROM workout_exercises we
          JOIN workouts w ON w.id = we.workout_id
          JOIN exercises e ON e.id = we.exercise_id
          JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
          WHERE w.status = 'completed' AND SUBSTR(w.started_at, 1, 4) = ?
          GROUP BY e.id
          ORDER BY MAX(CASE
            WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * (1 + se.reps / 30.0)
            ELSE 0
          END) DESC
          LIMIT 1
        `,
        row.year_key,
      )?.exercise_name ?? null;

    const mostTrainedMuscle =
      database.getFirstSync<{ muscle_group: MuscleGroup }>(
        `
          SELECT muscle_group
          FROM muscle_period_snapshots
          WHERE SUBSTR(period_key, 1, 4) = ?
          GROUP BY muscle_group
          ORDER BY SUM(sets_count) DESC
          LIMIT 1
        `,
        row.year_key,
      )?.muscle_group ?? null;

    const monthlyVolume = database.getAllSync<{
      month_key: ReportMonthKey;
      total_volume: number;
      workouts: number;
    }>(
      `
        SELECT
          SUBSTR(started_at, 1, 7) AS month_key,
          COALESCE(SUM(total_volume), 0) AS total_volume,
          COUNT(*) AS workouts
        FROM workouts
        WHERE status = 'completed' AND SUBSTR(started_at, 1, 4) = ?
        GROUP BY month_key
        ORDER BY month_key ASC
      `,
      row.year_key,
    );

    const snapshot = buildYearInReviewSnapshot({
      yearKey: row.year_key,
      workouts: row.workouts,
      activeDays: row.active_days,
      totalVolume: row.total_volume,
      totalReps: row.total_reps,
      totalDistanceMeters: row.total_distance_meters,
      totalDurationSeconds: row.total_duration_seconds,
      recordCount: recordCounts.record_count ?? recordCounts.count ?? 0,
      prCount: recordCounts.pr_count ?? recordCounts.count ?? 0,
      oneRmCount: recordCounts.one_rm_count ?? 0,
      longestStreak: getLongestStreakFromDays(dayKeys),
      strongestExercise,
      mostTrainedMuscle,
      monthlyVolume: monthlyVolume.map((month) => ({
        monthKey: month.month_key,
        totalVolume: month.total_volume,
        workouts: month.workouts,
      })),
    });

    database.runSync(
      'INSERT INTO yearly_reviews (year_key, payload_json, generated_at) VALUES (?, ?, ?)',
      row.year_key,
      JSON.stringify(snapshot),
      new Date().toISOString(),
    );
  });
};

const ensureAnalyticsCaches = () => {
  initializeDatabase();

  const completedWorkouts = database.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workouts WHERE status = 'completed'`,
  )?.count;
  const cachedDays = database.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM analytics_daily')?.count;

  if ((completedWorkouts ?? 0) > 0 && (cachedDays ?? 0) === 0) {
    refreshAnalyticsCaches();
  }
};

export const getOverviewAnalyticsSnapshot = (
  period: AnalyticsPeriod,
  options?: { month?: Date },
): OverviewAnalyticsSnapshot => {
  ensureAnalyticsCaches();

  const current = getAggregateForPeriod(period);
  const previous = getPreviousAggregateForPeriod(period);
  const dayKeys = getCompletedWorkoutDays();
  const weekStartsOn = getIdentitySnapshot().preferences?.weekStartsOn ?? 1;

  let calendarRange: string[];
  let alignedCalendarWeeks: { startDayKey: string; endDayKey: string; dayKeys: string[] }[];

  if (options?.month) {
    alignedCalendarWeeks = getMonthCalendarWeeks(options.month, weekStartsOn);
    calendarRange = alignedCalendarWeeks.flatMap((week) => week.dayKeys);
  } else {
    calendarRange = getCalendarDayRange(period);
    alignedCalendarWeeks = getAlignedCalendarWeeks(weekStartsOn);
  }

  const calendarStartDayKey = alignedCalendarWeeks[0]?.startDayKey ?? calendarRange[0];
  const calendarEndDayKey =
    alignedCalendarWeeks[alignedCalendarWeeks.length - 1]?.endDayKey ?? calendarRange[calendarRange.length - 1];

  const dailyRows = new Map(
    database
      .getAllSync<{ day_key: string; workouts_count: number; total_volume: number }>(
        `
          SELECT day_key, workouts_count, total_volume
          FROM analytics_daily
          WHERE day_key BETWEEN ? AND ?
        `,
        calendarStartDayKey,
        calendarEndDayKey,
      )
      .map((row) => [row.day_key, row]),
  );

  const activeWorkout = getActiveWorkout();
  const topExercises = getTopExercises(period);
  const recentRecords = getRecentRecords(period);
  const muscleDistribution = getMuscleDistribution(period);

  return {
    period,
    summary: {
      completedWorkouts: current.workouts_count,
      totalVolume: current.total_volume,
      totalReps: current.total_reps,
      totalDistanceMeters: current.total_distance_meters,
      totalDurationSeconds: current.total_duration_seconds,
      activeDays: calendarRange.filter((dayKey) => (dailyRows.get(dayKey)?.workouts_count ?? 0) > 0).length,
      streak: getCurrentStreakFromDays(dayKeys),
      averageVolumePerWorkout: current.workouts_count > 0 ? current.total_volume / current.workouts_count : 0,
      recordCount: current.record_count ?? current.pr_count ?? 0,
      prCount: current.pr_count ?? 0,
      oneRmCount: current.one_rm_count ?? 0,
      totalPrs: current.pr_count,
    },
    comparison: {
      workoutsDelta: current.workouts_count - previous.workouts_count,
      volumeDelta: current.total_volume - previous.total_volume,
      repsDelta: current.total_reps - previous.total_reps,
      workoutsDeltaPercent: calculatePercentageDelta(current.workouts_count, previous.workouts_count),
      volumeDeltaPercent: calculatePercentageDelta(current.total_volume, previous.total_volume),
      repsDeltaPercent: calculatePercentageDelta(current.total_reps, previous.total_reps),
    },
    calendar: calendarRange.map((dayKey) => ({
      dayKey,
      workoutsCount: dailyRows.get(dayKey)?.workouts_count ?? 0,
      totalVolume: dailyRows.get(dayKey)?.total_volume ?? 0,
    })),
    calendarWeeks: alignedCalendarWeeks.map((week) => ({
      startDayKey: week.startDayKey,
      endDayKey: week.endDayKey,
      days: week.dayKeys.map((dayKey) => ({
        dayKey,
        workoutsCount: dailyRows.get(dayKey)?.workouts_count ?? 0,
        totalVolume: dailyRows.get(dayKey)?.total_volume ?? 0,
      })),
    })),
    muscleDistribution: muscleDistribution.map((row) => ({
      muscle: row.muscle,
      sets: row.sets,
      percentage: row.percentage,
      previousSets: row.previousSets,
    })),
    topExercises: topExercises.map((exercise) => ({
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise_name,
      sessions: exercise.sessions,
      totalVolume: exercise.total_volume,
      bestWeight: exercise.best_weight,
    })),
    recentRecords: recentRecords.map((pr) => ({
      id: pr.id,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      deletedAt: pr.deleted_at,
      version: pr.version,
      schemaVersion: pr.schema_version,
      remoteId: pr.remote_id,
      syncState: pr.sync_state as OverviewAnalyticsSnapshot['recentPrs'][number]['syncState'],
      lastExportedAt: pr.last_exported_at,
      originDeviceId: pr.origin_device_id,
      exerciseId: pr.exercise_id,
      workoutId: pr.workout_id,
      setEntryId: pr.set_entry_id,
      recordType: pr.record_type ?? (pr.metric === 'estimated_1rm' ? 'one_rm' : 'pr'),
      metric: pr.metric,
      value: pr.value,
      achievedAt: pr.achieved_at,
      exerciseName: pr.exercise_name,
    })),
    recentPrs: recentRecords.map((pr) => ({
      id: pr.id,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      deletedAt: pr.deleted_at,
      version: pr.version,
      schemaVersion: pr.schema_version,
      remoteId: pr.remote_id,
      syncState: pr.sync_state as OverviewAnalyticsSnapshot['recentPrs'][number]['syncState'],
      lastExportedAt: pr.last_exported_at,
      originDeviceId: pr.origin_device_id,
      exerciseId: pr.exercise_id,
      workoutId: pr.workout_id,
      setEntryId: pr.set_entry_id,
      recordType: pr.record_type ?? (pr.metric === 'estimated_1rm' ? 'one_rm' : 'pr'),
      metric: pr.metric,
      value: pr.value,
      achievedAt: pr.achieved_at,
      exerciseName: pr.exercise_name,
    })),
    activeWorkout: activeWorkout ? mapWorkoutRow(activeWorkout) : null,
    lastClosedMonthKey: getCachedMonthKeys()[0]?.month_key ?? getLastClosedMonthKey(),
    currentYearKey: getCachedYearKeys().slice(-1)[0]?.year_key ?? getYearKey(new Date()),
  };
};

export const listExerciseAnalytics = (period: AnalyticsPeriod): ExerciseAnalyticsSnapshot[] => {
  ensureAnalyticsCaches();

  const params: (string | number)[] = [];
  const clause = buildPeriodClause('w.started_at', period, params);

  const rows = database.getAllSync<{
    exercise_id: string;
    exercise_name: string;
    muscle_group: MuscleGroup;
    latest_performed_at: string;
    sessions: number;
    total_volume: number;
    total_reps: number;
    best_weight: number;
    best_estimated_1rm: number;
    best_set_volume: number;
    longest_duration_seconds: number;
    longest_distance_meters: number;
    best_pace_mpm: number;
  }>(
    `
      SELECT
        e.id AS exercise_id,
        e.name AS exercise_name,
        e.muscle_group,
        MAX(w.started_at) AS latest_performed_at,
        COUNT(DISTINCT w.id) AS sessions,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(SUM(se.reps), 0) AS total_reps,
        COALESCE(MAX(se.weight_kg), 0) AS best_weight,
        COALESCE(MAX(CASE
          WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * (1 + se.reps / 30.0)
          ELSE 0
        END), 0) AS best_estimated_1rm,
        COALESCE(MAX(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS best_set_volume,
        COALESCE(MAX(se.duration_seconds), 0) AS longest_duration_seconds,
        COALESCE(MAX(se.distance_meters), 0) AS longest_distance_meters,
        COALESCE(MAX(CASE
          WHEN se.distance_meters IS NOT NULL AND se.duration_seconds IS NOT NULL AND se.duration_seconds > 0
            THEN (se.distance_meters / se.duration_seconds) * 60
          ELSE 0
        END), 0) AS best_pace_mpm
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      JOIN exercises e ON e.id = we.exercise_id
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
      WHERE w.status = 'completed'
      ${clause}
      GROUP BY e.id
      ORDER BY latest_performed_at DESC, total_volume DESC, sessions DESC
    `,
    ...params,
  );

  const historyParams: (string | number)[] = [];
  const historyClause = buildPeriodClause('w.started_at', period, historyParams);
  const historyRows = database.getAllSync<{
    exercise_id: string;
    day_key: string;
    total_volume: number;
    total_reps: number;
    best_weight: number;
  }>(
    `
      SELECT
        e.id AS exercise_id,
        SUBSTR(w.started_at, 1, 10) AS day_key,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(SUM(se.reps), 0) AS total_reps,
        COALESCE(MAX(se.weight_kg), 0) AS best_weight
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      JOIN exercises e ON e.id = we.exercise_id
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
      WHERE w.status = 'completed'
      ${historyClause}
      GROUP BY e.id, day_key
      ORDER BY day_key DESC
    `,
    ...historyParams,
  );

  const historyByExercise = new Map<string, ExerciseAnalyticsSnapshot['history']>();
  historyRows.forEach((row) => {
    const entries = historyByExercise.get(row.exercise_id) ?? [];
    if (entries.length < 6) {
      entries.push({
        dayKey: row.day_key,
        totalVolume: row.total_volume,
        totalReps: row.total_reps,
        bestWeight: row.best_weight,
      });
      historyByExercise.set(row.exercise_id, entries);
    }
  });

  const sessionRows = database.getAllSync<{
    exercise_id: string;
    best_session_volume: number;
  }>(
    `
      SELECT
        session_totals.exercise_id,
        MAX(session_totals.session_volume) AS best_session_volume
      FROM (
        SELECT
          e.id AS exercise_id,
          w.id AS workout_id,
          COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS session_volume
        FROM workout_exercises we
        JOIN workouts w ON w.id = we.workout_id
        JOIN exercises e ON e.id = we.exercise_id
        LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
        WHERE w.status = 'completed'
        ${historyClause}
        GROUP BY e.id, w.id
      ) AS session_totals
      GROUP BY session_totals.exercise_id
    `,
    ...historyParams,
  );

  const bestSessionVolumeByExercise = new Map(sessionRows.map((row) => [row.exercise_id, row.best_session_volume]));

  const recordRows = database.getAllSync<{
    exercise_id: string;
    metric: RecordMetric;
    value: number;
  }>(
    `
      SELECT exercise_id, metric, MAX(value) AS value
      FROM pr_records
      WHERE deleted_at IS NULL
      GROUP BY exercise_id, metric
    `,
  );

  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    muscleGroup: row.muscle_group,
    latestPerformedAt: row.latest_performed_at,
    sessions: row.sessions,
    totalVolume: row.total_volume,
    totalReps: row.total_reps,
    bestWeight: row.best_weight,
    bestEstimated1Rm: row.best_estimated_1rm,
    bestSetVolume: row.best_set_volume,
    bestSessionVolume: bestSessionVolumeByExercise.get(row.exercise_id) ?? 0,
    longestDurationSeconds: row.longest_duration_seconds,
    longestDistanceMeters: row.longest_distance_meters,
    bestPaceMetersPerMinute: estimateBestPaceMetersPerMinute(row.longest_distance_meters, row.longest_duration_seconds)
      ? row.best_pace_mpm
      : row.best_pace_mpm,
    records: recordRows
      .filter((record) => record.exercise_id === row.exercise_id)
      .reduce<Partial<Record<RecordMetric, number>>>((accumulator, record) => {
        accumulator[record.metric] = record.value;
        return accumulator;
      }, {}),
    history: historyByExercise.get(row.exercise_id) ?? [],
  }));
};

export const getMuscleAnalyticsSnapshot = (period: AnalyticsPeriod): MuscleAnalyticsSnapshot => {
  const muscles = getMuscleDistribution(period);

  return {
    period,
    muscles: muscles.map((row) => ({
      muscle: row.muscle,
      sets: row.sets,
      totalVolume: row.totalVolume,
      percentage: row.percentage,
      previousSets: row.previousSets,
      deltaSets: row.sets - row.previousSets,
    })),
  };
};

export const getBodyProgressSnapshot = (period: AnalyticsPeriod): BodyProgressSnapshot => {
  ensureAnalyticsCaches();

  const timeline = listBodyMeasurementsWithContext(period);
  const latestWeight = timeline.find((entry) => entry.weightKg != null)?.weightKg ?? null;
  const earliestWeight = [...timeline].reverse().find((entry) => entry.weightKg != null)?.weightKg ?? null;
  const window = getPeriodWindow(period);

  const aggregate = getAggregateForPeriod(period);
  const daysInWindow = window.startDayKey
    ? Math.max(1, getCalendarDayRange(period).length / 7)
    : Math.max(1, Math.ceil(Math.max(timeline.length, 1) / 4));

  return {
    period,
    summary: {
      entries: timeline.length,
      latestWeightKg: latestWeight,
      weightChangeKg: latestWeight != null && earliestWeight != null ? latestWeight - earliestWeight : null,
      averageWeeklyWorkouts: aggregate.workouts_count / daysInWindow,
      averageWeeklyVolume: aggregate.total_volume / daysInWindow,
    },
    timeline,
  };
};

export const listAvailableMonthlyReports = () =>
  getCachedMonthKeys().map((row) => row.month_key);

export const listAvailableYearInReviewKeys = () =>
  getCachedYearKeys().map((row) => row.year_key);

export const getMonthlyReport = (monthKey?: ReportMonthKey | null): MonthlyReportSnapshot | null => {
  ensureAnalyticsCaches();

  const targetKey = monthKey ?? getCachedMonthKeys()[0]?.month_key ?? null;
  if (!targetKey) {
    return null;
  }

  const row = database.getFirstSync<{ payload_json: string }>(
    'SELECT payload_json FROM monthly_reports WHERE month_key = ?',
    targetKey,
  );

  return row ? (JSON.parse(row.payload_json) as MonthlyReportSnapshot) : null;
};

export const getYearInReview = (yearKey?: ReportYearKey | null): YearInReviewSnapshot | null => {
  ensureAnalyticsCaches();

  const targetKey = yearKey ?? getCachedYearKeys().slice(-1)[0]?.year_key ?? null;
  if (!targetKey) {
    return null;
  }

  const row = database.getFirstSync<{ payload_json: string }>(
    'SELECT payload_json FROM yearly_reviews WHERE year_key = ?',
    targetKey,
  );

  return row ? (JSON.parse(row.payload_json) as YearInReviewSnapshot) : null;
};

export const getDashboardSnapshot = (): DashboardSnapshot => {
  const overview = getOverviewAnalyticsSnapshot('all');

  return {
    totals: {
      completedWorkouts: overview.summary.completedWorkouts,
      totalVolume: overview.summary.totalVolume,
      totalReps: overview.summary.totalReps,
      streak: overview.summary.streak,
      last7Days: getAggregateForPeriod('7d').workouts_count,
    },
    weeklyFrequency: lastNDays(7).map((dayKey) => ({
      day: dayKey.slice(5),
      count: overview.calendar.find((entry) => entry.dayKey === dayKey)?.workoutsCount ?? 0,
    })),
    muscleDistribution: overview.muscleDistribution.map((item) => ({
      muscle: item.muscle,
      sets: item.sets,
    })),
    recentRecords: overview.recentRecords,
    recentPrs: overview.recentRecords,
    topExercises: overview.topExercises.map((exercise) => ({
      exerciseName: exercise.exerciseName,
      sessions: exercise.sessions,
      totalVolume: exercise.totalVolume,
    })),
    activeWorkout: overview.activeWorkout,
  };
};

export const getAnalyticsSummaryCards = (period: AnalyticsPeriod) => {
  const overview = getOverviewAnalyticsSnapshot(period);

  return [
    {
      label: 'Workouts',
      value: String(overview.summary.completedWorkouts),
      hint: `${overview.comparison.workoutsDelta >= 0 ? '+' : ''}${overview.comparison.workoutsDelta} vs janela anterior`,
    },
    {
      label: 'Volume',
      value: `${Math.round(overview.summary.totalVolume)} kg`,
      hint: `${overview.comparison.volumeDelta >= 0 ? '+' : ''}${Math.round(overview.comparison.volumeDelta)} kg`,
    },
    {
      label: 'Duracao',
      value: formatDuration(overview.summary.totalDurationSeconds),
      hint: `${overview.summary.streak} dias de streak`,
    },
  ];
};

export const getLatestClosedMonthKey = () =>
  getMonthlyReport(getLastClosedMonthKey())?.monthKey ?? null;

export const getCurrentYearKey = () => {
  const years = listAvailableYearInReviewKeys();
  return years[years.length - 1] ?? getYearKey(new Date());
};

export const getMonthlyReportKeysForYear = (yearKey: ReportYearKey) =>
  listAvailableMonthlyReports().filter((monthKey) => monthKey.startsWith(yearKey));

export const getWorkoutCorrelationForDay = (dayKey: string) =>
  database.getFirstSync<{
    workouts_count: number;
    total_volume: number;
  }>(
    `
      SELECT workouts_count, total_volume
      FROM analytics_daily
      WHERE day_key = ?
    `,
    dayKey,
  );

export const getExerciseHistoryForDay = (exerciseId: string) =>
  database.getAllSync<{
    day_key: string;
    total_volume: number;
    total_reps: number;
    best_weight: number;
  }>(
    `
      SELECT
        SUBSTR(w.started_at, 1, 10) AS day_key,
        COALESCE(SUM(CASE WHEN se.weight_kg IS NOT NULL AND se.reps IS NOT NULL THEN se.weight_kg * se.reps ELSE 0 END), 0) AS total_volume,
        COALESCE(SUM(se.reps), 0) AS total_reps,
        COALESCE(MAX(se.weight_kg), 0) AS best_weight
      FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      LEFT JOIN set_entries se ON se.workout_exercise_id = we.id AND se.is_completed = 1
      WHERE w.status = 'completed' AND we.exercise_id = ?
      GROUP BY day_key
      ORDER BY day_key DESC
      LIMIT 12
    `,
    exerciseId,
  );

export const getMonthKeyForWorkout = (startedAt: string) => getMonthKey(startedAt);
