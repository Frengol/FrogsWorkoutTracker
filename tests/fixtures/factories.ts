import { RoutineComposerInput } from '@/src/shared/types/domain';

export const createRoutineComposerInput = (
  overrides: Partial<RoutineComposerInput> = {},
): RoutineComposerInput => ({
  name: 'Upper Blue',
  description: 'Treino focado em membros superiores.',
  folderName: 'Forca',
  exercises: [
    {
      exerciseId: 'seed-bench-press',
      targetSets: 4,
      targetRepsLabel: '6-8',
      restSeconds: 120,
      note: 'Subir carga quando fechar 8 reps.',
      privateLink: '',
      supersetGroup: '',
      warmupEnabled: true,
    },
  ],
  ...overrides,
});

export const createLocalProfileSettingsInput = (overrides: Record<string, unknown> = {}) => ({
  displayName: 'Ana Frog',
  experienceLevel: 'intermediate' as const,
  unitSystem: 'metric' as const,
  defaultRestSeconds: 120,
  weekStartsOn: 1 as const,
  keepAwake: true,
  restOverlayEnabled: false,
  restTimerNotificationEnabled: true,
  prNotificationEnabled: true,
  remindersEnabled: true,
  reportsEnabled: true,
  reminderTimeLocal: '19:30',
  reminderDays: [2, 4, 6],
  ...overrides,
});
