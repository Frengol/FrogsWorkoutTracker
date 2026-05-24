import { formatDuration } from '@/src/shared/utils/date';

export const formatWorkoutDurationInput = (durationSeconds: number) => {
  const safeDurationSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(safeDurationSeconds / 3600);
  const minutes = Math.floor((safeDurationSeconds % 3600) / 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const getWorkoutSessionDateValue = (startedAt: string) => {
  const parsedDate = new Date(startedAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 12, 0, 0, 0);
};

export const formatWorkoutSessionDateLabel = (startedAt: string) => {
  const parsedDate = new Date(startedAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return '--/--/----';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate);
};

export const replaceWorkoutSessionDate = (startedAt: string, nextDate: Date) => {
  const currentStartedAt = new Date(startedAt);

  if (Number.isNaN(currentStartedAt.getTime())) {
    return startedAt;
  }

  return new Date(
    nextDate.getFullYear(),
    nextDate.getMonth(),
    nextDate.getDate(),
    currentStartedAt.getHours(),
    currentStartedAt.getMinutes(),
    currentStartedAt.getSeconds(),
    currentStartedAt.getMilliseconds(),
  ).toISOString();
};

export const getWorkoutSessionStatusLine = (startedAt: string) =>
  `Sessão concluída - ${formatWorkoutSessionDateLabel(startedAt)}`;

export const getWorkoutSessionDurationLine = (durationSeconds: number, exerciseCount: number) =>
  `${formatDuration(durationSeconds)} - ${exerciseCount} exercício${exerciseCount === 1 ? '' : 's'}`;

export const normalizeDurationDigits = (rawValue: string) => rawValue.replace(/\D+/g, '');

export const formatDurationInputFromDigits = (rawValue: string) => {
  const normalizedDigits = normalizeDurationDigits(rawValue);

  if (!normalizedDigits || Number(normalizedDigits) === 0) {
    return '';
  }

  const paddedDigits = normalizedDigits.padStart(2, '0');
  const minuteDigits = paddedDigits.slice(-2);
  const hourDigits = paddedDigits.slice(0, -2) || '0';
  const totalMinutes = Number(hourDigits) * 60 + Number(minuteDigits);
  const formattedHours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const formattedMinutes = String(totalMinutes % 60).padStart(2, '0');

  return `${formattedHours}:${formattedMinutes}`;
};

export const parseDurationInput = (rawValue: string) => {
  const formattedValue = formatDurationInputFromDigits(rawValue);

  if (!formattedValue) {
    return null;
  }

  const [hoursText, minutesText] = formattedValue.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const durationSeconds = hours * 3600 + minutes * 60;
  return durationSeconds > 0 ? durationSeconds : null;
};

export const parseWorkoutDurationInput = parseDurationInput;
export const normalizeCardioDurationDigits = normalizeDurationDigits;
export const formatCardioDurationFromDigits = formatDurationInputFromDigits;
export const parseCardioDurationInput = parseDurationInput;

export const applyWorkoutSessionMeta = <
  T extends {
    startedAt: string;
    title: string;
    durationSeconds: number;
    endedAt?: string | null;
  },
>(
  workout: T,
  nextMeta: {
    title: string;
    startedAt?: string;
    durationSeconds: number;
  },
): T => {
  const normalizedTitle = nextMeta.title.trim();
  const normalizedDurationSeconds = Math.max(1, Math.floor(nextMeta.durationSeconds));
  const startedAt = nextMeta.startedAt ?? workout.startedAt;
  const startedAtTimestamp = Date.parse(startedAt);
  const endedAt = Number.isNaN(startedAtTimestamp)
    ? workout.endedAt
    : new Date(startedAtTimestamp + normalizedDurationSeconds * 1000).toISOString();

  return {
    ...workout,
    title: normalizedTitle,
    startedAt,
    durationSeconds: normalizedDurationSeconds,
    endedAt,
  } as T;
};
