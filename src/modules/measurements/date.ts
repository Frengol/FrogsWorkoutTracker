const pad2 = (value: number) => String(value).padStart(2, '0');

export const formatMeasurementDateValue = (date: Date) =>
  `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;

export const getTodayMeasurementDateValue = () => formatMeasurementDateValue(new Date());

export const formatMeasurementDateValueFromIso = (recordedAt: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(recordedAt);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const parsedDate = new Date(recordedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return getTodayMeasurementDateValue();
  }

  return formatMeasurementDateValue(parsedDate);
};

export const parseMeasurementDateValue = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

export const toMeasurementRecordedAt = (value: string | Date) => {
  const date = value instanceof Date ? value : parseMeasurementDateValue(value);
  if (!date) {
    return null;
  }

  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString();
};
