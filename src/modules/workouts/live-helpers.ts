import { SetType, WorkoutLiveSupportedSetType, WorkoutPreviousValues } from '@/src/shared/types/domain';
import { formatWorkoutPreviousValues } from '@/src/modules/workouts/cardio';

type SetLike = {
  id: string;
  type: SetType;
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  speed?: number | null;
  elevation?: number | null;
  rpe?: number | null;
};

type PreviousLike = WorkoutPreviousValues & {
  type: SetType;
};

export const normalizeLiveSetType = (type: SetType): WorkoutLiveSupportedSetType => {
  if (type === 'warmup') {
    return 'warmup';
  }

  if (type === 'failure') {
    return 'failure';
  }

  return 'normal';
};

export const formatPreviousMatchLabel = (values?: WorkoutPreviousValues | null) => {
  return formatWorkoutPreviousValues(values) ?? '--';
};

export const buildLiveSetRows = (
  currentSets: SetLike[],
  previousSets: PreviousLike[] = [],
) => {
  const currentTypeCounts: Record<WorkoutLiveSupportedSetType, number> = {
    warmup: 0,
    normal: 0,
    failure: 0,
  };

  const previousBuckets: Record<WorkoutLiveSupportedSetType, WorkoutPreviousValues[]> = {
    warmup: [],
    normal: [],
    failure: [],
  };

  previousSets.forEach((set) => {
    previousBuckets[normalizeLiveSetType(set.type)].push({
      reps: set.reps ?? null,
      weightKg: set.weightKg ?? null,
      durationSeconds: set.durationSeconds ?? null,
      distanceMeters: set.distanceMeters ?? null,
      speed: set.speed ?? null,
      elevation: set.elevation ?? null,
      rpe: set.rpe ?? null,
    });
  });

  return currentSets.map((set) => {
    const supportedType = normalizeLiveSetType(set.type);
    currentTypeCounts[supportedType] += 1;
    const typeOccurrence = currentTypeCounts[supportedType];

    const previousMatch = previousBuckets[supportedType][typeOccurrence - 1] ?? null;

    return {
      ...set,
      supportedType,
      typeOccurrence,
      seriesLabel:
        supportedType === 'warmup'
          ? 'A'
          : supportedType === 'failure'
            ? 'F'
            : String(typeOccurrence),
      previousMatch,
      previousMatchLabel: formatPreviousMatchLabel(previousMatch),
    };
  });
};
