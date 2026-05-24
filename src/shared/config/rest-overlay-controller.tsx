import { usePathname, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

import {
  addOverlayDismissedListener,
  addOverlayPressedListener,
  addUserPresentListener,
  hideRestOverlay,
  isOverlayPermissionGranted,
  isRestOverlaySupported,
  showRestOverlay,
  startUserPresentListener,
  stopUserPresentListener,
  updateRestOverlay,
} from '@/src/modules/rest-overlay/service';
import {
  acknowledgeExpiredRestVisual,
  markExpiredRestIfNeeded,
  recoverExpiredRestIfNeeded,
} from '@/src/modules/workouts/rest-recovery';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { recordDiagnosticAction } from '@/src/shared/diagnostics/service';
import { routes } from '@/src/shared/navigation/routes';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';

const isWorkoutLivePath = (pathname: string) => pathname.startsWith('/workout/live');

export function RestOverlayController() {
  const pathname = usePathname();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const [permissionGranted, setPermissionGranted] = useState(() => isOverlayPermissionGranted());
  const restEndsAt = useWorkoutUiStore((state) => state.restEndsAt);
  const restWorkoutId = useWorkoutUiStore((state) => state.restWorkoutId);
  const restSourceSetId = useWorkoutUiStore((state) => state.restSourceSetId);
  const restInstanceKey = useWorkoutUiStore((state) => state.restInstanceKey);
  const restFinishedAt = useWorkoutUiStore((state) => state.restFinishedAt);
  const dismissedRestInstanceKey = useWorkoutUiStore((state) => state.dismissedRestInstanceKey);
  const dismissCurrentRestOverlay = useWorkoutUiStore((state) => state.dismissCurrentRestOverlay);
  const { restOverlayEnabled } = useAppBootstrap();

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

      markExpiredRestIfNeeded();
    }, 1000);

    return () => clearInterval(interval);
  }, [restEndsAt]);

  useEffect(() => {
    const refreshPermission = () => {
      if (shouldUseAndroidOverlay) {
        setPermissionGranted(isOverlayPermissionGranted());
      }
    };

    refreshPermission();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      if (nextState === 'active') {
        refreshPermission();
        if (shouldShowOverlay || isLiveWorkoutRoute) {
          markExpiredRestIfNeeded();
        } else {
          recoverExpiredRestIfNeeded().catch(() => undefined);
        }
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [isLiveWorkoutRoute, shouldShowOverlay, shouldUseAndroidOverlay]);

  useEffect(() => {
    if (!shouldUseAndroidOverlay) {
      return;
    }

    const dismissedSubscription = addOverlayDismissedListener(() => {
      recordDiagnosticAction('rest-overlay', 'dismiss-overlay');
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

      recordDiagnosticAction('rest-overlay', 'return-to-workout');
      const { restEndsAt: currentRestEndsAt, restFinishedAt: currentRestFinishedAt } = useWorkoutUiStore.getState();
      if (currentRestFinishedAt || (currentRestEndsAt && Date.now() >= currentRestEndsAt)) {
        acknowledgeExpiredRestVisual({ clearVisual: true })
          .then(() => hideRestOverlay())
          .catch(() => undefined);
      }
      router.push(routes.workout.live(targetWorkoutId, { focusSetId: event?.sourceSetId ?? undefined }));
    });

    return () => {
      dismissedSubscription.remove();
      pressedSubscription.remove();
    };
  }, [appState, dismissCurrentRestOverlay, restWorkoutId, shouldUseAndroidOverlay]);

  useEffect(() => {
    if (!shouldUseAndroidOverlay || !restEndsAt) {
      return;
    }

    startUserPresentListener().catch(() => undefined);
    const userPresentSubscription = addUserPresentListener(() => {
      recordDiagnosticAction('rest-overlay', 'user-present');
      if (shouldShowOverlay) {
        markExpiredRestIfNeeded();
      } else {
        recoverExpiredRestIfNeeded().catch(() => undefined);
      }
    });

    return () => {
      userPresentSubscription.remove();
      stopUserPresentListener().catch(() => undefined);
    };
  }, [restEndsAt, shouldShowOverlay, shouldUseAndroidOverlay]);

  useEffect(() => {
    if (!shouldShowOverlay || !restFinishedAt || !isAppActive) {
      return;
    }

    acknowledgeExpiredRestVisual().catch(() => undefined);
    const timeout = setTimeout(() => {
      acknowledgeExpiredRestVisual({ clearVisual: true })
        .then(() => hideRestOverlay())
        .catch(() => undefined);
    }, 10000);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAppActive, restFinishedAt, shouldShowOverlay]);

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
      sourceSetId: restSourceSetId,
      endsAtMs: restEndsAt,
      isFinished: Boolean(restFinishedAt) || markExpiredRestIfNeeded(),
    })
      .catch(() =>
        showRestOverlay({
          workoutId: restWorkoutId,
          sourceSetId: restSourceSetId,
          endsAtMs: restEndsAt,
          isFinished: Boolean(useWorkoutUiStore.getState().restFinishedAt),
        }),
      )
      .catch(() => undefined);
  }, [restEndsAt, restFinishedAt, restSourceSetId, restWorkoutId, shouldShowOverlay, shouldUseAndroidOverlay]);

  return null;
}
