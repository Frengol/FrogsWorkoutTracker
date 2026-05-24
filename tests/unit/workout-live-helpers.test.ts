import { buildLiveSetRows, formatPreviousMatchLabel, normalizeLiveSetType } from '@/src/modules/workouts/live-helpers';

describe('workout live helpers', () => {
  it('normalizes unsupported set types as normal in the live table', () => {
    expect(normalizeLiveSetType('normal')).toBe('normal');
    expect(normalizeLiveSetType('warmup')).toBe('warmup');
    expect(normalizeLiveSetType('failure')).toBe('failure');
    expect(normalizeLiveSetType('drop')).toBe('normal');
    expect(normalizeLiveSetType('timed')).toBe('normal');
  });

  it('builds live rows with compact labels and previous-match by type occurrence', () => {
    const rows = buildLiveSetRows(
      [
        { id: 'set-1', type: 'warmup' },
        { id: 'set-2', type: 'normal' },
        { id: 'set-3', type: 'normal' },
        { id: 'set-4', type: 'failure' },
      ],
      [
        { type: 'warmup', weightKg: 20, reps: 10 },
        { type: 'normal', weightKg: 60, reps: 8 },
        { type: 'normal', weightKg: 65, reps: 6 },
        { type: 'failure', weightKg: 70, reps: 5 },
      ],
    );

    expect(rows.map((row) => row.seriesLabel)).toEqual(['A', '1', '2', 'F']);
    expect(rows.map((row) => row.previousMatchLabel)).toEqual(['20 kg x 10', '60 kg x 8', '65 kg x 6', '70 kg x 5']);
  });

  it('shows placeholder when there is no matching previous set', () => {
    const rows = buildLiveSetRows(
      [{ id: 'set-1', type: 'failure' }],
      [{ type: 'normal', weightKg: 40, reps: 12 }],
    );

    expect(rows[0].previousMatch).toBeNull();
    expect(rows[0].previousMatchLabel).toBe('--');
  });

  it('formats previous labels defensively', () => {
    expect(formatPreviousMatchLabel({ weightKg: 45, reps: 8 })).toBe('45 kg x 8');
    expect(formatPreviousMatchLabel({ weightKg: 45 })).toBe('45 kg');
    expect(formatPreviousMatchLabel({ reps: 12 })).toBe('12 reps');
    expect(formatPreviousMatchLabel(null)).toBe('--');
  });
});
