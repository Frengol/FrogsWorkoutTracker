import { getMuscleGroupLabel } from '@/src/shared/copy/labels';
import { WorkoutLiveModel } from '@/src/shared/types/domain';

export const getWorkoutCompletedSetsCount = (model: WorkoutLiveModel) =>
  model.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.isCompleted).length, 0);

export const getWorkoutMuscleSetBreakdown = (model: WorkoutLiveModel) =>
  Object.entries(
    model.exercises.reduce<Record<string, number>>((accumulator, exercise) => {
      const completedSets = exercise.sets.filter((set) => set.isCompleted).length;
      if (completedSets < 1) {
        return accumulator;
      }

      const muscleGroup = exercise.exercise.muscleGroup;
      accumulator[muscleGroup] = (accumulator[muscleGroup] ?? 0) + completedSets;
      return accumulator;
    }, {}),
  )
    .map(([muscleGroup, sets]) => ({
      muscle: getMuscleGroupLabel(muscleGroup as Parameters<typeof getMuscleGroupLabel>[0]),
      sets,
    }))
    .sort((left, right) => {
      if (right.sets !== left.sets) {
        return right.sets - left.sets;
      }

      return left.muscle.localeCompare(right.muscle, 'pt-BR');
    });
