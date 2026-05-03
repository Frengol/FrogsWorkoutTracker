import { usePathname, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

import { getIdentitySnapshot } from '@/src/modules/identity/service';
import {
  addOverlayDismissedListener,
  addOverlayPressedListener,
  hideRestOverlay,
  isOverlayPermissionGranted,
  isRestOverlaySupported,
  showRestOverlay,
  updateRestOverlay,
} from '@/src/modules/rest-overlay/service';
import { cancelScheduledNotification } from '@/src/modules/notifications/service';
import { routes } from '@/src/shared/navigation/routes';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';

const isWorkoutLivePath = (pathname: string) => pathname.startsWith('/workout/live');

export function RestOverlayController() {
  const pathname = usePathname();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const [permissionGranted, setPermissionGranted] = useState(() => isOverlayPermissionGranted());
  const restEndsAt = useWorkoutUiStore((state) => state.restEndsAt);
  const restNotificationId = useWorkoutUiStore((state) => state.restNotificationId);
  const restWorkoutId = useWorkoutUiStore((state) => state.restWorkoutId);
  const restInstanceKey = useWorkoutUiStore((state) => state.restInstanceKey);
  const dismissedRestInstanceKey = useWorkoutUiStore((state) => state.dismissedRestInstanceKey);
  const clearRest = useWorkoutUiStore((state) => state.clearRest);
  const dismissCurrentRestOverlay = useWorkoutUiStore((state) => state.dismissCurrentRestOverlay);

  const restOverlayEnabled = getIdentitySnapshot().preferences?.restOverlayEnabled ?? false;
  const dismissedCurrentRest = useMemo(
    () => Boolean(restInstanceKey && dismissedRestInstanceKey === restInstanceKey),
    [dismissedRestInstanceKey, restInstanceKey],
  );
  const shouldUseAndroidOverlay = Platform.OS === 'android' && isRestOverlaySupported();
  const isLiveWorkoutRoute = isWorkoutLivePath(pathname);
  const isAppActive = appState === 'active';
  const shouldShowOverlay = Boolean(
    shouldUseAndroidOverlay &&
      restOverlayEnabled &&
      permissionGranted &&
      restEndsAt &&
      restWorkoutId &&
      (!isLiveWorkoutRoute || !isAppActive) &&
      !dismissedCurrentRest,
  );

  useEffect(() => {
    if (!restEndsAt) {
      return;
    }

    const interval = setInterval(() => {
      if (Date.now() < restEndsAt) {
        return;
      }

      cancelScheduledNotification(restNotificationId).catch(() => undefined);
      hideRestOverlay().catch(() => undefined);
      clearRest();
    }, 1000);

    return () => clearInterval(interval);
  }, [clearRest, restEndsAt, restNotificationId]);

  useEffect(() => {
    if (!shouldUseAndroidOverlay) {
      return;
    }

    const refreshPermission = () => {
      setPermissionGranted(isOverlayPermissionGranted());
    };

    refreshPermission();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      if (nextState === 'active') {
        refreshPermission();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [shouldUseAndroidOverlay]);

  useEffect(() => {
    if (!shouldUseAndroidOverlay) {
      return;
    }

    const dismissedSubscription = addOverlayDismissedListener(() => {
      dismissCurrentRestOverlay();
      hideRestOverlay().catch(() => undefined);
    });
    const pressedSubscription = addOverlayPressedListener((event) => {
      if (appState !== 'active') {
        return;
      }

      const targetWorkoutId = event?.workoutId ?? restWorkoutId;
      if (!targetWorkoutId) {
        return;
      }

      router.push(routes.workout.live(targetWorkoutId));
    });

    return () => {
      dismissedSubscription.remove();
      pressedSubscription.remove();
    };
  }, [appState, dismissCurrentRestOverlay, restWorkoutId, shouldUseAndroidOverlay]);

  useEffect(() => {
    if (!shouldUseAndroidOverlay) {
      return;
    }

    if (!shouldShowOverlay || !restWorkoutId || !restEndsAt) {
      hideRestOverlay().catch(() => undefined);
      return;
    }

    updateRestOverlay({
      workoutId: restWorkoutId,
      endsAtMs: restEndsAt,
    })
      .catch(() =>
        showRestOverlay({
          workoutId: restWorkoutId,
          endsAtMs: restEndsAt,
        }),
      )
      .catch(() => undefined);
  }, [restEndsAt, restWorkoutId, shouldShowOverlay, shouldUseAndroidOverlay]);

  return null;
}
