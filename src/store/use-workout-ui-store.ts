import { create } from 'zustand';

type WorkoutUiStore = {
  restEndsAt: number | null;
  restSeconds: number;
  restNotificationId: string | null;
  restSourceSetId: string | null;
  restWorkoutId: string | null;
  restInstanceKey: string | null;
  dismissedRestInstanceKey: string | null;
  restFinishedAt: number | null;
  restRecoveryNotificationInstanceKey: string | null;
  latestPrMessage: string | null;
  startRest: (
    seconds: number,
    notificationId?: string | null,
    sourceSetId?: string | null,
    workoutId?: string | null,
  ) => void;
  adjustRest: (deltaSeconds: number) => void;
  setRestNotificationId: (notificationId: string | null) => void;
  setRestSourceSetId: (sourceSetId: string | null) => void;
  markRestFinished: () => void;
  markRestRecoveryNotified: (instanceKey: string | null | undefined) => void;
  dismissCurrentRestOverlay: () => void;
  clearRest: () => void;
  pushPrMessage: (message: string | null) => void;
};

const createRestInstanceKey = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useWorkoutUiStore = create<WorkoutUiStore>((set, get) => ({
  restEndsAt: null,
  restSeconds: 0,
  restNotificationId: null,
  restSourceSetId: null,
  restWorkoutId: null,
  restInstanceKey: null,
  dismissedRestInstanceKey: null,
  restFinishedAt: null,
  restRecoveryNotificationInstanceKey: null,
  latestPrMessage: null,
  startRest: (seconds, notificationId = null, sourceSetId = null, workoutId = null) =>
    set({
      restSeconds: seconds,
      restEndsAt: Date.now() + seconds * 1000,
      restNotificationId: notificationId,
      restSourceSetId: sourceSetId,
      restWorkoutId: workoutId,
      restInstanceKey: createRestInstanceKey(),
      dismissedRestInstanceKey: null,
      restFinishedAt: null,
      restRecoveryNotificationInstanceKey: null,
    }),
  adjustRest: (deltaSeconds) => {
    const { restEndsAt, restSeconds } = get();
    if (!restEndsAt) {
      return;
    }

    set({
      restSeconds: Math.max(0, restSeconds + deltaSeconds),
      restEndsAt: restEndsAt + deltaSeconds * 1000,
    });
  },
  setRestNotificationId: (notificationId) =>
    set({
      restNotificationId: notificationId,
    }),
  setRestSourceSetId: (sourceSetId) =>
    set({
      restSourceSetId: sourceSetId,
    }),
  markRestFinished: () =>
    set((state) => ({
      restFinishedAt: state.restFinishedAt ?? Date.now(),
    })),
  markRestRecoveryNotified: (instanceKey) => {
    if (!instanceKey) {
      return;
    }

    set({
      restRecoveryNotificationInstanceKey: instanceKey,
    });
  },
  dismissCurrentRestOverlay: () =>
    set((state) => ({
      dismissedRestInstanceKey: state.restInstanceKey,
    })),
  clearRest: () =>
    set({
      restSeconds: 0,
      restEndsAt: null,
      restNotificationId: null,
      restSourceSetId: null,
      restWorkoutId: null,
      restInstanceKey: null,
      dismissedRestInstanceKey: null,
      restFinishedAt: null,
      restRecoveryNotificationInstanceKey: null,
    }),
  pushPrMessage: (message) =>
    set({
      latestPrMessage: message,
    }),
}));
