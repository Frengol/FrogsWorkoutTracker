import {
  formatMeasurementDateValue,
  formatMeasurementDateValueFromIso,
  parseMeasurementDateValue,
  toMeasurementRecordedAt,
} from '@/src/modules/measurements/date';

describe('measurement date helpers', () => {
  it('formats dates as dd/mm/aaaa using the local date parts', () => {
    expect(formatMeasurementDateValue(new Date(2026, 3, 22, 22, 13, 0))).toBe('22/04/2026');
    expect(formatMeasurementDateValueFromIso('2026-04-22T01:00:00.000Z')).toBe('22/04/2026');
  });

  it('parses dd/mm/aaaa safely and stores the selected day at utc noon', () => {
    const parsed = parseMeasurementDateValue('22/04/2026');

    expect(parsed).toEqual(new Date(2026, 3, 22));
    expect(toMeasurementRecordedAt('22/04/2026')).toBe('2026-04-22T12:00:00.000Z');
  });

  it('rejects invalid dates and keeps invalid values from being persisted', () => {
    expect(parseMeasurementDateValue('31/02/2026')).toBeNull();
    expect(toMeasurementRecordedAt('31/02/2026')).toBeNull();
  });
});
