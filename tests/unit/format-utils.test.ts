import { formatDistance, formatNumber, formatPrMetricValue, formatReps, formatWeight } from '@/src/shared/utils/format';

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

  it('formats PR metric values by metric type', () => {
    expect(formatPrMetricValue('heaviest_weight', 82.5)).toBe('82.5 kg');
    expect(formatPrMetricValue('estimated_1rm', 96)).toBe('96 kg');
    expect(formatPrMetricValue('best_volume', 640)).toBe('640 kg');
    expect(formatPrMetricValue('best_reps', 16)).toBe('16 reps');
    expect(formatPrMetricValue('best_duration', 95)).toBe('1m 35s');
    expect(formatPrMetricValue('best_distance', 400)).toBe('0,4 km');
  });
});
