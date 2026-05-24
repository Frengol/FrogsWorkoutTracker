import { redirectSystemPath } from '@/app/+native-intent';
import { isNotificationTarget, normalizeIncomingPath, resolveNotificationTarget, routes } from '@/src/shared/navigation/routes';

describe('navigation routes', () => {
  it('normalizes incoming root and legacy grouped paths', () => {
    expect(normalizeIncomingPath('frogworkouttracker:///')).toBe('/');
    expect(normalizeIncomingPath('frogworkouttracker:///home')).toBe('/home');
    expect(normalizeIncomingPath('/(tabs)/progress?view=body')).toBe('/progress?view=body');
    expect(normalizeIncomingPath('/(onboarding)/index')).toBe('/onboarding');
  });

  it('normalizes blank, relative, trailing-slash and malformed incoming paths', () => {
    expect(normalizeIncomingPath('')).toBe('/');
    expect(normalizeIncomingPath('progress/')).toBe('/progress');
    expect(normalizeIncomingPath('library')).toBe('/library');
    expect(normalizeIncomingPath('frogworkouttracker:///(tabs)/library')).toBe('/library');
    expect(normalizeIncomingPath('frogworkouttracker://workout/live/abc')).toBe('/workout/live/abc');
    expect(normalizeIncomingPath('frogworkouttracker:///workout/live/abc')).toBe('/workout/live/abc');
    expect(normalizeIncomingPath('://not-a-valid-url')).toBe('/:/not-a-valid-url');
  });

  it('normalizes native intents before routing', async () => {
    await expect(redirectSystemPath({ path: 'frogworkouttracker:///', initial: true })).resolves.toBe('/');
    await expect(redirectSystemPath({ path: '/(tabs)', initial: false })).resolves.toBe('/home');
    await expect(redirectSystemPath({ path: 'frogworkouttracker://workout/live/workout-1', initial: true })).resolves.toBe(
      '/workout/live/workout-1',
    );
  });

  it('routes incoming Android file intents to the external import flow', async () => {
    const csvUri = 'content://com.whatsapp.provider/document/frog-workouts.csv';
    const jsonUri = 'file:///storage/emulated/0/Download/frog-routine.json';

    await expect(redirectSystemPath({ path: csvUri, initial: true })).resolves.toBe(
      `/settings/import-file?uri=${encodeURIComponent(csvUri)}`,
    );
    await expect(redirectSystemPath({ path: jsonUri, initial: true })).resolves.toBe(
      `/settings/import-file?uri=${encodeURIComponent(jsonUri)}`,
    );
  });

  it('resolves notification targets to valid public routes', () => {
    expect(resolveNotificationTarget({ routeKey: 'home' })).toBe(routes.home());
    expect(resolveNotificationTarget({ routeKey: 'progress', params: { view: 'body' } })).toEqual(
      routes.progress({ view: 'body' }),
    );
    expect(resolveNotificationTarget({ routeKey: 'workoutStart' })).toBe(routes.workout.start());
    expect(resolveNotificationTarget({ routeKey: 'workoutLive', params: { workoutId: 'workout-1' } })).toEqual(
      routes.workout.live('workout-1'),
    );
    expect(routes.workout.live('workout-1', { focusSetId: 'set-1' })).toEqual({
      pathname: '/workout/live/[workoutId]',
      params: { workoutId: 'workout-1', focusSetId: 'set-1' },
    });
  });

  it('builds custom exercise routes for editing and prefilled creation', () => {
    expect(routes.exercises.custom()).toBe('/exercises/custom');
    expect(routes.exercises.custom('exercise-1')).toEqual({
      pathname: '/exercises/custom',
      params: { exerciseId: 'exercise-1' },
    });
    expect(routes.exercises.custom({ initialName: 'Elevação lateral' })).toEqual({
      pathname: '/exercises/custom',
      params: { initialName: 'Elevação lateral' },
    });
    expect(
      routes.exercises.custom({
        initialName: 'Elevação lateral',
        returnTo: 'workoutLive',
        workoutId: 'workout-1',
      }),
    ).toEqual({
      pathname: '/exercises/custom',
      params: {
        initialName: 'Elevação lateral',
        returnTo: 'workoutLive',
        workoutId: 'workout-1',
      },
    });
    expect(routes.exercises.custom({ returnTo: 'routineEditor', contextId: 'routine-editor:new' })).toEqual({
      pathname: '/exercises/custom',
      params: { returnTo: 'routineEditor', contextId: 'routine-editor:new' },
    });
  });

  it('builds exercise detail routes with optional return context', () => {
    expect(routes.exercises.detail('exercise-1')).toEqual({
      pathname: '/exercises/[exerciseId]',
      params: { exerciseId: 'exercise-1' },
    });
    expect(routes.exercises.detail('exercise-1', { returnTo: 'historyEdit', contextId: 'history-edit:workout-1' })).toEqual({
      pathname: '/exercises/[exerciseId]',
      params: {
        exerciseId: 'exercise-1',
        returnTo: 'historyEdit',
        contextId: 'history-edit:workout-1',
      },
    });
  });

  it('accepts only valid notification targets', () => {
    expect(isNotificationTarget({ routeKey: 'home' })).toBe(true);
    expect(isNotificationTarget({ routeKey: 'progress', params: { quick: 'weight' } })).toBe(true);
    expect(isNotificationTarget({ routeKey: 'workoutStart' })).toBe(true);
    expect(isNotificationTarget({ routeKey: 'workoutLive', params: { workoutId: 'abc' } })).toBe(true);
    expect(isNotificationTarget({ routeKey: 'progress', params: 'errado' })).toBe(false);
    expect(isNotificationTarget({ routeKey: 'workoutLive', params: { workoutId: '' } })).toBe(false);
    expect(isNotificationTarget({ routeKey: 'workoutLive', params: {} })).toBe(false);
    expect(isNotificationTarget({ routeKey: 'unknown' })).toBe(false);
    expect(isNotificationTarget(null)).toBe(false);
  });

});
