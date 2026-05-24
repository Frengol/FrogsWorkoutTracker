jest.mock('@/src/shared/db/database', () => ({
  database: {
    execSync: jest.fn(),
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  },
  initializeDatabase: jest.fn(),
}));

jest.mock('@/src/modules/measurements/service', () => ({
  listBodyMeasurementsWithContext: jest.fn(),
}));

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(() => ({
    preferences: {
      weekStartsOn: 1,
    },
  })),
}));

import {
  getAnalyticsSummaryCards,
  getBodyProgressSnapshot,
  getCurrentYearKey,
  getDashboardSnapshot,
  getExerciseHistoryForDay,
  getLatestClosedMonthKey,
  getMonthKeyForWorkout,
  getMonthlyReport,
  getMonthlyReportKeysForYear,
  getMuscleAnalyticsSnapshot,
  getOverviewAnalyticsSnapshot,
  getWorkoutCorrelationForDay,
  getYearInReview,
  listExerciseAnalytics,
  refreshAnalyticsCaches,
} from '@/src/modules/progress/service';
import { listBodyMeasurementsWithContext } from '@/src/modules/measurements/service';
import { database } from '@/src/shared/db/database';

const installCachedAnalyticsMocks = () => {
  (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
    if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
      return { count: 4 };
    }

    if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
      return { count: 2 };
    }

    if (sql.includes('FROM analytics_daily') && sql.includes('WHERE 1 = 1')) {
      return {
        workouts_count: 4,
        total_volume: 1800,
        total_reps: 72,
        total_distance_meters: 1500,
        total_duration_seconds: 3600,
        pr_count: 3,
      };
    }

    if (sql.includes('WHERE day_key BETWEEN ? AND ?')) {
      return {
        workouts_count: 2,
        total_volume: 900,
        total_reps: 36,
        total_distance_meters: 500,
        total_duration_seconds: 1800,
        pr_count: 1,
      };
    }

    if (sql.includes('SELECT payload_json FROM monthly_reports WHERE month_key = ?')) {
      return {
        payload_json: JSON.stringify({
          monthKey: '2026-03',
          label: 'Março 2026',
          summary: {
            workouts: 12,
            activeDays: 8,
            totalVolume: 22000,
            totalReps: 900,
            totalDurationSeconds: 7200,
            prCount: 5,
            topMuscle: 'peito',
            topExercise: 'Supino reto',
          },
        }),
      };
    }

    if (sql.includes('SELECT payload_json FROM yearly_reviews WHERE year_key = ?')) {
      return {
        payload_json: JSON.stringify({
          yearKey: '2026',
          summary: {
            workouts: 80,
            activeDays: 52,
            totalVolume: 180000,
            prCount: 20,
            totalReps: 9800,
            totalDistanceMeters: 1500,
            totalDurationSeconds: 90000,
            longestStreak: 7,
            strongestExercise: 'Levantamento terra',
            mostTrainedMuscle: 'costas',
          },
          monthlyVolume: [{ monthKey: '2026-03', totalVolume: 22000, workouts: 12 }],
        }),
      };
    }

    if (sql.includes('FROM analytics_daily') && sql.includes('WHERE day_key = ?')) {
      return { workouts_count: 1, total_volume: 450 };
    }

    return null;
  });

  (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
    if (sql.includes('SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key') && sql.includes('ORDER BY day_key DESC')) {
      return [{ day_key: '2026-03-26' }, { day_key: '2026-03-25' }, { day_key: '2026-03-20' }];
    }

    if (sql.includes('SELECT day_key, workouts_count, total_volume') && sql.includes('FROM analytics_daily')) {
      return [
        { day_key: '2026-03-20', workouts_count: 1, total_volume: 300 },
        { day_key: '2026-03-25', workouts_count: 1, total_volume: 450 },
        { day_key: '2026-03-26', workouts_count: 2, total_volume: 1050 },
      ];
    }

    if (sql.includes('FROM muscle_period_snapshots') && sql.includes('ORDER BY sets DESC')) {
      return [{ muscle_group: 'chest', sets: 8, total_volume: 1200 }];
    }

    if (sql.includes('FROM muscle_period_snapshots') && sql.includes('WHERE period_key BETWEEN ? AND ?')) {
      return [{ muscle_group: 'chest', sets: 5 }];
    }

    if (sql.includes('FROM pr_records pr')) {
      return [
        {
          id: 'pr-1',
          created_at: '2026-03-26T10:00:00.000Z',
          updated_at: '2026-03-26T10:00:00.000Z',
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
          metric: 'weight',
          value: 80,
          achieved_at: '2026-03-26T10:00:00.000Z',
          exercise_name: 'Supino reto',
        },
      ];
    }

    if (sql.includes('ORDER BY total_volume DESC, sessions DESC') && sql.includes('FROM workout_exercises we') && !sql.includes('best_estimated_1rm')) {
      return [
        {
          exercise_id: 'exercise-1',
          exercise_name: 'Supino reto',
          sessions: 4,
          total_volume: 1800,
          best_weight: 80,
        },
      ];
    }

    if (sql.includes('best_estimated_1rm')) {
      return [
        {
          exercise_id: 'exercise-1',
          exercise_name: 'Supino reto',
          muscle_group: 'chest',
          latest_performed_at: '2026-03-26T10:00:00.000Z',
          sessions: 4,
          total_volume: 1800,
          total_reps: 72,
          best_weight: 80,
          best_estimated_1rm: 93.3,
          best_set_volume: 720,
          longest_duration_seconds: 90,
          longest_distance_meters: 0,
          best_pace_mpm: 0,
        },
      ];
    }

    if (sql.includes('GROUP BY e.id, day_key')) {
      return [
        {
          exercise_id: 'exercise-1',
          day_key: '2026-03-26',
          total_volume: 900,
          total_reps: 36,
          best_weight: 80,
          total_duration_seconds: 0,
          total_distance_meters: 0,
          best_pace_mpm: 0,
        },
        {
          exercise_id: 'exercise-1',
          day_key: '2026-03-20',
          total_volume: 600,
          total_reps: 24,
          best_weight: 70,
          total_duration_seconds: 0,
          total_distance_meters: 0,
          best_pace_mpm: 0,
        },
      ];
    }

    if (sql.includes('best_session_volume')) {
      return [{ exercise_id: 'exercise-1', best_session_volume: 900 }];
    }

    if (sql.includes('SELECT exercise_id, metric, MAX(value) AS value')) {
      return [
        { exercise_id: 'exercise-1', metric: 'weight', value: 80 },
        { exercise_id: 'exercise-1', metric: 'volume', value: 900 },
      ];
    }

    if (sql.includes('SELECT month_key FROM monthly_reports')) {
      return [{ month_key: '2026-02' }, { month_key: '2026-03' }];
    }

    if (sql.includes('SELECT year_key FROM yearly_reviews')) {
      return [{ year_key: '2025' }, { year_key: '2026' }];
    }

    if (sql.includes('WHERE w.status = \'completed\' AND we.exercise_id = ?')) {
      return [{ day_key: '2026-03-26', total_volume: 900, total_reps: 36, best_weight: 80 }];
    }

    if (sql.includes('SELECT *') && sql.includes('FROM workouts') && sql.includes("status IN ('draft', 'in_progress')")) {
      return [];
    }

    return [];
  });

  (listBodyMeasurementsWithContext as jest.Mock).mockReturnValue([
    {
      id: 'measurement-2',
      recordedAt: '2026-03-27T10:00:00.000Z',
      weightKg: 82,
    },
    {
      id: 'measurement-1',
      recordedAt: '2026-03-20T10:00:00.000Z',
      weightKg: 80.5,
    },
  ]);
};

