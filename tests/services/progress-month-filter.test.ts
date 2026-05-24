jest.mock('@/src/shared/db/database', () => ({
  database: {
    execSync: jest.fn(),
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  },
  initializeDatabase: jest.fn(),
}));

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(() => ({
    preferences: {
      weekStartsOn: 1,
    },
  })),
}));

import { getOverviewAnalyticsSnapshot } from '@/src/modules/progress/service';
import { database } from '@/src/shared/db/database';

const installMonthFilterMocks = () => {
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
        total_distance_meters: 0,
        total_duration_seconds: 3600,
        record_count: 3,
        pr_count: 3,
        one_rm_count: 0,
      };
    }

    if (sql.includes('WHERE day_key BETWEEN ? AND ?')) {
      return {
        workouts_count: 2,
        total_volume: 900,
        total_reps: 36,
        total_distance_meters: 0,
        total_duration_seconds: 1800,
        record_count: 1,
        pr_count: 1,
        one_rm_count: 0,
      };
    }

    return null;
  });

  (database.getAllSync as jest.Mock).mockImplementation((sql: string) => {
    if (sql.includes('SELECT DISTINCT SUBSTR(started_at, 1, 10) AS day_key') && sql.includes('ORDER BY day_key DESC')) {
      return [
        { day_key: '2026-04-15' },
        { day_key: '2026-04-08' },
        { day_key: '2026-04-01' },
      ];
    }

    if (sql.includes('SELECT day_key, workouts_count, total_volume') && sql.includes('FROM analytics_daily')) {
      return [
        { day_key: '2026-04-01', workouts_count: 1, total_volume: 300 },
        { day_key: '2026-04-08', workouts_count: 1, total_volume: 450 },
        { day_key: '2026-04-15', workouts_count: 2, total_volume: 1050 },
      ];
    }

    if (sql.includes('FROM muscle_period_snapshots') && sql.includes('ORDER BY sets DESC')) {
      return [{ muscle_group: 'chest', sets: 8, total_volume: 1200 }];
    }

    if (sql.includes('FROM muscle_period_snapshots') && sql.includes('WHERE period_key BETWEEN ? AND ?')) {
      return [{ muscle_group: 'chest', sets: 5 }];
    }

    if (sql.includes('FROM pr_records pr')) {
      return [];
    }

    if (sql.includes('ORDER BY total_volume DESC, sessions DESC') && sql.includes('FROM workout_exercises we') && !sql.includes('best_estimated_1rm')) {
      return [];
    }

    if (sql.includes('best_estimated_1rm')) {
      return [];
    }

    return [];
  });
};

describe('progress service month filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns calendar weeks for the specified month when month option is provided', () => {
    installMonthFilterMocks();

    const monthDate = new Date(2026, 3, 1); // April 2026
    const overview = getOverviewAnalyticsSnapshot('30d', { month: monthDate });

    // April 2026 with Monday start: 5 weeks
    expect(overview.calendarWeeks.length).toBe(5);
    expect(overview.calendarWeeks[0].startDayKey).toBe('2026-03-30');
    expect(overview.calendarWeeks[0].endDayKey).toBe('2026-04-05');
    expect(overview.calendarWeeks[4].startDayKey).toBe('2026-04-27');
    expect(overview.calendarWeeks[4].endDayKey).toBe('2026-05-03');
  });

  it('includes workout data from analytics_daily for days within the month range', () => {
    installMonthFilterMocks();

    const monthDate = new Date(2026, 3, 1);
    const overview = getOverviewAnalyticsSnapshot('30d', { month: monthDate });

    const firstWeek = overview.calendarWeeks[0];
    const april1Cell = firstWeek.days.find((d) => d.dayKey === '2026-04-01');
    expect(april1Cell?.workoutsCount).toBe(1);
    expect(april1Cell?.totalVolume).toBe(300);

    const secondWeek = overview.calendarWeeks[1];
    const april8Cell = secondWeek.days.find((d) => d.dayKey === '2026-04-08');
    expect(april8Cell?.workoutsCount).toBe(1);
    expect(april8Cell?.totalVolume).toBe(450);
  });

  it('returns zero workouts for days outside the month when no data exists', () => {
    installMonthFilterMocks();

    const monthDate = new Date(2026, 3, 1);
    const overview = getOverviewAnalyticsSnapshot('30d', { month: monthDate });

    // March 30 is outside April but in first calendar week
    const firstWeek = overview.calendarWeeks[0];
    const march30Cell = firstWeek.days.find((d) => d.dayKey === '2026-03-30');
    expect(march30Cell?.workoutsCount).toBe(0);
    expect(march30Cell?.totalVolume).toBe(0);
  });

  it('maintains backward compatibility when month option is not provided', () => {
    installMonthFilterMocks();

    const overview = getOverviewAnalyticsSnapshot('30d');

    // Without month filter, should use period-based calendar (4 weeks aligned to current)
    expect(overview.calendarWeeks.length).toBe(4);
  });

  it('queries analytics_daily with correct day_key range for the month', () => {
    installMonthFilterMocks();

    const monthDate = new Date(2026, 3, 1);
    getOverviewAnalyticsSnapshot('30d', { month: monthDate });

    const dailyQuery = (database.getAllSync as jest.Mock).mock.calls.find(
      ([sql]) => String(sql).includes('SELECT day_key, workouts_count, total_volume') && String(sql).includes('FROM analytics_daily'),
    );

    expect(dailyQuery).toBeTruthy();
    expect(dailyQuery[1]).toBe('2026-03-30'); // first day of first calendar week
    expect(dailyQuery[2]).toBe('2026-05-03'); // last day of last calendar week
  });
});
