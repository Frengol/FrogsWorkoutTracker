import { z } from 'zod';

import exercisesCatalogJson from '@/data/exercises.catalog.json';
import workoutsLibraryJson from '@/data/workouts.library.json';
import { equipmentOptions, modalityOptions, muscleGroups } from '@/src/modules/exercises/constants';
import { Equipment, ExerciseModality, MuscleGroup } from '@/src/shared/types/domain';

const exerciseCatalogEntrySchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  muscleGroup: z.enum(muscleGroups as [MuscleGroup, ...MuscleGroup[]]),
  secondaryMuscles: z.array(z.enum(muscleGroups as [MuscleGroup, ...MuscleGroup[]])).default([]),
  equipment: z.enum(equipmentOptions as [Equipment, ...Equipment[]]),
  modality: z.enum(modalityOptions as [ExerciseModality, ...ExerciseModality[]]),
  instructions: z.string().trim().min(1),
});

const workoutLibraryEntrySchema = z.object({
  folderName: z.string().trim().min(1),
  colorToken: z.string().trim().min(1).default('blue'),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  estimatedMinutes: z.number().int().positive().default(45),
  source: z.enum(['library', 'custom', 'copied']).default('library'),
  exercises: z
    .array(
      z.object({
        exerciseSlug: z.string().trim().min(1),
        targetSets: z.number().int().positive(),
        targetRepsLabel: z.string().trim().min(1),
        restSeconds: z.number().int().nonnegative(),
        note: z.string().trim().optional().default(''),
        privateLink: z.string().trim().optional().default(''),
        supersetGroup: z.string().trim().optional().default(''),
        warmupEnabled: z.boolean().optional().default(false),
      }),
    )
    .min(1),
});

export type ExerciseCatalogEntry = z.infer<typeof exerciseCatalogEntrySchema>;
export type WorkoutLibraryEntry = z.infer<typeof workoutLibraryEntrySchema>;

export const exerciseCatalog = z.array(exerciseCatalogEntrySchema).parse(exercisesCatalogJson);
export const workoutLibrary = z.array(workoutLibraryEntrySchema).parse(workoutsLibraryJson);
