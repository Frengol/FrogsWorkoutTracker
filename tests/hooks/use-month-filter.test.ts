import { act, renderHook } from '@testing-library/react-native';

import { useMonthFilter } from '@/src/modules/progress/hooks/use-month-filter';

describe('useMonthFilter', () => {
  it('initializes with current month', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1 }));

    const now = new Date();
    expect(result.current.month.getMonth()).toBe(now.getMonth());
    expect(result.current.month.getFullYear()).toBe(now.getFullYear());
    expect(result.current.month.getDate()).toBe(1);
  });

  it('navigates to previous month', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 3, 1) }));

    act(() => {
      result.current.goToPreviousMonth();
    });

    expect(result.current.month.getMonth()).toBe(2);
    expect(result.current.month.getFullYear()).toBe(2026);
  });

  it('navigates to next month', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 3, 1) }));

    act(() => {
      result.current.goToNextMonth();
    });

    expect(result.current.month.getMonth()).toBe(4);
    expect(result.current.month.getFullYear()).toBe(2026);
  });

  it('handles year wrap when going to previous month from january', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 0, 1) }));

    act(() => {
      result.current.goToPreviousMonth();
    });

    expect(result.current.month.getMonth()).toBe(11);
    expect(result.current.month.getFullYear()).toBe(2025);
  });

  it('handles year wrap when going to next month from december', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2025, 11, 1) }));

    act(() => {
      result.current.goToNextMonth();
    });

    expect(result.current.month.getMonth()).toBe(0);
    expect(result.current.month.getFullYear()).toBe(2026);
  });

  it('allows setting a specific month', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 3, 1) }));

    act(() => {
      result.current.setMonth(new Date(2025, 7, 1));
    });

    expect(result.current.month.getMonth()).toBe(7);
    expect(result.current.month.getFullYear()).toBe(2025);
  });

  it('formats month label in portuguese', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 3, 1) }));

    expect(result.current.monthLabel).toBe('Abril de 2026');
  });

  it('formats month key as YYYY-MM', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 3, 1) }));

    expect(result.current.monthKey).toBe('2026-04');
  });

  it('generates calendar weeks aligned to weekStartsOn for a 31-day month starting on wednesday', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 3, 1) }));

    // April 2026 starts on Wednesday (2026-04-01 is Wed)
    // Monday-start weeks: 30/03-05/04, 06/04-12/04, 13/04-19/04, 20/04-26/04, 27/04-03/05
    expect(result.current.calendarWeeks.length).toBe(5);
    expect(result.current.calendarWeeks[0].startDayKey).toBe('2026-03-30');
    expect(result.current.calendarWeeks[0].endDayKey).toBe('2026-04-05');
    expect(result.current.calendarWeeks[4].startDayKey).toBe('2026-04-27');
    expect(result.current.calendarWeeks[4].endDayKey).toBe('2026-05-03');
  });

  it('generates calendar weeks aligned to sunday-start', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 0, initialMonth: new Date(2026, 3, 1) }));

    // Sunday-start weeks: 29/03-04/04, 05/04-11/04, 12/04-18/04, 19/04-25/04, 26/04-02/05
    expect(result.current.calendarWeeks.length).toBe(5);
    expect(result.current.calendarWeeks[0].startDayKey).toBe('2026-03-29');
    expect(result.current.calendarWeeks[0].endDayKey).toBe('2026-04-04');
  });

  it('generates 6 weeks for months that span 6 calendar weeks', () => {
    // August 2026 starts on Saturday, has 31 days -> spans 6 weeks
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 7, 1) }));

    expect(result.current.calendarWeeks.length).toBe(6);
  });

  it('each week contains exactly 7 days', () => {
    const { result } = renderHook(() => useMonthFilter({ weekStartsOn: 1, initialMonth: new Date(2026, 3, 1) }));

    result.current.calendarWeeks.forEach((week) => {
      expect(week.dayKeys.length).toBe(7);
    });
  });
});
