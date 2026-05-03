import {
  estimateOneRepMax,
  getPlateBreakdown,
  getWarmupSuggestions,
} from '@/src/modules/workouts/calculations';

describe('workout calculations', () => {
  it('estimates a one rep max with the epley formula', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 1);
  });

  it('returns an empty 1RM estimate when input is missing', () => {
    expect(estimateOneRepMax(undefined, 5)).toBe(0);
    expect(estimateOneRepMax(100, undefined)).toBe(0);
  });

  it('builds a symmetric plate breakdown per side', () => {
    expect(getPlateBreakdown(100)).toEqual([25, 15]);
    expect(getPlateBreakdown(60)).toEqual([20]);
  });

  it('returns no plates when the target does not exceed bar weight', () => {
    expect(getPlateBreakdown(20)).toEqual([]);
    expect(getPlateBreakdown(10)).toEqual([]);
  });

  it('suggests a simple three-step warm-up ramp', () => {
    expect(getWarmupSuggestions(100)).toEqual([
      { label: 'Primer', weight: 40, reps: 8 },
      { label: 'Build', weight: 60, reps: 5 },
      { label: 'Prime', weight: 75, reps: 3 },
    ]);
  });
});
