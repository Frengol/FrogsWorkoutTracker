import { diffInSeconds, formatDuration, lastNDays } from '@/src/shared/utils/date';

describe('date utilities', () => {
  it('formats durations into readable labels', () => {
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(3661)).toBe('1h 1m');
  });

  it('computes positive time deltas in seconds', () => {
    expect(diffInSeconds('2026-03-24T10:00:00.000Z', '2026-03-24T10:01:30.000Z')).toBe(90);
  });

  it('returns a rolling list of day keys', () => {
    expect(lastNDays(7)).toHaveLength(7);
  });
});
