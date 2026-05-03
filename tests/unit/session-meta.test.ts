import {
  applyWorkoutSessionMeta,
  formatCardioDurationFromDigits,
  formatWorkoutSessionDateLabel,
  normalizeCardioDurationDigits,
  parseCardioDurationInput,
  parseWorkoutDurationInput,
  replaceWorkoutSessionDate,
} from '@/src/modules/workouts/session-meta';

describe('session meta helpers', () => {
  it('normalizes cardio duration digits and formats them as HH:MM', () => {
    expect(normalizeCardioDurationDigits('1a3:7')).toBe('137');

    expect(formatCardioDurationFromDigits('137')).toBe('01:37');
    expect(formatCardioDurationFromDigits('190')).toBe('02:30');
    expect(formatCardioDurationFromDigits('37')).toBe('00:37');
    expect(formatCardioDurationFromDigits('0037')).toBe('00:37');
    expect(formatCardioDurationFromDigits('7')).toBe('00:07');
  });

  it('parses cardio duration digits into seconds and ignores empty or zero-only values', () => {
    expect(parseCardioDurationInput('137')).toBe(5820);
    expect(parseCardioDurationInput('190')).toBe(9000);
    expect(parseCardioDurationInput('37')).toBe(2220);
    expect(parseCardioDurationInput('0037')).toBe(2220);
    expect(parseCardioDurationInput('7')).toBe(420);

    expect(formatCardioDurationFromDigits('')).toBe('');
    expect(formatCardioDurationFromDigits('0000')).toBe('');
    expect(parseCardioDurationInput('')).toBeNull();
    expect(parseCardioDurationInput('0000')).toBeNull();
  });

  it('parses workout session duration with the same loose digit rule as cardio', () => {
    expect(parseWorkoutDurationInput('137')).toBe(5820);
    expect(parseWorkoutDurationInput('190')).toBe(9000);
    expect(parseWorkoutDurationInput('1a3:7')).toBe(5820);
    expect(parseWorkoutDurationInput('01:37')).toBe(5820);
    expect(parseWorkoutDurationInput('02:30')).toBe(9000);

    expect(parseWorkoutDurationInput('')).toBeNull();
    expect(parseWorkoutDurationInput('0000')).toBeNull();
  });

  it('formats workout session dates and changes only the local date', () => {
    expect(formatWorkoutSessionDateLabel('2026-03-26T10:00:00.000Z')).toBe('26/03/2026');

    expect(replaceWorkoutSessionDate('2026-03-26T10:00:00.000Z', new Date(2026, 2, 25, 12, 0, 0, 0))).toBe(
      '2026-03-25T10:00:00.000Z',
    );
  });

  it('applies workout session title, date and duration while recalculating the end timestamp', () => {
    expect(
      applyWorkoutSessionMeta(
        {
          title: 'Treino A',
          startedAt: '2026-03-26T10:00:00.000Z',
          endedAt: '2026-03-26T10:45:00.000Z',
          durationSeconds: 2700,
        },
        {
          title: 'Treino B',
          startedAt: '2026-03-25T10:00:00.000Z',
          durationSeconds: 4500,
        },
      ),
    ).toEqual({
      title: 'Treino B',
      startedAt: '2026-03-25T10:00:00.000Z',
      endedAt: '2026-03-25T11:15:00.000Z',
      durationSeconds: 4500,
    });
  });
});
