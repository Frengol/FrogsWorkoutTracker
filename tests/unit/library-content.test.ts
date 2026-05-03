import { exerciseCatalog, workoutLibrary } from '@/src/shared/content/library-content';

describe('library content', () => {
  it('loads the exercise catalog in PT-BR with stable slugs', () => {
    expect(exerciseCatalog.length).toBeGreaterThan(20);
    expect(exerciseCatalog.every((entry) => entry.name.trim().length > 0)).toBe(true);
    expect(exerciseCatalog.every((entry) => entry.slug.trim().length > 0)).toBe(true);
  });

  it('only references existing exercise slugs inside built-in workouts', () => {
    const knownSlugs = new Set(exerciseCatalog.map((entry) => entry.slug));

    const missingReferences = workoutLibrary.flatMap((workout) =>
      workout.exercises
        .filter((exercise) => !knownSlugs.has(exercise.exerciseSlug))
        .map((exercise) => `${workout.name} -> ${exercise.exerciseSlug}`),
    );

    expect(missingReferences).toEqual([]);
  });
});
