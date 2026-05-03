import {
  buildMonthlyReportSnapshot,
  buildYearInReviewSnapshot,
  calculatePercentageDelta,
  estimateBestPaceMetersPerMinute,
  getAlignedCalendarWeeks,
  getCurrentStreakFromDays,
  getLastClosedMonthKey,
  getPeriodWindow,
} from '@/src/modules/progress/analytics';

describe('progress analytics helpers', () => {
  it('builds a rolling window and previous comparison window', () => {
    const window = getPeriodWindow('7d', new Date('2026-03-24T12:00:00.000Z'));

    expect(window.startDayKey).toBe('2026-03-18');
    expect(window.endDayKey).toBe('2026-03-24');
    expect(window.previousStartDayKey).toBe('2026-03-11');
    expect(window.previousEndDayKey).toBe('2026-03-17');
  });

  it('computes current streak from distinct day keys', () => {
    const streak = getCurrentStreakFromDays(
      ['2026-03-24', '2026-03-23', '2026-03-22', '2026-03-20'],
      new Date('2026-03-24T09:00:00.000Z'),
    );

    expect(streak).toBe(3);
  });

  it('calculates comparison percentage deltas safely', () => {
    expect(calculatePercentageDelta(12, 6)).toBe(100);
    expect(calculatePercentageDelta(4, 0)).toBe(100);
    expect(calculatePercentageDelta(0, 0)).toBe(0);
  });

  it('estimates best pace in meters per minute', () => {
    expect(estimateBestPaceMetersPerMinute(1000, 300)).toBe(200);
    expect(estimateBestPaceMetersPerMinute(1000, 0)).toBe(0);
  });

  it('builds local monthly and yearly reports', () => {
    const monthly = buildMonthlyReportSnapshot({
      monthKey: '2026-02',
      workouts: 12,
      activeDays: 9,
      totalVolume: 24500,
      totalReps: 1320,
      totalDurationSeconds: 14400,
      prCount: 5,
      topMuscle: 'back',
      topExercise: 'Barbell Row',
    });
    const yearly = buildYearInReviewSnapshot({
      yearKey: '2026',
      workouts: 84,
      activeDays: 58,
      totalVolume: 186000,
      totalReps: 10840,
      totalDistanceMeters: 22000,
      totalDurationSeconds: 110000,
      prCount: 28,
      longestStreak: 9,
      strongestExercise: 'Back Squat',
      mostTrainedMuscle: 'quads',
      monthlyVolume: [{ monthKey: '2026-02', totalVolume: 24500, workouts: 12 }],
    });

    expect(monthly.label).toContain('2026');
    expect(monthly.summary.topExercise).toBe('Barbell Row');
    expect(yearly.summary.longestStreak).toBe(9);
    expect(yearly.monthlyVolume).toHaveLength(1);
  });

  it('returns the previous closed month key', () => {
    expect(getLastClosedMonthKey(new Date('2026-03-24T12:00:00.000Z'))).toBe('2026-02');
  });

  it('builds four aligned calendar weeks for monday-first settings', () => {
    const weeks = getAlignedCalendarWeeks(1, new Date('2026-03-26T12:00:00.000Z'));

    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toEqual(
      expect.objectContaining({
        startDayKey: '2026-03-02',
        endDayKey: '2026-03-08',
      }),
    );
    expect(weeks[3]).toEqual(
      expect.objectContaining({
        startDayKey: '2026-03-23',
        endDayKey: '2026-03-29',
      }),
    );
    expect(weeks.every((week) => week.dayKeys.length === 7)).toBe(true);
  });

  it('builds four aligned calendar weeks for sunday-first settings', () => {
    const weeks = getAlignedCalendarWeeks(0, new Date('2026-03-26T12:00:00.000Z'));

    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toEqual(
      expect.objectContaining({
        startDayKey: '2026-03-01',
        endDayKey: '2026-03-07',
      }),
    );
    expect(weeks[3]).toEqual(
      expect.objectContaining({
        startDayKey: '2026-03-22',
        endDayKey: '2026-03-28',
      }),
    );
  });
});