describe('progress service phase 2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes cached analytics tables from completed workout data', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SUBSTR(achieved_at, 1, 10) AS day_key') && sql.includes('COUNT(*) AS record_count')) {
        return [{ day_key: '2026-03-26', record_count: 2, pr_count: 1, one_rm_count: 1 }];
      }

      if (sql.includes('COUNT(*) AS workouts_count') && sql.includes('GROUP BY day_key')) {
        return [
          {
            day_key: '2026-03-26',
            workouts_count: 1,
            total_volume: 900,
            total_reps: 36,
            total_distance_meters: 0,
            total_duration_seconds: 1200,
            last_workout_at: '2026-03-26T10:00:00.000Z',
          },
        ];
      }

      if (sql.includes('COUNT(se.id) AS sets_count')) {
        return [{ period_key: '2026-03-26', muscle_group: 'chest', sets_count: 3, total_volume: 900 }];
      }

      if (sql.includes('SUBSTR(started_at, 1, 7) AS month_key')) {
        return [
          {
            month_key: '2026-03',
            workouts: 4,
            active_days: 3,
            total_volume: 1800,
            total_reps: 72,
            total_duration_seconds: 3600,
          },
        ];
      }

      if (sql.includes('SUBSTR(started_at, 1, 4) AS year_key')) {
        return [
          {
            year_key: '2026',
            workouts: 4,
            active_days: 3,
            total_volume: 1800,
            total_reps: 72,
            total_distance_meters: 0,
            total_duration_seconds: 3600,
          },
        ];
      }

      if (sql.includes('ORDER BY day_key ASC') && sql.includes('SUBSTR(started_at, 1, 4) = ?')) {
        return [{ day_key: '2026-03-20' }, { day_key: '2026-03-26' }];
      }

      if (sql.includes('GROUP BY month_key') && sql.includes('SUBSTR(started_at, 1, 4) = ?')) {
        return [{ month_key: '2026-03', total_volume: 1800, workouts: 4 }];
      }

      return [];
    });

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM pr_records') && sql.includes('SUBSTR(achieved_at, 1, 7)')) {
        return { count: 1 };
      }
      if (sql.includes('FROM muscle_period_snapshots') && sql.includes('SUM(sets_count) DESC')) {
        return { muscle_group: 'chest' };
      }
      if (sql.includes('FROM workout_exercises we') && sql.includes('ORDER BY COALESCE(SUM')) {
        return { exercise_name: 'Supino reto' };
      }
      if (sql.includes('FROM pr_records') && sql.includes('SUBSTR(achieved_at, 1, 4)')) {
        return { count: 2 };
      }
      if (sql.includes('ORDER BY MAX(CASE')) {
        return { exercise_name: 'Levantamento terra' };
      }
      if (sql.includes('FROM muscle_period_snapshots') && sql.includes('SUBSTR(period_key, 1, 4) = ?')) {
        return { muscle_group: 'back' };
      }
      return null;
    });

    refreshAnalyticsCaches();

    expect(database.execSync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM analytics_daily;'));
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO analytics_daily'),
      '2026-03-26',
      1,
      900,
      36,
      0,
      1200,
      2,
      1,
      1,
      '2026-03-26T10:00:00.000Z',
    );
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO muscle_period_snapshots'),
      '2026-03-26-chest',
      '2026-03-26',
      'chest',
      3,
      900,
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'INSERT INTO monthly_reports (month_key, payload_json, generated_at) VALUES (?, ?, ?)',
      '2026-03',
      expect.stringContaining('"topExercise":"Supino reto"'),
      expect.any(String),
    );
    expect(database.runSync).toHaveBeenCalledWith(
      'INSERT INTO yearly_reviews (year_key, payload_json, generated_at) VALUES (?, ?, ?)',
      '2026',
      expect.stringContaining('"strongestExercise":"Levantamento terra"'),
      expect.any(String),
    );

    const topExerciseQuery = (database.getFirstSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('ORDER BY COALESCE(SUM'),
    );
    const strongestExerciseQuery = (database.getFirstSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('ORDER BY MAX(CASE'),
    );

    expect(String(topExerciseQuery?.[0])).not.toContain('LEFT JOIN set_entries se');
    expect(String(topExerciseQuery?.[0])).toContain(
      'JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1',
    );
    expect(String(strongestExerciseQuery?.[0])).toContain(
      'JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1',
    );
  });

  it('builds exercise, muscle, body and dashboard snapshots from cached analytics', () => {
    installCachedAnalyticsMocks();
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("status IN ('draft', 'in_progress')")) {
        return {
          id: 'workout-1',
          created_at: '2026-03-26T09:00:00.000Z',
          updated_at: '2026-03-26T09:10:00.000Z',
          deleted_at: null,
          version: 1,
          schema_version: 3,
          remote_id: null,
          sync_state: 'local_only',
          last_exported_at: null,
          origin_device_id: 'device-1',
          routine_id: null,
          title: 'Treino em andamento',
          status: 'in_progress',
          source: 'manual',
          started_at: '2026-03-26T09:00:00.000Z',
          ended_at: null,
          duration_seconds: 600,
          general_note: null,
          total_volume: 100,
          total_reps: 10,
          total_distance_meters: 0,
        };
      }

      if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
        return { count: 4 };
      }

      if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
        return { count: 2 };
      }

      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE 1 = 1')) {
        return {
          workouts_count: 4,
          total_volume: 1800,
          total_reps: 72,
          total_distance_meters: 1500,
          total_duration_seconds: 3600,
          pr_count: 3,
        };
      }

      if (sql.includes('WHERE day_key BETWEEN ? AND ?')) {
        return {
          workouts_count: 2,
          total_volume: 900,
          total_reps: 36,
          total_distance_meters: 500,
          total_duration_seconds: 1800,
          pr_count: 1,
        };
      }

      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE day_key = ?')) {
        return { workouts_count: 1, total_volume: 450 };
      }

      if (sql.includes('SELECT payload_json FROM monthly_reports WHERE month_key = ?')) {
        return {
          payload_json: JSON.stringify({
            monthKey: '2026-03',
            summary: { topExercise: 'Supino reto' },
          }),
        };
      }

      if (sql.includes('SELECT payload_json FROM yearly_reviews WHERE year_key = ?')) {
        return {
          payload_json: JSON.stringify({
            yearKey: '2026',
            summary: { strongestExercise: 'Levantamento terra' },
          }),
        };
      }

      return null;
    });

    const exercises = listExerciseAnalytics('30d');
    const muscle = getMuscleAnalyticsSnapshot('30d');
    const body = getBodyProgressSnapshot('all');
    const dashboard = getDashboardSnapshot();
    const cards = getAnalyticsSummaryCards('30d');

    expect(exercises[0]).toEqual(
      expect.objectContaining({
        exerciseId: 'exercise-1',
        latestPerformedAt: '2026-03-26T10:00:00.000Z',
        bestSessionVolume: 900,
        records: expect.objectContaining({ weight: 80, volume: 900 }),
        history: expect.arrayContaining([
          expect.objectContaining({ dayKey: '2026-03-26', totalVolume: 900 }),
        ]),
      }),
    );
    const exerciseQuery = (database.getAllSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('best_estimated_1rm'),
    );
    expect(String(exerciseQuery?.[0])).toContain('ORDER BY latest_performed_at DESC, total_volume DESC, sessions DESC');
    expect(String(exerciseQuery?.[0])).not.toContain('LEFT JOIN set_entries se');
    expect(String(exerciseQuery?.[0])).toContain(
      'JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1',
    );
    const exerciseHistoryQuery = (database.getAllSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('GROUP BY e.id, day_key'),
    );
    const bestSessionQuery = (database.getAllSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('best_session_volume'),
    );
    expect(String(exerciseHistoryQuery?.[0])).not.toContain('LEFT JOIN set_entries se');
    expect(String(exerciseHistoryQuery?.[0])).toContain(
      'JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1',
    );
    expect(String(bestSessionQuery?.[0])).not.toContain('LEFT JOIN set_entries se');
    expect(String(bestSessionQuery?.[0])).toContain(
      'JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1',
    );
    expect(muscle.muscles[0]).toEqual(
      expect.objectContaining({
        muscle: 'chest',
        deltaSets: 3,
      }),
    );
    expect(body.summary).toEqual(
      expect.objectContaining({
        entries: 2,
        latestWeightKg: 82,
        weightChangeKg: 1.5,
      }),
    );
    expect(dashboard.totals).toEqual(
      expect.objectContaining({
        completedWorkouts: 4,
        totalVolume: 1800,
        streak: 0,
        last7Days: 4,
      }),
    );
    expect(dashboard.activeWorkout?.title).toBe('Treino em andamento');
    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Workouts', value: '4' }),
        expect.objectContaining({ label: 'Volume', value: '1800 kg' }),
      ]),
    );
  });

  it('reads report helpers, correlations and null fallbacks', () => {
    installCachedAnalyticsMocks();

    expect(getMonthlyReport('2026-03')?.summary.topExercise).toBe('Supino reto');
    expect(getYearInReview('2026')?.summary.strongestExercise).toBe('Levantamento terra');
    expect(getLatestClosedMonthKey()).toBe('2026-03');
    expect(getCurrentYearKey()).toBe('2026');
    expect(getMonthlyReportKeysForYear('2026')).toEqual(['2026-02', '2026-03']);
    expect(getWorkoutCorrelationForDay('2026-03-26')).toEqual({ workouts_count: 1, total_volume: 450 });
    expect(getExerciseHistoryForDay('exercise-1')).toEqual([
      { day_key: '2026-03-26', total_volume: 900, total_reps: 36, best_weight: 80 },
    ]);
    const exerciseHistoryForDayQuery = (database.getAllSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('WHERE w.status = \'completed\' AND we.exercise_id = ?'),
    );
    expect(String(exerciseHistoryForDayQuery?.[0])).not.toContain('LEFT JOIN set_entries se');
    expect(String(exerciseHistoryForDayQuery?.[0])).toContain(
      'JOIN set_entries se ON se.workout_exercise_id = we.id AND se.deleted_at IS NULL AND se.is_completed = 1',
    );
    expect(getMonthKeyForWorkout('2026-03-26T09:00:00.000Z')).toBe('2026-03');

    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT month_key FROM monthly_reports')) {
        return [];
      }
      if (sql.includes('SELECT year_key FROM yearly_reviews')) {
        return [];
      }
      return [];
    });
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
        return { count: 0 };
      }
      if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
        return { count: 0 };
      }
      return null;
    });

    expect(getMonthlyReport(null)).toBeNull();
    expect(getYearInReview(null)).toBeNull();
  });

  it('falls back cleanly when cached exercise history, reports and active workout are missing', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
        return { count: 0 };
      }
      if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
        return { count: 0 };
      }
      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE 1 = 1')) {
        return {
          workouts_count: 0,
          total_volume: 0,
          total_reps: 0,
          total_distance_meters: 0,
          total_duration_seconds: 0,
          pr_count: 0,
        };
      }
      if (sql.includes('WHERE day_key BETWEEN ? AND ?')) {
        return {
          workouts_count: 0,
          total_volume: 0,
          total_reps: 0,
          total_distance_meters: 0,
          total_duration_seconds: 0,
          pr_count: 0,
        };
      }
      if (sql.includes('SELECT payload_json FROM monthly_reports WHERE month_key = ?')) {
        return null;
      }
      if (sql.includes('SELECT payload_json FROM yearly_reviews WHERE year_key = ?')) {
        return null;
      }
      return null;
    });

    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key')) {
        return [];
      }
      if (sql.includes('SELECT day_key, workouts_count, total_volume') && sql.includes('FROM analytics_daily')) {
        return [];
      }
      if (sql.includes('FROM muscle_period_snapshots')) {
        return [];
      }
      if (sql.includes('FROM pr_records pr')) {
        return [];
      }
      if (sql.includes('best_estimated_1rm')) {
        return [
          {
            exercise_id: 'exercise-9',
            exercise_name: 'Air Bike',
            muscle_group: 'cardio',
            latest_performed_at: '2026-03-27T10:00:00.000Z',
            sessions: 1,
            total_volume: 0,
            total_reps: 0,
            best_weight: 0,
            best_estimated_1rm: 0,
            best_set_volume: 0,
            longest_duration_seconds: 0,
            longest_distance_meters: 0,
            best_pace_mpm: 0,
          },
        ];
      }
      if (sql.includes('GROUP BY e.id, day_key')) {
        return [
          {
            exercise_id: 'exercise-pace-1',
            day_key: '2026-03-26',
            total_volume: 0,
            total_reps: 0,
            best_weight: 0,
            total_duration_seconds: 120,
            total_distance_meters: 600,
            best_pace_mpm: 300,
          },
        ];
      }
      if (sql.includes('best_session_volume')) {
        return [];
      }
      if (sql.includes('SELECT exercise_id, metric, MAX(value) AS value')) {
        return [];
      }
      if (sql.includes('SELECT month_key FROM monthly_reports')) {
        return [];
      }
      if (sql.includes('SELECT year_key FROM yearly_reviews')) {
        return [];
      }
      if (sql.includes('WHERE w.status = \'completed\' AND we.exercise_id = ?')) {
        return [];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workouts') && sql.includes("status IN ('draft', 'in_progress')")) {
        return [];
      }
      return [];
    });

    (listBodyMeasurementsWithContext as jest.Mock).mockReturnValue([
      {
        id: 'measurement-1',
        recordedAt: '2026-03-27T10:00:00.000Z',
        weightKg: null,
      },
    ]);

    const overview = getOverviewAnalyticsSnapshot('30d');
    const exercises = listExerciseAnalytics('30d');
    const body = getBodyProgressSnapshot('30d');

    expect(overview.activeWorkout).toBeNull();
    expect(overview.lastClosedMonthKey).toBeTruthy();
    expect(overview.currentYearKey).toBeTruthy();
    expect(exercises).toEqual([
      expect.objectContaining({
        exerciseId: 'exercise-9',
        bestSessionVolume: 0,
        records: {},
        history: [],
      }),
    ]);
    expect(body.summary).toEqual(
      expect.objectContaining({
        latestWeightKg: null,
        weightChangeKg: null,
      }),
    );
    expect(getMonthlyReport('2026-03')).toBeNull();
    expect(getYearInReview('2026')).toBeNull();
  });

  it('builds dashboard summary hints for negative deltas and keeps empty helper fallbacks stable', () => {
    installCachedAnalyticsMocks();
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
        return { count: 4 };
      }
      if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
        return { count: 2 };
      }
      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE 1 = 1')) {
        return {
          workouts_count: 2,
          total_volume: 600,
          total_reps: 24,
          total_distance_meters: 0,
          total_duration_seconds: 1200,
          pr_count: 0,
        };
      }
      if (sql.includes('WHERE day_key BETWEEN ? AND ?')) {
        return {
          workouts_count: 5,
          total_volume: 1500,
          total_reps: 70,
          total_distance_meters: 0,
          total_duration_seconds: 2400,
          pr_count: 0,
        };
      }
      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE day_key = ?')) {
        return null;
      }
      return null;
    });

    const cards = getAnalyticsSummaryCards('30d');

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Workouts',
          hint: '-3 vs janela anterior',
        }),
        expect.objectContaining({
          label: 'Volume',
          hint: '-900 kg',
        }),
      ]),
    );
    expect(getWorkoutCorrelationForDay('2026-03-01')).toBeNull();
    expect(getMonthlyReportKeysForYear('2024')).toEqual([]);
  });

  it('maps active workouts with optional fields and truncates exercise history to the newest six entries', () => {
    installCachedAnalyticsMocks();
    const firstSyncImpl = (database.getFirstSync as jest.Mock).getMockImplementation();
    const allSyncImpl = (database.getAllSync as jest.Mock).getMockImplementation();

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.includes('SELECT *') && sql.includes("status IN ('draft', 'in_progress')")) {
        return {
          id: 'workout-active-1',
          created_at: '2026-03-27T08:00:00.000Z',
          updated_at: '2026-03-27T08:10:00.000Z',
          deleted_at: '2026-03-27T09:00:00.000Z',
          version: 2,
          schema_version: 3,
          remote_id: 'remote-workout-1',
          sync_state: 'local_only',
          last_exported_at: '2026-03-27T08:30:00.000Z',
          origin_device_id: 'device-1',
          routine_id: 'routine-7',
          title: 'Treino ativo',
          status: 'in_progress',
          source: 'routine',
          started_at: '2026-03-27T08:00:00.000Z',
          ended_at: '2026-03-27T08:45:00.000Z',
          duration_seconds: 2700,
          general_note: 'Sem pressa',
          total_volume: 450,
          total_reps: 18,
          total_distance_meters: 120,
        };
      }

      return firstSyncImpl?.(sql, ...args);
    });

    (database.getAllSync as jest.Mock).mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.includes('GROUP BY e.id, day_key')) {
        return Array.from({ length: 8 }, (_, index) => ({
          exercise_id: 'exercise-1',
          day_key: `2026-03-${String(26 - index).padStart(2, '0')}`,
          total_volume: 900 - index * 25,
          total_reps: 36 - index,
          best_weight: 80 - index,
          total_duration_seconds: 0,
          total_distance_meters: 0,
          best_pace_mpm: 0,
        }));
      }

      return allSyncImpl?.(sql, ...args);
    });

    const dashboard = getDashboardSnapshot();
    const exercises = listExerciseAnalytics('30d');

    expect(dashboard.activeWorkout).toEqual(
      expect.objectContaining({
        id: 'workout-active-1',
        deletedAt: '2026-03-27T09:00:00.000Z',
        remoteId: 'remote-workout-1',
        lastExportedAt: '2026-03-27T08:30:00.000Z',
        routineId: 'routine-7',
        endedAt: '2026-03-27T08:45:00.000Z',
        generalNote: 'Sem pressa',
      }),
    );
    expect(exercises[0].history).toHaveLength(6);
    expect(exercises[0].history[0].dayKey).toBe('2026-03-26');
    expect(exercises[0].history[5].dayKey).toBe('2026-03-21');
  });

  it('builds report caches with zero and null fallbacks when ranking queries return nothing', () => {
    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT SUBSTR(achieved_at, 1, 10) AS day_key, COUNT(*) AS pr_count')) {
        return [];
      }

      if (sql.includes('COUNT(*) AS workouts_count') && sql.includes('GROUP BY day_key')) {
        return [
          {
            day_key: '2026-03-26',
            workouts_count: 1,
            total_volume: 900,
            total_reps: 36,
            total_distance_meters: 0,
            total_duration_seconds: 1200,
            last_workout_at: '2026-03-26T10:00:00.000Z',
          },
        ];
      }

      if (sql.includes('COUNT(se.id) AS sets_count')) {
        return [{ period_key: '2026-03-26', muscle_group: 'chest', sets_count: 3, total_volume: 900 }];
      }

      if (sql.includes('GROUP BY month_key') && sql.includes('SUBSTR(started_at, 1, 4) = ?')) {
        return [];
      }

      if (sql.includes('SUBSTR(started_at, 1, 7) AS month_key')) {
        return [
          {
            month_key: '2026-03',
            workouts: 4,
            active_days: 3,
            total_volume: 1800,
            total_reps: 72,
            total_duration_seconds: 3600,
          },
        ];
      }

      if (sql.includes('SUBSTR(started_at, 1, 4) AS year_key')) {
        return [
          {
            year_key: '2026',
            workouts: 4,
            active_days: 3,
            total_volume: 1800,
            total_reps: 72,
            total_distance_meters: 0,
            total_duration_seconds: 3600,
          },
        ];
      }

      if (sql.includes('ORDER BY day_key ASC') && sql.includes('SUBSTR(started_at, 1, 4) = ?')) {
        return [];
      }

      return [];
    });

    (database.getFirstSync as jest.Mock).mockImplementation(() => null);

    refreshAnalyticsCaches();

    const monthlyInsert = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO monthly_reports'),
    );
    const yearlyInsert = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO yearly_reviews'),
    );
    const dailyInsert = (database.runSync as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO analytics_daily'),
    );

    expect(dailyInsert?.[7]).toBe(0);
    expect(JSON.parse(String(monthlyInsert?.[2]))).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          prCount: 0,
          topMuscle: null,
          topExercise: null,
        }),
      }),
    );
    expect(JSON.parse(String(yearlyInsert?.[2]))).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          prCount: 0,
          longestStreak: 0,
          strongestExercise: null,
          mostTrainedMuscle: null,
        }),
        monthlyVolume: [],
      }),
    );
  });

  it('keeps cached analytics lazy when there is no completed history and falls back to empty dashboard summaries', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
        return { count: 0 };
      }
      if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
        return { count: 0 };
      }
      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE 1 = 1')) {
        return null;
      }
      if (sql.includes('WHERE day_key BETWEEN ? AND ?')) {
        return null;
      }
      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE day_key = ?')) {
        return null;
      }
      return null;
    });

    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key')) {
        return [];
      }
      if (sql.includes('SELECT day_key, workouts_count, total_volume') && sql.includes('FROM analytics_daily')) {
        return [];
      }
      if (sql.includes('FROM muscle_period_snapshots')) {
        return [];
      }
      if (sql.includes('FROM pr_records pr')) {
        return [];
      }
      if (sql.includes('ORDER BY latest_performed_at DESC, total_volume DESC, sessions DESC')) {
        return [];
      }
      if (sql.includes('best_estimated_1rm')) {
        return [];
      }
      if (sql.includes('GROUP BY e.id, day_key')) {
        return [
          {
            exercise_id: 'exercise-pace-1',
            day_key: '2026-03-26',
            total_volume: 0,
            total_reps: 0,
            best_weight: 0,
            total_duration_seconds: 120,
            total_distance_meters: 600,
            best_pace_mpm: 300,
          },
        ];
      }
      if (sql.includes('best_session_volume')) {
        return [];
      }
      if (sql.includes('SELECT exercise_id, metric, MAX(value) AS value')) {
        return [];
      }
      if (sql.includes('SELECT month_key FROM monthly_reports')) {
        return [];
      }
      if (sql.includes('SELECT year_key FROM yearly_reviews')) {
        return [];
      }
      if (sql.includes('WHERE w.status = \'completed\' AND we.exercise_id = ?')) {
        return [];
      }
      if (sql.includes('SELECT *') && sql.includes("status IN ('draft', 'in_progress')")) {
        return [];
      }
      return [];
    });

    const overview = getOverviewAnalyticsSnapshot('30d');
    const dashboard = getDashboardSnapshot();

    expect(database.execSync).not.toHaveBeenCalled();
    expect(overview.summary).toEqual(
      expect.objectContaining({
        completedWorkouts: 0,
        totalVolume: 0,
        totalReps: 0,
      }),
    );
    expect(dashboard.weeklyFrequency.every((entry) => entry.count === 0)).toBe(true);
    expect(getLatestClosedMonthKey()).toBeNull();
    expect(getCurrentYearKey()).toBe('2026');
  });

  it('handles zero-set muscle rows and exposes pace metrics when duration and distance are available', () => {
    installCachedAnalyticsMocks();
    const allSyncImpl = (database.getAllSync as jest.Mock).getMockImplementation();

    (database.getAllSync as jest.Mock).mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM muscle_period_snapshots') && sql.includes('ORDER BY sets DESC')) {
        return [{ muscle_group: 'legs', sets: 0, total_volume: 0 }];
      }

      if (sql.includes('FROM muscle_period_snapshots') && sql.includes('WHERE period_key BETWEEN ? AND ?')) {
        return [];
      }

      if (sql.includes('best_estimated_1rm')) {
        return [
          {
            exercise_id: 'exercise-pace-1',
            exercise_name: 'Corrida',
            muscle_group: 'cardio',
            latest_performed_at: '2026-03-26T10:00:00.000Z',
            sessions: 2,
            total_volume: 0,
            total_reps: 0,
            best_weight: 0,
            best_estimated_1rm: 0,
            best_set_volume: 0,
            longest_duration_seconds: 120,
            longest_distance_meters: 600,
            best_pace_mpm: 300,
          },
        ];
      }

      if (sql.includes('GROUP BY e.id, day_key')) {
        return [
          {
            exercise_id: 'exercise-pace-1',
            day_key: '2026-03-26',
            total_volume: 0,
            total_reps: 0,
            best_weight: 0,
            total_duration_seconds: 120,
            total_distance_meters: 600,
            best_pace_mpm: 300,
          },
        ];
      }

      if (sql.includes('best_session_volume')) {
        return [];
      }

      if (sql.includes('SELECT exercise_id, metric, MAX(value) AS value')) {
        return [];
      }

      return allSyncImpl?.(sql, ...args);
    });

    const overview = getOverviewAnalyticsSnapshot('30d');
    const exercises = listExerciseAnalytics('30d');

    expect(overview.muscleDistribution[0]).toEqual(
      expect.objectContaining({
        muscle: 'legs',
        sets: 0,
        percentage: 0,
      }),
    );
    expect(exercises[0]).toEqual(
      expect.objectContaining({
        exerciseId: 'exercise-pace-1',
        bestPaceMetersPerMinute: 300,
        history: [
          expect.objectContaining({
            dayKey: '2026-03-26',
            totalDurationSeconds: 120,
            totalDistanceMeters: 600,
            bestPaceMetersPerMinute: 300,
          }),
        ],
      }),
    );
  });

  it('warms the analytics cache when completed workouts exist but the daily cache is still empty', () => {
    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
        return { count: 1 };
      }
      if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
        return { count: 0 };
      }
      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE 1 = 1')) {
        return {
          workouts_count: 1,
          total_volume: 500,
          total_reps: 20,
          total_distance_meters: 0,
          total_duration_seconds: 900,
          pr_count: 0,
        };
      }
      if (sql.includes('WHERE day_key BETWEEN ? AND ?')) {
        return null;
      }
      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE day_key = ?')) {
        return { workouts_count: 1, total_volume: 500 };
      }
      return null;
    });

    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT SUBSTR(achieved_at, 1, 10) AS day_key, COUNT(*) AS pr_count')) {
        return [];
      }
      if (sql.includes('COUNT(*) AS workouts_count') && sql.includes('GROUP BY day_key')) {
        return [
          {
            day_key: '2026-03-26',
            workouts_count: 1,
            total_volume: 500,
            total_reps: 20,
            total_distance_meters: 0,
            total_duration_seconds: 900,
            last_workout_at: '2026-03-26T10:00:00.000Z',
          },
        ];
      }
      if (sql.includes('COUNT(se.id) AS sets_count')) {
        return [{ period_key: '2026-03-26', muscle_group: 'chest', sets_count: 3, total_volume: 500 }];
      }
      if (sql.includes('SUBSTR(started_at, 1, 7) AS month_key')) {
        return [];
      }
      if (sql.includes('SUBSTR(started_at, 1, 4) AS year_key')) {
        return [];
      }
      if (sql.includes('SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key')) {
        return [{ day_key: '2026-03-26' }];
      }
      if (sql.includes('SELECT day_key, workouts_count, total_volume') && sql.includes('FROM analytics_daily')) {
        return [{ day_key: '2026-03-26', workouts_count: 1, total_volume: 500 }];
      }
      if (sql.includes('FROM muscle_period_snapshots')) {
        return [];
      }
      if (sql.includes('FROM pr_records pr')) {
        return [];
      }
      if (sql.includes('ORDER BY latest_performed_at DESC, total_volume DESC, sessions DESC')) {
        return [];
      }
      if (sql.includes('SELECT month_key FROM monthly_reports')) {
        return [];
      }
      if (sql.includes('SELECT year_key FROM yearly_reviews')) {
        return [];
      }
      if (sql.includes('SELECT *') && sql.includes("status IN ('draft', 'in_progress')")) {
        return [];
      }
      return [];
    });

    const overview = getOverviewAnalyticsSnapshot('30d');

    expect(database.execSync).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM analytics_daily'));
    expect(overview.summary.completedWorkouts).toBe(1);
  });
});
