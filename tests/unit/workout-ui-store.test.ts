import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';

describe('workout ui store', () => {
  beforeEach(() => {
    useWorkoutUiStore.getState().clearRest();
    useWorkoutUiStore.getState().pushPrMessage(null);
  });

  it('starts, adjusts and clears the rest timer', () => {
    useWorkoutUiStore.getState().startRest(90, 'notif-1', 'set-1', 'workout-1');

    expect(useWorkoutUiStore.getState().restSeconds).toBe(90);
    expect(useWorkoutUiStore.getState().restNotificationId).toBe('notif-1');
    expect(useWorkoutUiStore.getState().restSourceSetId).toBe('set-1');
    expect(useWorkoutUiStore.getState().restWorkoutId).toBe('workout-1');
    expect(useWorkoutUiStore.getState().restInstanceKey).toEqual(expect.any(String));
    expect(useWorkoutUiStore.getState().dismissedRestInstanceKey).toBeNull();
    expect(useWorkoutUiStore.getState().restFinishedAt).toBeNull();
    expect(useWorkoutUiStore.getState().restRecoveryNotificationInstanceKey).toBeNull();

    useWorkoutUiStore.getState().adjustRest(15);

    expect(useWorkoutUiStore.getState().restSeconds).toBe(105);

    useWorkoutUiStore.getState().clearRest();

    expect(useWorkoutUiStore.getState().restSeconds).toBe(0);
    expect(useWorkoutUiStore.getState().restEndsAt).toBeNull();
    expect(useWorkoutUiStore.getState().restNotificationId).toBeNull();
    expect(useWorkoutUiStore.getState().restSourceSetId).toBeNull();
    expect(useWorkoutUiStore.getState().restWorkoutId).toBeNull();
    expect(useWorkoutUiStore.getState().restInstanceKey).toBeNull();
    expect(useWorkoutUiStore.getState().dismissedRestInstanceKey).toBeNull();
    expect(useWorkoutUiStore.getState().restFinishedAt).toBeNull();
    expect(useWorkoutUiStore.getState().restRecoveryNotificationInstanceKey).toBeNull();
  });

  it('stores the latest PR message', () => {
    useWorkoutUiStore.getState().pushPrMessage('Novo PR');

    expect(useWorkoutUiStore.getState().latestPrMessage).toBe('Novo PR');
  });

  it('ignores rest adjustments when no timer is active and clamps the countdown to zero', () => {
    useWorkoutUiStore.getState().adjustRest(15);
    expect(useWorkoutUiStore.getState().restSeconds).toBe(0);

    useWorkoutUiStore.getState().startRest(10, null, null, 'workout-2');
    useWorkoutUiStore.getState().adjustRest(-30);
    useWorkoutUiStore.getState().setRestNotificationId('notif-2');
    useWorkoutUiStore.getState().setRestSourceSetId('set-2');

    expect(useWorkoutUiStore.getState().restSeconds).toBe(0);
    expect(useWorkoutUiStore.getState().restNotificationId).toBe('notif-2');
    expect(useWorkoutUiStore.getState().restSourceSetId).toBe('set-2');
  });

  it('dismisses only the current rest overlay instance and resets on the next rest', () => {
    useWorkoutUiStore.getState().startRest(45, 'notif-3', 'set-3', 'workout-3');
    const firstKey = useWorkoutUiStore.getState().restInstanceKey;

    useWorkoutUiStore.getState().dismissCurrentRestOverlay();
    expect(useWorkoutUiStore.getState().dismissedRestInstanceKey).toBe(firstKey);

    useWorkoutUiStore.getState().startRest(30, 'notif-4', 'set-4', 'workout-3');

    expect(useWorkoutUiStore.getState().restInstanceKey).not.toBe(firstKey);
    expect(useWorkoutUiStore.getState().dismissedRestInstanceKey).toBeNull();
  });

  it('marks the current rest as finished and prevents duplicate recovery notifications', () => {
    useWorkoutUiStore.getState().startRest(1, 'notif-5', 'set-5', 'workout-5');
    const key = useWorkoutUiStore.getState().restInstanceKey;

    useWorkoutUiStore.getState().markRestFinished();
    useWorkoutUiStore.getState().markRestRecoveryNotified(key);

    expect(useWorkoutUiStore.getState().restFinishedAt).toEqual(expect.any(Number));
    expect(useWorkoutUiStore.getState().restRecoveryNotificationInstanceKey).toBe(key);
    expect(useWorkoutUiStore.getState().restNotificationId).toBe('notif-5');

    useWorkoutUiStore.getState().startRest(30, 'notif-6', 'set-6', 'workout-5');

    expect(useWorkoutUiStore.getState().restFinishedAt).toBeNull();
    expect(useWorkoutUiStore.getState().restRecoveryNotificationInstanceKey).toBeNull();
  });
});
