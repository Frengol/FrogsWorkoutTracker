import {
  cancelScheduledNotification,
  sendRestTimerEndedNotification,
} from '@/src/modules/notifications/service';
import { NotificationTarget } from '@/src/shared/navigation/routes';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';

const getRestNotificationTarget = (workoutId: string | null): NotificationTarget =>
  workoutId
    ? {
        routeKey: 'workoutLive',
        params: { workoutId },
      }
    : { routeKey: 'workoutStart' };

export const markExpiredRestIfNeeded = () => {
  const { restEndsAt } = useWorkoutUiStore.getState();
  if (!restEndsAt || Date.now() < restEndsAt) {
    return false;
  }

  useWorkoutUiStore.getState().markRestFinished();
  return true;
};

export const recoverExpiredRestIfNeeded = async () => {
  if (!markExpiredRestIfNeeded()) {
    return false;
  }

  const {
    restInstanceKey,
    restNotificationId,
    restRecoveryNotificationInstanceKey,
    restWorkoutId,
  } = useWorkoutUiStore.getState();

  if (!restInstanceKey || restRecoveryNotificationInstanceKey === restInstanceKey) {
    return false;
  }

  useWorkoutUiStore.getState().markRestRecoveryNotified(restInstanceKey);
  await cancelScheduledNotification(restNotificationId).catch(() => undefined);

  if (useWorkoutUiStore.getState().restInstanceKey === restInstanceKey) {
    useWorkoutUiStore.getState().setRestNotificationId(null);
  }

  await sendRestTimerEndedNotification(getRestNotificationTarget(restWorkoutId)).catch(() => null);
  return true;
};

export const acknowledgeExpiredRestVisual = async ({ clearVisual = false }: { clearVisual?: boolean } = {}) => {
  markExpiredRestIfNeeded();

  const {
    restEndsAt,
    restFinishedAt,
    restInstanceKey,
    restNotificationId,
  } = useWorkoutUiStore.getState();

  if (!restInstanceKey || (!restFinishedAt && (!restEndsAt || Date.now() < restEndsAt))) {
    return false;
  }

  useWorkoutUiStore.getState().markRestRecoveryNotified(restInstanceKey);
  await cancelScheduledNotification(restNotificationId).catch(() => undefined);

  if (useWorkoutUiStore.getState().restInstanceKey !== restInstanceKey) {
    return true;
  }

  if (clearVisual) {
    useWorkoutUiStore.getState().clearRest();
  } else {
    useWorkoutUiStore.getState().setRestNotificationId(null);
  }

  return true;
};
