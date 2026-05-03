import { Href } from 'expo-router';

type ProgressParams = {
  view?: string;
  quick?: string;
};

type WorkoutLiveParams = {
  mode?: 'history-edit';
};

type ImportReviewParams = {
  returnTo?: 'profile' | 'settingsData' | 'library';
};

export type NotificationTarget =
  | { routeKey: 'home' }
  | { routeKey: 'progress'; params?: ProgressParams }
  | { routeKey: 'workoutStart' }
  | { routeKey: 'workoutLive'; params: { workoutId: string } };

const href = <T extends Href>(value: T) => value;

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
    custom: (exerciseId?: string) =>
      exerciseId
        ? href({ pathname: '/exercises/custom', params: { exerciseId } })
        : href('/exercises/custom'),
    detail: (exerciseId: string) => href({ pathname: '/exercises/[exerciseId]', params: { exerciseId } }),
  },
  workout: {
    start: () => href('/workout/start'),
    live: (workoutId: string, params?: WorkoutLiveParams) =>
      href({ pathname: '/workout/live/[workoutId]', params: { workoutId, ...(params ?? {}) } }),
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
