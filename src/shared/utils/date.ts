export const nowIso = () => new Date().toISOString();

export const todayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export const startOfDayIso = (input: string) => {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const diffInSeconds = (fromIso: string, toIso = nowIso()) =>
  Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));

export const formatLocalDateTimeLabel = (
  input: string | Date,
  options: { timeZone?: string } = {},
) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return '--/--/---- às --:--';
  }

  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: options.timeZone,
    }).formatToParts(date);
    const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${valueByType.day}/${valueByType.month}/${valueByType.year} às ${valueByType.hour}:${valueByType.minute}`;
  } catch {
    return '--/--/---- às --:--';
  }
};

export const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m ${remainder}s`;
};

export const lastNDays = (days: number) => {
  const dates: string[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let index = days - 1; index >= 0; index -= 1) {
    const cursor = new Date(start);
    cursor.setDate(start.getDate() - index);
    dates.push(todayKey(cursor));
  }

  return dates;
};
