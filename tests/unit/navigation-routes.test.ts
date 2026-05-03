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

  it('resolves notification targets to valid public routes', () => {
    expect(resolveNotificationTarget({ routeKey: 'home' })).toBe(routes.home());
    expect(resolveNotificationTarget({ routeKey: 'progress', params: { view: 'body' } })).toEqual(
      routes.progress({ view: 'body' }),
    );
    expect(resolveNotificationTarget({ routeKey: 'workoutStart' })).toBe(routes.workout.start());
    expect(resolveNotificationTarget({ routeKey: 'workoutLive', params: { workoutId: 'workout-1' } })).toEqual(
      routes.workout.live('workout-1'),
    );
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
