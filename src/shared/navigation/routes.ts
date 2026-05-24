import { Href } from 'expo-router';

type ProgressParams = {
  view?: string;
  quick?: string;
};

type WorkoutLiveParams = {
  mode?: 'history-edit';
  focusSetId?: string;
};

export type ExerciseReturnTo = 'routineEditor' | 'workoutLive' | 'historyEdit';

export type ExerciseReturnContextParams = {
  returnTo?: ExerciseReturnTo;
  contextId?: string;
  workoutId?: string;
};

type CustomExerciseCreateParams = {
  initialName?: string;
} & ExerciseReturnContextParams;

type ImportReviewParams = {
  returnTo?: 'profile' | 'settingsData' | 'library';
};

type ImportFileParams = {
  uri: string;
  fileName?: string;
};

export type NotificationTarget =
  | { routeKey: 'home' }
  | { routeKey: 'progress'; params?: ProgressParams }
  | { routeKey: 'workoutStart' }
  | { routeKey: 'workoutLive'; params: { workoutId: string } };

const href = <T extends Href>(value: T) => value;

const compactParams = <T extends Record<string, string | undefined>>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === 'string' && value.length > 0)) as Partial<T>;

const legacyRouteAliases: Record<string, string> = {
  '/(onboarding)/index': '/onboarding',
  '/(tabs)': '/home',
  '/(tabs)/home': '/home',
  '/(tabs)/index': '/home',
  '/(tabs)/library': '/library',
  '/(tabs)/progress': '/progress',
  '/(tabs)/profile': '/profile',
};

const normalizePathname = (pathname: string) => {
  const trimmed = pathname.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');

  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }

  return collapsed;
};

const extractIncomingPath = (path: string | null | undefined) => {
  if (!path) {
    return '/';
  }

  const raw = path.trim();
  if (!raw) {
    return '/';
  }

  try {
    if (raw.includes('://')) {
      const url = new URL(raw);
      const pathname = url.pathname || '/';
      const isFrogScheme = url.protocol === 'frogworkouttracker:';

      if (isFrogScheme && url.host) {
        return `/${url.host}${pathname}${url.search ?? ''}`;
      }

      return `${pathname}${url.search ?? ''}`;
    }
  } catch {
    return raw;
  }

  return raw;
};

export const normalizeIncomingPath = (path: string | null | undefined) => {
  const incoming = extractIncomingPath(path);
  const [pathnamePart, ...queryParts] = incoming.split('?');
  const pathname = normalizePathname(pathnamePart || '/');
  const resolvedPathname = legacyRouteAliases[pathname] ?? pathname;
  const query = queryParts.length > 0 ? `?${queryParts.join('?')}` : '';

  return `${resolvedPathname}${query}`;
};

const isExternalFileUri = (path: string | null | undefined) => {
  const raw = path?.trim();
  if (!raw) {
    return false;
  }

  try {
    const url = new URL(raw);
    return url.protocol === 'content:' || url.protocol === 'file:';
  } catch {
    return false;
  }
};

export const normalizeIncomingSystemPath = (path: string | null | undefined) => {
  const raw = path?.trim();
  if (isExternalFileUri(raw)) {
    return `/settings/import-file?uri=${encodeURIComponent(raw ?? '')}`;
  }

  return normalizeIncomingPath(path);
};

export const routes = {
  root: () => href('/'),
  onboarding: () => href('/onboarding'),
  home: () => href('/home'),
  library: () => href('/library'),
  progress: (params?: ProgressParams) =>
    params ? href({ pathname: '/progress', params }) : href('/progress'),
  progressMeasurementEdit: (measurementId: string) =>
    ({ pathname: '/progress/measurements/[measurementId]', params: { measurementId } } as unknown) as Href,
  profile: () => href('/profile'),
  settings: () => href('/settings'),
  settingsData: () => href('/settings/data'),
  settingsRoutineExport: () => href('/settings/routine-export' as Href),
  settingsWorkoutExport: () => href('/settings/workout-export' as Href),
  settingsImportFile: (params: ImportFileParams) =>
    ({
      pathname: '/settings/import-file',
      params: { uri: params.uri, ...(params.fileName ? { fileName: params.fileName } : {}) },
    } as unknown) as Href,
  settingsImportReview: (importJobId: string, params?: ImportReviewParams) =>
    ({
      pathname: '/settings/import-review',
      params: { importJobId, ...(params?.returnTo ? { returnTo: params.returnTo } : {}) },
    } as unknown) as Href,
  reports: {
    monthly: () => href('/reports/monthly'),
    yearly: () => href('/reports/yearly'),
  },
  routines: {
    create: () => href('/routines/new'),
    detail: (routineId: string) => href({ pathname: '/routines/[routineId]', params: { routineId } }),
  },
  exercises: {
    custom: (params?: string | CustomExerciseCreateParams) => {
      if (!params) {
        return href('/exercises/custom');
      }

      if (typeof params === 'string') {
        return href({ pathname: '/exercises/custom', params: { exerciseId: params } });
      }

      const routeParams = compactParams({
        initialName: params.initialName,
        returnTo: params.returnTo,
        contextId: params.contextId,
        workoutId: params.workoutId,
      });

      return Object.keys(routeParams).length > 0
        ? href({ pathname: '/exercises/custom', params: routeParams })
        : href('/exercises/custom');
    },
    detail: (exerciseId: string, params?: ExerciseReturnContextParams) =>
      href({
        pathname: '/exercises/[exerciseId]',
        params: {
          exerciseId,
          ...compactParams({
            returnTo: params?.returnTo,
            contextId: params?.contextId,
            workoutId: params?.workoutId,
          }),
        },
      }),
  },
  workout: {
    start: () => href('/workout/start'),
    live: (workoutId: string, params?: WorkoutLiveParams) =>
      href({ pathname: '/workout/live/[workoutId]', params: { workoutId, ...compactParams(params ?? {}) } }),
    finish: (workoutId: string) => href({ pathname: '/workout/finish/[workoutId]', params: { workoutId } }),
    details: (workoutId: string) => href({ pathname: '/workout/details/[workoutId]', params: { workoutId } }),
  },
} as const;

export const resolveNotificationTarget = (target: NotificationTarget): Href => {
  switch (target.routeKey) {
    case 'home':
      return routes.home();
    case 'progress':
      return routes.progress(target.params);
    case 'workoutStart':
      return routes.workout.start();
    case 'workoutLive':
      return routes.workout.live(target.params.workoutId);
  }
};

export const isNotificationTarget = (value: unknown): value is NotificationTarget => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const routeKey = 'routeKey' in value ? (value as { routeKey?: unknown }).routeKey : null;
  if (routeKey === 'home' || routeKey === 'workoutStart') {
    return true;
  }

  if (routeKey === 'progress') {
    const params = (value as { params?: ProgressParams }).params;
    return !params || typeof params === 'object';
  }

  if (routeKey === 'workoutLive') {
    const params = (value as { params?: { workoutId?: unknown } }).params;
    return Boolean(params && typeof params.workoutId === 'string' && params.workoutId.length > 0);
  }

  return false;
};
