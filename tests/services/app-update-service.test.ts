const mockNativeUpdateListeners = new Map<string, (event: unknown) => void>();
const mockNativeEmitterAddListener = jest.fn((eventName: string, listener: (event: unknown) => void) => {
  mockNativeUpdateListeners.set(eventName, listener);

  return {
    remove: jest.fn(() => {
      mockNativeUpdateListeners.delete(eventName);
    }),
  };
});

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');

  return {
    NativeModules: actual.NativeModules,
    Platform: actual.Platform,
    NativeEventEmitter: jest.fn().mockImplementation(() => ({
      addListener: mockNativeEmitterAddListener,
    })),
  };
});

import { NativeModules, Platform } from 'react-native';

import {
  __resetAppUpdateStateForTests,
  checkForUpdate,
  completeAppUpdate,
  getAppUpdateState,
  startAppUpdate,
  subscribeAppUpdateState,
} from '@/src/modules/app-update/service';

const nativeModule = () => (NativeModules as any).FrogAppUpdate as {
  checkForUpdate: jest.Mock;
  startFlexibleUpdate: jest.Mock;
  completeUpdate: jest.Mock;
};

describe('app update service', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNativeUpdateListeners.clear();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    (NativeModules as any).FrogAppUpdate = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      checkForUpdate: jest.fn(async () => ({
        supported: true,
        updateAvailability: 'notAvailable',
        installStatus: 'unknown',
      })),
      startFlexibleUpdate: jest.fn(async () => ({
        supported: true,
        updateAvailability: 'available',
        installStatus: 'pending',
        availableVersionCode: 6,
      })),
      completeUpdate: jest.fn(async () => ({
        supported: true,
        updateAvailability: 'notAvailable',
        installStatus: 'installing',
      })),
    };
    __resetAppUpdateStateForTests();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('normalizes native availability into an available state', async () => {
    nativeModule().checkForUpdate.mockResolvedValueOnce({
      supported: true,
      updateAvailability: 'available',
      installStatus: 'unknown',
      availableVersionCode: 6,
    });

    await expect(checkForUpdate()).resolves.toEqual({
      status: 'available',
      availableVersionCode: 6,
    });
    expect(getAppUpdateState()).toEqual({
      status: 'available',
      availableVersionCode: 6,
    });
  });

  it('normalizes up-to-date and downloaded states', async () => {
    await expect(checkForUpdate()).resolves.toEqual({ status: 'upToDate' });

    nativeModule().checkForUpdate.mockResolvedValueOnce({
      supported: true,
      updateAvailability: 'available',
      installStatus: 'downloaded',
      availableVersionCode: 6,
    });

    await expect(checkForUpdate()).resolves.toEqual({
      status: 'downloaded',
      availableVersionCode: 6,
    });
  });

  it('starts and completes the flexible Play update flow through the native module', async () => {
    await expect(startAppUpdate()).resolves.toEqual({
      status: 'available',
      availableVersionCode: 6,
    });
    expect(nativeModule().startFlexibleUpdate).toHaveBeenCalledTimes(1);

    await expect(completeAppUpdate()).resolves.toEqual({ status: 'installing' });
    expect(nativeModule().completeUpdate).toHaveBeenCalledTimes(1);
  });

  it('updates state from native Play Core progress events', () => {
    const seenStates: unknown[] = [];
    const unsubscribe = subscribeAppUpdateState((state) => {
      seenStates.push(state);
    });
    const emitUpdateEvent = mockNativeUpdateListeners.get('onAppUpdateStateChanged');

    expect(emitUpdateEvent).toBeTruthy();

    emitUpdateEvent?.({
      supported: true,
      updateAvailability: 'unknown',
      installStatus: 'downloading',
      availableVersionCode: 6,
      bytesDownloaded: 1200,
      totalBytesToDownload: 2400,
    });
    expect(getAppUpdateState()).toEqual({
      status: 'downloading',
      availableVersionCode: 6,
      bytesDownloaded: 1200,
      totalBytesToDownload: 2400,
    });

    emitUpdateEvent?.({
      supported: true,
      updateAvailability: 'unknown',
      installStatus: 'downloaded',
      availableVersionCode: 6,
    });
    expect(getAppUpdateState()).toEqual({
      status: 'downloaded',
      availableVersionCode: 6,
    });

    emitUpdateEvent?.({
      supported: true,
      updateAvailability: 'unknown',
      installStatus: 'installing',
      availableVersionCode: 6,
    });
    expect(getAppUpdateState()).toEqual({
      status: 'installing',
      availableVersionCode: 6,
    });
    expect(seenStates).toEqual(
      expect.arrayContaining([
        {
          status: 'downloading',
          availableVersionCode: 6,
          bytesDownloaded: 1200,
          totalBytesToDownload: 2400,
        },
        { status: 'downloaded', availableVersionCode: 6 },
        { status: 'installing', availableVersionCode: 6 },
      ]),
    );

    unsubscribe();
  });

  it('returns unsupported outside Android or when the native module is missing', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    __resetAppUpdateStateForTests();

    await expect(checkForUpdate()).resolves.toEqual({ status: 'unsupported' });
    expect(nativeModule().checkForUpdate).not.toHaveBeenCalled();

    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    delete (NativeModules as any).FrogAppUpdate;
    __resetAppUpdateStateForTests();

    await expect(checkForUpdate()).resolves.toEqual({ status: 'unsupported' });
  });

  it('normalizes native failures into a friendly error state', async () => {
    nativeModule().checkForUpdate.mockRejectedValueOnce(new Error('Play Store unavailable'));

    await expect(checkForUpdate()).resolves.toEqual({
      status: 'error',
      message: 'Não foi possível verificar agora.',
    });
  });
});
