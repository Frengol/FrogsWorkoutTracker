export const nowIso = () => new Date().toISOString();

export const todayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export const startOfDayIso = (input: string) => {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const diffInSeconds = (fromIso: string, toIso = nowIso()) =>
  Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));

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
