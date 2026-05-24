import { diffInSeconds, formatDuration, formatLocalDateTimeLabel, lastNDays } from '@/src/shared/utils/date';

describe('date utilities', () => {
  it('formats durations into readable labels', () => {
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(3661)).toBe('1h 1m');
  });

  it('computes positive time deltas in seconds', () => {
    expect(diffInSeconds('2026-03-24T10:00:00.000Z', '2026-03-24T10:01:30.000Z')).toBe(90);
  });

  it('formats date and time labels in the requested local timezone', () => {
    expect(formatLocalDateTimeLabel('2026-05-16T15:34:00.000Z', { timeZone: 'America/Sao_Paulo' })).toBe(
      '16/05/2026 às 12:34',
    );
    expect(formatLocalDateTimeLabel('2026-05-16T15:34:00.000Z', { timeZone: 'America/Manaus' })).toBe(
      '16/05/2026 às 11:34',
    );
  });

  it('returns a safe placeholder for invalid date and time labels', () => {
    expect(formatLocalDateTimeLabel('not-a-date')).toBe('--/--/---- às --:--');
  });

  it('returns a rolling list of day keys', () => {
    expect(lastNDays(7)).toHaveLength(7);
  });
});
