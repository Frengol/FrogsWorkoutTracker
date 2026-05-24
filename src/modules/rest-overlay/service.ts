import { EmitterSubscription, NativeEventEmitter, NativeModules, Platform } from 'react-native';

type RestOverlayPayload = {
  workoutId: string;
  sourceSetId?: string | null;
  endsAtMs: number;
  isFinished?: boolean;
};

type RestOverlayPressedEvent = {
  workoutId: string | null;
  sourceSetId?: string | null;
};

type NativeRestOverlayModule = {
  isOverlayPermissionGranted?: () => boolean;
  openOverlayPermissionSettings?: () => Promise<void>;
  openAppDetailsSettings?: () => Promise<void>;
  showRestOverlay?: (payload: RestOverlayPayload) => Promise<void>;
  updateRestOverlay?: (payload: RestOverlayPayload) => Promise<void>;
  hideRestOverlay?: () => Promise<void>;
  startUserPresentListener?: () => Promise<void>;
  stopUserPresentListener?: () => Promise<void>;
};

const nativeModule = (NativeModules.FrogRestOverlay ?? null) as NativeRestOverlayModule | null;

const nativeEventEmitter =
  Platform.OS === 'android' && nativeModule ? new NativeEventEmitter(nativeModule as any) : null;

const createNoopSubscription = (): EmitterSubscription => ({
  remove: () => undefined,
} as EmitterSubscription);

export const isRestOverlaySupported = () => Platform.OS === 'android' && nativeModule != null;

export const isOverlayPermissionGranted = () => {
  if (!isRestOverlaySupported() || !nativeModule?.isOverlayPermissionGranted) {
    return false;
  }

  try {
    return Boolean(nativeModule.isOverlayPermissionGranted());
  } catch {
    return false;
  }
};

export const openOverlayPermissionSettings = async () => {
  if (!isRestOverlaySupported() || !nativeModule?.openOverlayPermissionSettings) {
    return;
  }

  await nativeModule.openOverlayPermissionSettings();
};

export const openAppDetailsSettings = async () => {
  if (!isRestOverlaySupported() || !nativeModule?.openAppDetailsSettings) {
    return;
  }

  await nativeModule.openAppDetailsSettings();
};

export const showRestOverlay = async (payload: RestOverlayPayload) => {
  if (!isRestOverlaySupported() || !nativeModule?.showRestOverlay) {
    return;
  }

  await nativeModule.showRestOverlay(payload);
};

export const updateRestOverlay = async (payload: RestOverlayPayload) => {
  if (!isRestOverlaySupported() || !nativeModule?.updateRestOverlay) {
    return;
  }

  await nativeModule.updateRestOverlay(payload);
};

export const hideRestOverlay = async () => {
  if (!isRestOverlaySupported() || !nativeModule?.hideRestOverlay) {
    return;
  }

  await nativeModule.hideRestOverlay();
};

export const startUserPresentListener = async () => {
  if (!isRestOverlaySupported() || !nativeModule?.startUserPresentListener) {
    return;
  }

  await nativeModule.startUserPresentListener();
};

export const stopUserPresentListener = async () => {
  if (!isRestOverlaySupported() || !nativeModule?.stopUserPresentListener) {
    return;
  }

  await nativeModule.stopUserPresentListener();
};

export const addOverlayDismissedListener = (listener: () => void) => {
  if (!nativeEventEmitter) {
    return createNoopSubscription();
  }

  return nativeEventEmitter.addListener('onOverlayDismissed', listener);
};

export const addOverlayPressedListener = (listener: (event: RestOverlayPressedEvent) => void) => {
  if (!nativeEventEmitter) {
    return createNoopSubscription();
  }

  return nativeEventEmitter.addListener('onOverlayPressed', listener);
};

export const addUserPresentListener = (listener: () => void) => {
  if (!nativeEventEmitter) {
    return createNoopSubscription();
  }

  return nativeEventEmitter.addListener('onUserPresent', listener);
};
