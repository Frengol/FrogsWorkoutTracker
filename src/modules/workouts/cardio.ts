import { Equipment, MuscleGroup, WorkoutPreviousValues } from '@/src/shared/types/domain';
import { formatDuration } from '@/src/shared/utils/date';
import { formatDistance } from '@/src/shared/utils/format';

type ExerciseClassification = {
  muscleGroup: MuscleGroup;
  equipment: Equipment;
};

const formatNumber = (value: number) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return '';
  }

  if (Number.isInteger(normalized)) {
    return String(normalized);
  }

  return normalized.toFixed(2).replace(/\.?0+$/, '');
};

export const normalizeKilometersInput = (value: string) => {
  const normalized = value.replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const [integerPart, ...decimalParts] = normalized.split(',');
  return decimalParts.length > 0 ? `${integerPart},${decimalParts.join('')}` : integerPart;
};

export const parseKilometersInputToMeters = (value: string) => {
  const normalized = normalizeKilometersInput(value).trim();

  if (!normalized) {
    return null;
  }

  const kilometers = Number(normalized.replace(',', '.'));
  return Number.isFinite(kilometers) ? Math.round(kilometers * 1000) : null;
};

export const formatKilometersInputFromMeters = (meters?: number | null) => {
  if (meters == null || Number.isNaN(meters)) {
    return '';
  }

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 3,
  }).format(meters / 1000);
};

export const normalizeKilometersInputOnBlur = (value: string) => {
  const meters = parseKilometersInputToMeters(value);
  return meters == null ? '' : formatKilometersInputFromMeters(meters);
};

export const isCardioExercise = ({ muscleGroup }: Pick<ExerciseClassification, 'muscleGroup'>) => muscleGroup === 'cardio';

export const usesCardioMachineFields = ({ muscleGroup, equipment }: ExerciseClassification) =>
  muscleGroup === 'cardio' && equipment === 'cardio_machine';

export const formatWorkoutPreviousValues = (values?: WorkoutPreviousValues | null) => {
  if (!values) {
    return null;
  }

  if (values.weightKg != null && values.reps != null) {
    return `${formatNumber(values.weightKg)} kg x ${formatNumber(values.reps)}`;
  }

  if (values.weightKg != null) {
    return `${formatNumber(values.weightKg)} kg`;
  }

  const cardioParts: string[] = [];

  if (values.durationSeconds != null) {
    cardioParts.push(formatDuration(values.durationSeconds));
  }

  if (values.distanceMeters != null) {
    cardioParts.push(formatDistance(values.distanceMeters));
  }

  if (values.speed != null) {
    cardioParts.push(`vel ${formatNumber(values.speed)}`);
  }

  if (values.elevation != null) {
    cardioParts.push(`nível ${formatNumber(values.elevation)}`);
  }

  if (cardioParts.length > 0) {
    return cardioParts.join(' · ');
  }

  if (values.reps != null) {
    return `${formatNumber(values.reps)} reps`;
  }

  return null;
};
