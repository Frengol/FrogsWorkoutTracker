import React from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(),
}));

let mockRuntimeRestOverlayEnabled = true;

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(() => ({
    refresh: jest.fn(),
    restOverlayEnabled: mockRuntimeRestOverlayEnabled,
  })),
}));

jest.mock('@/src/modules/notifications/service', () => ({
  cancelScheduledNotification: jest.fn(() => Promise.resolve()),
  sendRestTimerEndedNotification: jest.fn(() => Promise.resolve('notification-recovery')),
}));

let overlayDismissListener: (() => void) | null = null;
let overlayPressedListener: ((event: { workoutId: string | null; sourceSetId?: string | null }) => void) | null = null;
let userPresentListener: (() => void) | null = null;
let appStateListener: ((state: AppStateStatus) => void) | null = null;

jest.mock('@/src/modules/rest-overlay/service', () => ({
  addOverlayDismissedListener: jest.fn((listener: () => void) => {
    overlayDismissListener = listener;
    return { remove: jest.fn() };
  }),
  addOverlayPressedListener: jest.fn((listener: (event: { workoutId: string | null; sourceSetId?: string | null }) => void) => {
    overlayPressedListener = listener;
    return { remove: jest.fn() };
  }),
  addUserPresentListener: jest.fn((listener: () => void) => {
    userPresentListener = listener;
    return { remove: jest.fn() };
  }),
  hideRestOverlay: jest.fn(() => Promise.resolve()),
  isOverlayPermissionGranted: jest.fn(() => true),
  isRestOverlaySupported: jest.fn(() => true),
  showRestOverlay: jest.fn(() => Promise.resolve()),
  startUserPresentListener: jest.fn(() => Promise.resolve()),
  stopUserPresentListener: jest.fn(() => Promise.resolve()),
  updateRestOverlay: jest.fn(() => Promise.resolve()),
}));

import { router, usePathname } from 'expo-router';

import { getIdentitySnapshot } from '@/src/modules/identity/service';
import { cancelScheduledNotification, sendRestTimerEndedNotification } from '@/src/modules/notifications/service';
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
    userPresentListener = null;
    appStateListener = null;
    mockRuntimeRestOverlayEnabled = true;
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
        sourceSetId: 'set-1',
        endsAtMs: expect.any(Number),
        isFinished: false,
      }),
    );
  });

  it('starts showing the Android overlay after the runtime preference changes without remounting', async () => {
    mockRuntimeRestOverlayEnabled = false;
    useWorkoutUiStore.getState().startRest(90, 'notif-runtime', 'set-runtime', 'workout-runtime');

    const screen = renderScreen(<RestOverlayController />);

    expect(updateRestOverlay).not.toHaveBeenCalled();

    mockRuntimeRestOverlayEnabled = true;
    screen.rerender(<RestOverlayController />);

    await waitFor(() =>
      expect(updateRestOverlay).toHaveBeenCalledWith({
        workoutId: 'workout-runtime',
        sourceSetId: 'set-runtime',
        endsAtMs: expect.any(Number),
        isFinished: false,
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
        sourceSetId: 'set-native-fail',
        endsAtMs: expect.any(Number),
        isFinished: false,
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
        sourceSetId: 'set-bg',
        endsAtMs: expect.any(Number),
        isFinished: false,
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

  it('marks the overlay as finished, suppresses recovery notification and clears after 10s active', async () => {
    jest.useFakeTimers();
    useWorkoutUiStore.getState().startRest(1, 'notif-2', 'set-2', 'workout-2');

    renderScreen(<RestOverlayController />);

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() =>
      expect(updateRestOverlay).toHaveBeenCalledWith({
        workoutId: 'workout-2',
        sourceSetId: 'set-2',
        endsAtMs: expect.any(Number),
        isFinished: true,
      }),
    );
    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
    await waitFor(() => expect(cancelScheduledNotification).toHaveBeenCalledWith('notif-2'));
    expect(useWorkoutUiStore.getState().restEndsAt).toEqual(expect.any(Number));
    expect(useWorkoutUiStore.getState().restFinishedAt).toEqual(expect.any(Number));

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => expect(useWorkoutUiStore.getState().restEndsAt).toBeNull());
    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
  });

  it('recovers an expired rest when Android reports the device was unlocked without a visible overlay', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T21:30:00.000Z'));
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      preferences: {
        restOverlayEnabled: false,
      },
    });
    mockRuntimeRestOverlayEnabled = false;
    useWorkoutUiStore.getState().startRest(10, 'notif-unlock', 'set-unlock', 'workout-unlock');

    renderScreen(<RestOverlayController />);

    act(() => {
      jest.setSystemTime(new Date('2026-04-20T21:30:11.000Z'));
      userPresentListener?.();
    });

    await waitFor(() => expect(sendRestTimerEndedNotification).toHaveBeenCalledTimes(1));
    expect(cancelScheduledNotification).toHaveBeenCalledWith('notif-unlock');

    act(() => {
      userPresentListener?.();
    });

    expect(sendRestTimerEndedNotification).toHaveBeenCalledTimes(1);
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
      overlayPressedListener?.({ workoutId: 'workout-3', sourceSetId: 'set-3' });
    });

    expect(router.push).toHaveBeenCalledWith(routes.workout.live('workout-3', { focusSetId: 'set-3' }));
  });

  it('presses a finished overlay, routes back focused and clears without recovery notification', async () => {
    jest.useFakeTimers();
    useWorkoutUiStore.getState().startRest(1, 'notif-finished-press', 'set-press', 'workout-press');

    renderScreen(<RestOverlayController />);

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => expect(updateRestOverlay).toHaveBeenCalledWith(expect.objectContaining({ isFinished: true })));

    act(() => {
      overlayPressedListener?.({ workoutId: 'workout-press', sourceSetId: 'set-press' });
    });

    expect(router.push).toHaveBeenCalledWith(routes.workout.live('workout-press', { focusSetId: 'set-press' }));
    await waitFor(() => expect(hideRestOverlay).toHaveBeenCalled());
    await waitFor(() => expect(useWorkoutUiStore.getState().restEndsAt).toBeNull());
    expect(cancelScheduledNotification).toHaveBeenCalledWith('notif-finished-press');
    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
  });
});
