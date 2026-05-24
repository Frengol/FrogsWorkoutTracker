import { Equipment, ExerciseModality, MuscleGroup } from '@/src/shared/types/domain';

export const muscleGroups: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
  'full_body',
  'cardio',
];

export const equipmentOptions: Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'smith_machine',
  'band',
  'cardio_machine',
  'ez_bar',
  'bench',
  'plate',
  'other',
];

export const modalityOptions: ExerciseModality[] = ['strength', 'bodyweight', 'timed', 'distance'];
