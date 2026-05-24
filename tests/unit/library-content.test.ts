import { exerciseCatalog, workoutLibrary } from '@/src/shared/content/library-content';

describe('library content', () => {
  it('loads the exercise catalog in PT-BR with stable slugs', () => {
    expect(exerciseCatalog.length).toBeGreaterThanOrEqual(250);
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

  it('does not ship built-in saved workout routines', () => {
    expect(workoutLibrary).toEqual([]);
  });

  it('uses Barra W (EZ) display copy while keeping the stable ez_bar equipment id', () => {
    const ezBarExercises = exerciseCatalog.filter((entry) => entry.equipment === 'ez_bar');
    const exerciseBySlug = new Map(exerciseCatalog.map((entry) => [entry.slug, entry]));

    expect(ezBarExercises.length).toBeGreaterThan(0);
    expect(exerciseCatalog.some((entry) => /barra EZ/i.test(entry.name))).toBe(false);
    expect(exerciseBySlug.get('ez-bar-curl')).toMatchObject({
      name: 'Rosca com barra W (EZ)',
      equipment: 'ez_bar',
    });
    expect(exerciseBySlug.get('reverse-ez-curl')).toMatchObject({
      name: 'Rosca inversa com barra W (EZ)',
      equipment: 'ez_bar',
    });
  });

  it('supports plate as the runtime equipment id for plate-only exercises', () => {
    const exerciseBySlug = new Map(exerciseCatalog.map((entry) => [entry.slug, entry]));

    expect(exerciseBySlug.get('plate-pinch-hold')).toMatchObject({
      name: 'Pegada pinça com anilhas',
      equipment: 'plate',
    });
    expect(exerciseBySlug.get('plate-pinch-hold')?.instructions).toMatch(/segure/i);
    expect(exerciseBySlug.get('plate-loaded-chest-press')).toMatchObject({
      name: 'Supino reto articulado',
      equipment: 'machine',
    });
  });

  it('includes the plate-loaded Bulgarian split squat as a machine exercise', () => {
    const exerciseBySlug = new Map(exerciseCatalog.map((entry) => [entry.slug, entry]));

    expect(exerciseBySlug.get('plate-loaded-bulgarian-split-squat')).toMatchObject({
      name: 'Agachamento búlgaro articulado',
      aliases: ['Plate-Loaded Bulgarian Split Squat', 'Lever Bulgarian Split Squat', 'Machine Bulgarian Split Squat'],
      muscleGroup: 'glutes',
      secondaryMuscles: ['quads'],
      equipment: 'machine',
      modality: 'strength',
    });
  });

  it('includes the latest editorial machine and cable additions', () => {
    const exerciseBySlug = new Map(exerciseCatalog.map((entry) => [entry.slug, entry]));

    expect(exerciseBySlug.get('lean-away-cable-lateral-raise')).toMatchObject({
      name: 'Elevação lateral inclinada na polia',
      aliases: [
        'Lean-Away Cable Lateral Raise',
        'Leaning Cable Lateral Raise',
        'Cable Lean-Away Lateral Raise',
      ],
      muscleGroup: 'shoulders',
      secondaryMuscles: ['triceps'],
      equipment: 'cable',
      modality: 'strength',
    });
    expect(exerciseBySlug.get('machine-seated-row')).toMatchObject({
      name: 'Remada baixa na máquina',
      aliases: ['Machine Seated Row', 'Seated Row Machine', 'Machine Row'],
      muscleGroup: 'back',
      secondaryMuscles: ['biceps'],
      equipment: 'machine',
      modality: 'strength',
    });
    expect(exerciseBySlug.get('machine-high-row')).toMatchObject({
      name: 'Remada alta na máquina',
      aliases: ['Machine High Row', 'High Row Machine', 'Seated High Row Machine'],
      muscleGroup: 'back',
      secondaryMuscles: ['biceps'],
      equipment: 'machine',
      modality: 'strength',
    });
    expect(exerciseBySlug.get('machine-bent-over-row')).toMatchObject({
      name: 'Remada curvada na máquina',
      aliases: ['Machine Bent-Over Row', 'Bent-Over Row Machine', 'Machine Supported Row'],
      muscleGroup: 'back',
      secondaryMuscles: ['biceps'],
      equipment: 'machine',
      modality: 'strength',
    });
  });
});
