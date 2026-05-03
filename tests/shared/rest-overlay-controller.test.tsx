import React from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(),
}));

jest.mock('@/src/modules/notifications/service', () => ({
  cancelScheduledNotification: jest.fn(() => Promise.resolve()),
}));

let overlayDismissListener: (() => void) | null = null;
let overlayPressedListener: ((event: { workoutId: string | null }) => void) | null = null;
let appStateListener: ((state: AppStateStatus) => void) | null = null;

jest.mock('@/src/modules/rest-overlay/service', () => ({
  addOverlayDismissedListener: jest.fn((listener: () => void) => {
    overlayDismissListener = listener;
    return { remove: jest.fn() };
  }),
  addOverlayPressedListener: jest.fn((listener: (event: { workoutId: string | null }) => void) => {
    overlayPressedListener = listener;
    return { remove: jest.fn() };
  }),
  hideRestOverlay: jest.fn(() => Promise.resolve()),
  isOverlayPermissionGranted: jest.fn(() => true),
  isRestOverlaySupported: jest.fn(() => true),
  showRestOverlay: jest.fn(() => Promise.resolve()),
  updateRestOverlay: jest.fn(() => Promise.resolve()),
}));

import { router, usePathname } from 'expo-router';

import { getIdentitySnapshot } from '@/src/modules/identity/service';
import { cancelScheduledNotification } from '@/src/modules/notifications/service';
import {
  hideRestOverlay,
  showRestOverlay,
  updateRestOverlay,
} from '@/src/modules/rest-overlay/service';
import { RestOverlayController } from '@/src/shared/config/rest-overlay-controller';
import { routes } from '@/src/shared/navigation/routes';
import { act, renderScreen, waitFor } from '@/tests/utils/render';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';

describe('RestOverlayController', () => {
  const originalPlatform = Platform.OS;
  const originalAppState = AppState.currentState;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    overlayDismissListener = null;
    overlayPressedListener = null;
    appStateListener = null;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') {
        appStateListener = listener;
      }

      return {
        remove: jest.fn(() => {
          appStateListener = null;
        }),
      } as any;
    });
    useWorkoutUiStore.getState().clearRest();
    (usePathname as jest.Mock).mockReturnValue('/home');
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      preferences: {
        restOverlayEnabled: true,
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: originalAppState,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the Android overlay when there is an active rest outside the live workout route', async () => {
    useWorkoutUiStore.getState().startRest(90, 'notif-1', 'set-1', 'workout-1');

    renderScreen(<RestOverlayController />);

    await waitFor(() =>
      expect(updateRestOverlay).toHaveBeenCalledWith({
        workoutId: 'workout-1',
        endsAtMs: expect.any(Number),
      }),
    );
  });

  it('keeps the active rest intact when native overlay update and show fail', async () => {
    (updateRestOverlay as jest.Mock).mockRejectedValueOnce(new Error('update failed'));
    (showRestOverlay as jest.Mock).mockRejectedValueOnce(new Error('show failed'));
    useWorkoutUiStore.getState().startRest(90, 'notif-native-fail', 'set-native-fail', 'workout-native-fail');
    const currentEndsAt = useWorkoutUiStore.getState().restEndsAt;
    const currentRestSeconds = useWorkoutUiStore.getState().restSeconds;
    const currentWorkoutId = useWorkoutUiStore.getState().restWorkoutId;

    renderScreen(<RestOverlayController />);

    await waitFor(() =>
      expect(showRestOverlay).toHaveBeenCalledWith({
        workoutId: 'workout-native-fail',
        endsAtMs: expect.any(Number),
      }),
    );

    expect(useWorkoutUiStore.getState().restEndsAt).toBe(currentEndsAt);
    expect(useWorkoutUiStore.getState().restSeconds).toBe(currentRestSeconds);
    expect(useWorkoutUiStore.getState().restWorkoutId).toBe(currentWorkoutId);
  });

  it('shows the Android overlay when the app goes to the background from the live route', async () => {
    (usePathname as jest.Mock).mockReturnValue('/workout/live/workout-1');
    useWorkoutUiStore.getState().startRest(90, 'notif-bg', 'set-bg', 'workout-bg');

    renderScreen(<RestOverlayController />);

    act(() => {
      appStateListener?.('background');
    });

    await waitFor(() =>
      expect(updateRestOverlay).toHaveBeenCalledWith({
        workoutId: 'workout-bg',
        endsAtMs: expect.any(Number),
      }),
    );
  });

  it('hides the overlay again when the app returns active on the live route', async () => {
    (usePathname as jest.Mock).mockReturnValue('/workout/live/workout-1');
    useWorkoutUiStore.getState().startRest(90, 'notif-return', 'set-return', 'workout-return');

    renderScreen(<RestOverlayController />);

    act(() => {
      appStateListener?.('background');
    });

    await waitFor(() => expect(updateRestOverlay).toHaveBeenCalled());
    (updateRestOverlay as jest.Mock).mockClear();
    (hideRestOverlay as jest.Mock).mockClear();

    act(() => {
      appStateListener?.('active');
    });

    await waitFor(() => expect(hideRestOverlay).toHaveBeenCalled());
    expect(updateRestOverlay).not.toHaveBeenCalled();
  });

  it('hides the overlay and clears rest state when the countdown expires', async () => {
    jest.useFakeTimers();
    useWorkoutUiStore.getState().startRest(1, 'notif-2', 'set-2', 'workout-2');

    renderScreen(<RestOverlayController />);

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => expect(cancelScheduledNotification).toHaveBeenCalledWith('notif-2'));
    await waitFor(() => expect(hideRestOverlay).toHaveBeenCalled());
    expect(useWorkoutUiStore.getState().restEndsAt).toBeNull();
  });

  it('dismisses only the current rest instance from the native event and routes back to live on press', async () => {
    useWorkoutUiStore.getState().startRest(90, 'notif-3', 'set-3', 'workout-3');
    const currentInstanceKey = useWorkoutUiStore.getState().restInstanceKey;
    const currentEndsAt = useWorkoutUiStore.getState().restEndsAt;
    const currentRestSeconds = useWorkoutUiStore.getState().restSeconds;
    const currentWorkoutId = useWorkoutUiStore.getState().restWorkoutId;

    renderScreen(<RestOverlayController />);

    act(() => {
      overlayDismissListener?.();
    });

    expect(useWorkoutUiStore.getState().dismissedRestInstanceKey).toBe(currentInstanceKey);
    expect(useWorkoutUiStore.getState().restEndsAt).toBe(currentEndsAt);
    expect(useWorkoutUiStore.getState().restSeconds).toBe(currentRestSeconds);
    expect(useWorkoutUiStore.getState().restWorkoutId).toBe(currentWorkoutId);
    await waitFor(() => expect(hideRestOverlay).toHaveBeenCalled());

    act(() => {
      overlayPressedListener?.({ workoutId: 'workout-3' });
    });

    expect(router.push).toHaveBeenCalledWith(routes.workout.live('workout-3'));
  });
});
