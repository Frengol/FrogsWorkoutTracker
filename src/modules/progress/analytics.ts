import {
  AnalyticsPeriod,
  MonthlyReportSnapshot,
  MuscleGroup,
  ReportMonthKey,
  ReportYearKey,
  YearInReviewSnapshot,
} from '@/src/shared/types/domain';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<Exclude<AnalyticsPeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
  '1y': 365,
};

export const analyticsPeriods: AnalyticsPeriod[] = ['7d', '30d', '3m', '1y', 'all'];

export const getAnalyticsPeriodDays = (period: AnalyticsPeriod) =>
  period === 'all' ? null : PERIOD_DAYS[period];

export const getDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const getMonthKey = (input: string | Date) => {
  const date = typeof input === 'string' ? new Date(input) : input;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` as ReportMonthKey;
};

export const getYearKey = (input: string | Date) => {
  const date = typeof input === 'string' ? new Date(input) : input;
  return `${date.getUTCFullYear()}` as ReportYearKey;
};

export const getLastClosedMonthKey = (referenceDate = new Date()) => {
  const cursor = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  return getMonthKey(cursor);
};

export const getCalendarDayRange = (period: AnalyticsPeriod, referenceDate = new Date()) => {
  const end = new Date(referenceDate);
  end.setUTCHours(0, 0, 0, 0);

  const days = getAnalyticsPeriodDays(period);
  const start = new Date(end);

  if (days == null) {
    start.setUTCDate(start.getUTCDate() - 29);
  } else {
    start.setUTCDate(start.getUTCDate() - (days - 1));
  }

  const range: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    range.push(getDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return range;
};

const getWeekAlignmentOffset = (weekday: number, weekStartsOn: 0 | 1) => {
  if (weekStartsOn === 0) {
    return weekday;
  }

  return weekday === 0 ? 6 : weekday - 1;
};

export const getAlignedCalendarWeeks = (weekStartsOn: 0 | 1, referenceDate = new Date()) => {
  const currentWeekStart = new Date(referenceDate);
  currentWeekStart.setUTCHours(0, 0, 0, 0);
  currentWeekStart.setUTCDate(
    currentWeekStart.getUTCDate() - getWeekAlignmentOffset(currentWeekStart.getUTCDay(), weekStartsOn),
  );

  const oldestWeekStart = new Date(currentWeekStart);
  oldestWeekStart.setUTCDate(oldestWeekStart.getUTCDate() - 21);

  return Array.from({ length: 4 }, (_, weekIndex) => {
    const weekStart = new Date(oldestWeekStart);
    weekStart.setUTCDate(oldestWeekStart.getUTCDate() + weekIndex * 7);

    const dayKeys = Array.from({ length: 7 }, (_, dayIndex) => {
      const cursor = new Date(weekStart);
      cursor.setUTCDate(weekStart.getUTCDate() + dayIndex);
      return getDateKey(cursor);
    });

    return {
      startDayKey: dayKeys[0],
      endDayKey: dayKeys[dayKeys.length - 1],
      dayKeys,
    };
  });
};

export const getPeriodWindow = (period: AnalyticsPeriod, referenceDate = new Date()) => {
  const end = new Date(referenceDate);
  end.setUTCHours(23, 59, 59, 999);

  const days = getAnalyticsPeriodDays(period);

  if (days == null) {
    return {
      startDayKey: null,
      endDayKey: getDateKey(end),
      previousStartDayKey: null,
      previousEndDayKey: null,
    };
  }

  const start = new Date(end.getTime() - (days - 1) * DAY_IN_MS);
  start.setUTCHours(0, 0, 0, 0);

  const previousEnd = new Date(start.getTime() - DAY_IN_MS);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY_IN_MS);
  previousStart.setUTCHours(0, 0, 0, 0);

  return {
    startDayKey: getDateKey(start),
    endDayKey: getDateKey(end),
    previousStartDayKey: getDateKey(previousStart),
    previousEndDayKey: getDateKey(previousEnd),
  };
};

export const calculatePercentageDelta = (currentValue: number, previousValue: number) => {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
};

export const getCurrentStreakFromDays = (dayKeys: string[], referenceDate = new Date()) => {
  const uniqueDays = [...new Set(dayKeys)].sort().reverse();
  let streak = 0;
  const cursor = new Date(referenceDate);
  cursor.setUTCHours(0, 0, 0, 0);

  while (uniqueDays.includes(getDateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
};

export const getLongestStreakFromDays = (dayKeys: string[]) => {
  const uniqueDays = [...new Set(dayKeys)].sort();
  if (uniqueDays.length === 0) {
    return 0;
  }

  let longest = 1;
  let current = 1;

  for (let index = 1; index < uniqueDays.length; index += 1) {
    const previous = new Date(`${uniqueDays[index - 1]}T00:00:00.000Z`);
    const next = new Date(`${uniqueDays[index]}T00:00:00.000Z`);
    const diff = Math.round((next.getTime() - previous.getTime()) / DAY_IN_MS);

    if (diff === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
};

export const estimateBestPaceMetersPerMinute = (distanceMeters?: number | null, durationSeconds?: number | null) => {
  if (!distanceMeters || !durationSeconds || durationSeconds <= 0) {
    return 0;
  }

  return (distanceMeters / durationSeconds) * 60;
};

export const buildMonthlyReportSnapshot = ({
  monthKey,
  workouts,
  activeDays,
  totalVolume,
  totalReps,
  totalDurationSeconds,
  recordCount,
  prCount,
  oneRmCount = 0,
  topMuscle,
  topExercise,
}: {
  monthKey: ReportMonthKey;
  workouts: number;
  activeDays: number;
  totalVolume: number;
  totalReps: number;
  totalDurationSeconds: number;
  recordCount?: number;
  prCount: number;
  oneRmCount?: number;
  topMuscle: MuscleGroup | null;
  topExercise: string | null;
}): MonthlyReportSnapshot => {
  const [year, month] = monthKey.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  return {
    monthKey,
    label,
    summary: {
      workouts,
      activeDays,
      totalVolume,
      totalReps,
      totalDurationSeconds,
      recordCount: recordCount ?? prCount,
      prCount,
      oneRmCount,
      topMuscle,
      topExercise,
    },
  };
};

export const buildYearInReviewSnapshot = ({
  yearKey,
  workouts,
  activeDays,
  totalVolume,
  totalReps,
  totalDistanceMeters,
  totalDurationSeconds,
  recordCount,
  prCount,
  oneRmCount = 0,
  longestStreak,
  strongestExercise,
  mostTrainedMuscle,
  monthlyVolume,
}: {
  yearKey: ReportYearKey;
  workouts: number;
  activeDays: number;
  totalVolume: number;
  totalReps: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  recordCount?: number;
  prCount: number;
  oneRmCount?: number;
  longestStreak: number;
  strongestExercise: string | null;
  mostTrainedMuscle: MuscleGroup | null;
  monthlyVolume: YearInReviewSnapshot['monthlyVolume'];
}): YearInReviewSnapshot => ({
  yearKey,
  summary: {
    workouts,
    activeDays,
    totalVolume,
    totalReps,
    totalDistanceMeters,
    totalDurationSeconds,
    recordCount: recordCount ?? prCount,
    prCount,
    oneRmCount,
    longestStreak,
    strongestExercise,
    mostTrainedMuscle,
  },
  monthlyVolume,
});

const getLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const getMonthCalendarWeeks = (month: Date, weekStartsOn: 0 | 1) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);

  const firstDayWeekday = firstDayOfMonth.getDay();
  const offset = getWeekAlignmentOffset(firstDayWeekday, weekStartsOn);

  const calendarStart = new Date(firstDayOfMonth);
  calendarStart.setDate(calendarStart.getDate() - offset);

  const weeks: { startDayKey: string; endDayKey: string; dayKeys: string[] }[] = [];
  let currentWeekStart = new Date(calendarStart);

  while (true) {
    const dayKeys: string[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const day = new Date(currentWeekStart);
      day.setDate(day.getDate() + dayIndex);
      dayKeys.push(getLocalDateKey(day));
    }

    weeks.push({
      startDayKey: dayKeys[0],
      endDayKey: dayKeys[6],
      dayKeys,
    });

    const lastDayOfWeek = new Date(currentWeekStart);
    lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 6);

    if (lastDayOfWeek >= lastDayOfMonth) {
      break;
    }

    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  return weeks;
};
