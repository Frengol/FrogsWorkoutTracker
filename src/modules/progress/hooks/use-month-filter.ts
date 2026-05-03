import { useCallback, useMemo, useState } from 'react';

const getLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getWeekAlignmentOffset = (weekday: number, weekStartsOn: 0 | 1) => {
  if (weekStartsOn === 0) {
    return weekday;
  }

  return weekday === 0 ? 6 : weekday - 1;
};

const buildMonthCalendarWeeks = (month: Date, weekStartsOn: 0 | 1) => {
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

type UseMonthFilterOptions = {
  weekStartsOn: 0 | 1;
  initialMonth?: Date;
};

export const useMonthFilter = ({ weekStartsOn, initialMonth }: UseMonthFilterOptions) => {
  const normalizeMonth = useCallback((date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0), []);

  const [month, setMonthState] = useState(() => normalizeMonth(initialMonth ?? new Date()));

  const goToPreviousMonth = useCallback(() => {
    setMonthState((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() - 1);
      return normalizeMonth(next);
    });
  }, [normalizeMonth]);

  const goToNextMonth = useCallback(() => {
    setMonthState((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + 1);
      return normalizeMonth(next);
    });
  }, [normalizeMonth]);

  const setMonth = useCallback(
    (date: Date) => {
      setMonthState(normalizeMonth(date));
    },
    [normalizeMonth],
  );

  const monthLabel = useMemo(() => {
    const label = new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(month);

    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [month]);

  const monthKey = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = String(month.getMonth() + 1).padStart(2, '0');
    return `${year}-${monthIndex}`;
  }, [month]);

  const calendarWeeks = useMemo(() => buildMonthCalendarWeeks(month, weekStartsOn), [month, weekStartsOn]);

  return {
    month,
    monthLabel,
    monthKey,
    goToPreviousMonth,
    goToNextMonth,
    setMonth,
    calendarWeeks,
  };
};
