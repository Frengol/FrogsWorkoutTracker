import { formatDistance, formatNumber, formatReps, formatWeight } from '@/src/shared/utils/format';

describe('format utilities', () => {
  it('formats weight defensively', () => {
    expect(formatWeight(80)).toBe('80 kg');
    expect(formatWeight(82.5)).toBe('82.5 kg');
    expect(formatWeight(null)).toBe('--');
  });

  it('formats reps and distance labels', () => {
    expect(formatReps(12)).toBe('12 reps');
    expect(formatReps(null)).toBe('--');
    expect(formatDistance(250)).toBe('0,25 km');
    expect(formatDistance(1500)).toBe('1,5 km');
    expect(formatDistance(null)).toBe('--');
  });

  it('formats generic numbers for pt-BR', () => {
    expect(formatNumber(12000)).toBe('12.000');
  });
});
