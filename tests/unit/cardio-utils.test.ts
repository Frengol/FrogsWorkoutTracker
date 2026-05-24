import {
  formatKilometersInputFromMeters,
  normalizeKilometersInput,
  normalizeKilometersInputOnBlur,
  parseKilometersInputToMeters,
} from '@/src/modules/workouts/cardio';

describe('cardio kilometer helpers', () => {
  it('normalizes decimal input for pt-BR display', () => {
    expect(normalizeKilometersInput('3.5')).toBe('3,5');
    expect(normalizeKilometersInput('3,5')).toBe('3,5');
    expect(normalizeKilometersInput('3..5')).toBe('3,5');
  });

  it('converts kilometers from the UI into meters for persistence', () => {
    expect(parseKilometersInputToMeters('3,5')).toBe(3500);
    expect(parseKilometersInputToMeters('0,4')).toBe(400);
    expect(parseKilometersInputToMeters('')).toBeNull();
  });

  it('formats saved meters back into kilometer inputs', () => {
    expect(formatKilometersInputFromMeters(3500)).toBe('3,5');
    expect(formatKilometersInputFromMeters(400)).toBe('0,4');
    expect(formatKilometersInputFromMeters(null)).toBe('');
  });

  it('canonicalizes kilometer inputs on blur', () => {
    expect(normalizeKilometersInputOnBlur('003,500')).toBe('3,5');
    expect(normalizeKilometersInputOnBlur('0,400')).toBe('0,4');
    expect(normalizeKilometersInputOnBlur('')).toBe('');
  });
});
