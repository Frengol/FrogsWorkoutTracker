jest.mock('@/src/shared/db/database', () => ({
  database: {
    execSync: jest.fn(),
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
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
  getBodyProgressSnapshot,
  getMonthlyReport,
  getOverviewAnalyticsSnapshot,
  getYearInReview,
  listAvailableMonthlyReports,
  listAvailableYearInReviewKeys,
} from '@/src/modules/progress/service';
import { getIdentitySnapshot } from '@/src/modules/identity/service';
import { listBodyMeasurementsWithContext } from '@/src/modules/measurements/service';
import { database } from '@/src/shared/db/database';

describe('progress service', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-26T12:00:00.000Z'));
    jest.clearAllMocks();

    (database.getFirstSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes("COUNT(*) AS count FROM workouts WHERE status = 'completed'")) {
        return { count: 2 };
      }

      if (sql.includes('SELECT COUNT(*) AS count FROM analytics_daily')) {
        return { count: 1 };
      }

      if (sql.includes('FROM analytics_daily') && sql.includes('WHERE 1 = 1')) {
        return {
          workouts_count: 2,
          total_volume: 1200,
          total_reps: 40,
          total_distance_meters: 0,
          total_duration_seconds: 2400,
          pr_count: 1,
        };
      }

      if (sql.includes('WHERE day_key BETWEEN')) {
        return {
          workouts_count: 1,
          total_volume: 600,
          total_reps: 20,
          total_distance_meters: 0,
          total_duration_seconds: 1200,
          pr_count: 0,
        };
      }

      if (sql.includes('SELECT payload_json FROM monthly_reports')) {
        return {
          payload_json: JSON.stringify({
            label: 'Fevereiro 2026',
            summary: {
              workouts: 10,
              activeDays: 8,
              totalVolume: 20000,
              totalReps: 1000,
              totalDurationSeconds: 7200,
              prCount: 3,
              topMuscle: 'costas',
              topExercise: 'Remada curvada',
            },
          }),
        };
      }

      if (sql.includes('SELECT payload_json FROM yearly_reviews')) {
        return {
          payload_json: JSON.stringify({
            summary: {
              workouts: 80,
              activeDays: 52,
              totalVolume: 180000,
              prCount: 20,
              totalReps: 9800,
              totalDistanceMeters: 0,
              totalDurationSeconds: 90000,
              longestStreak: 7,
              strongestExercise: 'Levantamento terra',
              mostTrainedMuscle: 'costas',
            },
            monthlyVolume: [],
          }),
        };
      }

      return null;
    });

    (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key')) {
        return [{ day_key: '2026-03-26' }, { day_key: '2026-03-25' }];
      }

      if (sql.includes('SELECT day_key, workouts_count, total_volume')) {
        return [
          { day_key: '2026-03-26', workouts_count: 1, total_volume: 600 },
          { day_key: '2026-03-25', workouts_count: 1, total_volume: 600 },
        ];
      }

      if (sql.includes('FROM muscle_period_snapshots') && sql.includes('GROUP BY muscle_group')) {
        return [{ muscle_group: 'back', sets: 8, total_volume: 1200 }];
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
            exercise_name: 'Barra fixa',
          },
        ];
      }

      if (sql.includes('FROM workout_exercises we') && sql.includes('ORDER BY total_volume DESC, sessions DESC')) {
        return [
          {
            exercise_id: 'exercise-1',
            exercise_name: 'Barra fixa',
            sessions: 2,
            total_volume: 1200,
            best_weight: 0,
          },
        ];
      }

      if (sql.includes('SELECT month_key FROM monthly_reports')) {
        return [{ month_key: '2026-02' }];
      }

      if (sql.includes('SELECT year_key FROM yearly_reviews')) {
        return [{ year_key: '2026' }];
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
        weightKg: 81,
      },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds overview and body snapshots from cached analytics rows', () => {
    const overview = getOverviewAnalyticsSnapshot('30d');
    const body = getBodyProgressSnapshot('30d');

    expect(overview.summary.completedWorkouts).toBe(2);
    expect(overview.calendarWeeks).toHaveLength(4);
    expect(overview.calendarWeeks[0].days).toHaveLength(7);
    expect(overview.topExercises[0].exerciseName).toBe('Barra fixa');
    expect(body.summary.latestWeightKg).toBe(82);
    expect(body.summary.weightChangeKg).toBe(1);
  });

  it('aligns overview calendar weeks to sunday-first preferences when configured', () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      preferences: {
        weekStartsOn: 0,
      },
    });

    const overview = getOverviewAnalyticsSnapshot('30d');

    expect(overview.calendarWeeks[0].days[0].dayKey).toBe('2026-03-01');
    expect(overview.calendarWeeks[3].days[6].dayKey).toBe('2026-03-28');
  });

  it('lists and reads cached monthly and yearly reports', () => {
    expect(listAvailableMonthlyReports()).toEqual(['2026-02']);
    expect(listAvailableYearInReviewKeys()).toEqual(['2026']);
    expect(getMonthlyReport('2026-02')?.summary.topExercise).toBe('Remada curvada');
    expect(getYearInReview('2026')?.summary.strongestExercise).toBe('Levantamento terra');
  });
});
