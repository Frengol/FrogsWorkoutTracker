export const formatWeight = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 1)} kg`;
};

export const formatReps = (value?: number | null) => {
  if (value == null) {
    return '--';
  }

  return `${value} reps`;
};

export const formatDistance = (meters?: number | null) => {
  if (meters == null) {
    return '--';
  }

  const kilometers = meters / 1000;
  const formattedKilometers = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 3,
  }).format(kilometers);

  return `${formattedKilometers} km`;
};

export const formatPrMetricValue = (metric: string, value?: number | null) => {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }

  if (metric === 'best_distance') {
    return formatDistance(value);
  }

  return String(Math.round(value * 10) / 10);
};

export const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
