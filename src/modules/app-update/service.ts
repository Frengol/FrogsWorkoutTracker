import { useEffect, useState } from 'react';
import { EmitterSubscription, NativeEventEmitter, NativeModules, Platform } from 'react-native';

const APP_UPDATE_EVENT = 'onAppUpdateStateChanged';
const FRIENDLY_UPDATE_ERROR = 'Não foi possível verificar agora.';

type NativeAppUpdateInfo = {
  supported?: boolean;
  updateAvailability?: string | null;
  installStatus?: string | null;
  availableVersionCode?: number | null;
  bytesDownloaded?: number | null;
  totalBytesToDownload?: number | null;
  message?: string | null;
};

type NativeAppUpdateModule = {
  checkForUpdate?: () => Promise<NativeAppUpdateInfo>;
  startFlexibleUpdate?: () => Promise<NativeAppUpdateInfo>;
  completeUpdate?: () => Promise<NativeAppUpdateInfo>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

export type AppUpdateState =
  | { status: 'unsupported' }
  | { status: 'unavailable' }
  | { status: 'checking' }
  | { status: 'upToDate' }
  | { status: 'available'; availableVersionCode?: number }
  | { status: 'downloading'; availableVersionCode?: number; bytesDownloaded?: number; totalBytesToDownload?: number }
  | { status: 'downloaded'; availableVersionCode?: number }
  | { status: 'installing'; availableVersionCode?: number }
  | { status: 'error'; message: string };

type VersionedAppUpdateState = Extract<AppUpdateState, { availableVersionCode?: number }>;
type AppUpdateSubscriber = (state: AppUpdateState) => void;

const getNativeModule = () => (NativeModules.FrogAppUpdate ?? null) as NativeAppUpdateModule | null;

const getInitialState = (): AppUpdateState =>
  Platform.OS === 'android' && getNativeModule() ? { status: 'unavailable' } : { status: 'unsupported' };

let currentState: AppUpdateState = getInitialState();
let nativeSubscription: EmitterSubscription | null = null;
const subscribers = new Set<AppUpdateSubscriber>();

const emitState = (nextState: AppUpdateState) => {
  currentState = nextState;
  subscribers.forEach((subscriber) => subscriber(nextState));
  return nextState;
};

const withVersionCode = (state: VersionedAppUpdateState, info: NativeAppUpdateInfo): VersionedAppUpdateState => {
  if (typeof info.availableVersionCode !== 'number') {
    return state;
  }

  return {
    ...state,
    availableVersionCode: info.availableVersionCode,
  };
};

const normalizeNativeUpdateInfo = (info: NativeAppUpdateInfo | null | undefined): AppUpdateState => {
  if (!info || info.supported === false) {
    return { status: 'unavailable' };
  }

  switch (info.installStatus) {
    case 'downloading':
      return withVersionCode(
        {
          status: 'downloading',
          bytesDownloaded: typeof info.bytesDownloaded === 'number' ? info.bytesDownloaded : undefined,
          totalBytesToDownload: typeof info.totalBytesToDownload === 'number' ? info.totalBytesToDownload : undefined,
        },
        info,
      );
    case 'downloaded':
      return withVersionCode({ status: 'downloaded' }, info);
    case 'installing':
      return withVersionCode({ status: 'installing' }, info);
    case 'failed':
    case 'canceled':
      return { status: 'error', message: FRIENDLY_UPDATE_ERROR };
  }

  switch (info.updateAvailability) {
    case 'available':
    case 'developerTriggeredUpdateInProgress':
      return withVersionCode({ status: 'available' }, info);
    case 'notAvailable':
      return { status: 'upToDate' };
    case 'unavailable':
    case 'unknown':
    default:
      return { status: 'unavailable' };
  }
};

const ensureNativeEventSubscription = () => {
  const nativeModule = getNativeModule();
  if (Platform.OS !== 'android' || !nativeModule || nativeSubscription) {
    return;
  }

  const emitter = new NativeEventEmitter(nativeModule as any);
  nativeSubscription = emitter.addListener(APP_UPDATE_EVENT, (event: NativeAppUpdateInfo) => {
    emitState(normalizeNativeUpdateInfo(event));
  });
};

export const getAppUpdateState = () => currentState;

export const subscribeAppUpdateState = (subscriber: AppUpdateSubscriber) => {
  ensureNativeEventSubscription();
  subscribers.add(subscriber);
  subscriber(currentState);

  return () => {
    subscribers.delete(subscriber);
  };
};

export const checkForUpdate = async () => {
  const nativeModule = getNativeModule();
  if (Platform.OS !== 'android' || !nativeModule?.checkForUpdate) {
    return emitState({ status: 'unsupported' });
  }

  ensureNativeEventSubscription();
  emitState({ status: 'checking' });

  try {
    return emitState(normalizeNativeUpdateInfo(await nativeModule.checkForUpdate()));
  } catch {
    return emitState({ status: 'error', message: FRIENDLY_UPDATE_ERROR });
  }
};

export const startAppUpdate = async () => {
  const nativeModule = getNativeModule();
  if (Platform.OS !== 'android' || !nativeModule?.startFlexibleUpdate) {
    return emitState({ status: 'unsupported' });
  }

  ensureNativeEventSubscription();

  try {
    return emitState(normalizeNativeUpdateInfo(await nativeModule.startFlexibleUpdate()));
  } catch {
    return emitState({ status: 'error', message: FRIENDLY_UPDATE_ERROR });
  }
};

export const completeAppUpdate = async () => {
  const nativeModule = getNativeModule();
  if (Platform.OS !== 'android' || !nativeModule?.completeUpdate) {
    return emitState({ status: 'unsupported' });
  }

  ensureNativeEventSubscription();

  try {
    return emitState(normalizeNativeUpdateInfo(await nativeModule.completeUpdate()));
  } catch {
    return emitState({ status: 'error', message: FRIENDLY_UPDATE_ERROR });
  }
};

export const useAppUpdateStatus = ({ autoCheck = true }: { autoCheck?: boolean } = {}) => {
  const [state, setState] = useState(currentState);

  useEffect(() => subscribeAppUpdateState(setState), []);

  useEffect(() => {
    if (!autoCheck) {
      return;
    }

    checkForUpdate().catch(() => undefined);
  }, [autoCheck]);

  return {
    state,
    refresh: checkForUpdate,
    startUpdate: startAppUpdate,
    completeUpdate: completeAppUpdate,
  };
};

export const __resetAppUpdateStateForTests = () => {
  currentState = getInitialState();
  nativeSubscription?.remove();
  nativeSubscription = null;
  subscribers.clear();
};
