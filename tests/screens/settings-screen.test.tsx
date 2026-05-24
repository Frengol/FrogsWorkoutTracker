import React from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet } from 'react-native';
import * as Sharing from 'expo-sharing';

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(),
  saveLocalProfileSettings: jest.fn(),
}));

jest.mock('@/src/modules/notifications/service', () => ({
  syncWorkoutReminderNotifications: jest.fn(async () => 0),
}));

jest.mock('@/src/modules/app-update/service', () => ({
  useAppUpdateStatus: jest.fn(),
}));

jest.mock('@/src/modules/rest-overlay/service', () => ({
  isOverlayPermissionGranted: jest.fn(() => false),
  openAppDetailsSettings: jest.fn(() => Promise.resolve()),
  openOverlayPermissionSettings: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(() => ({
    refresh: jest.fn(),
    restOverlayEnabled: false,
  })),
}));

import SettingsScreen from '@/app/settings/index';
import { router } from 'expo-router';
import { useAppUpdateStatus } from '@/src/modules/app-update/service';
import { getIdentitySnapshot, saveLocalProfileSettings } from '@/src/modules/identity/service';
import { syncWorkoutReminderNotifications } from '@/src/modules/notifications/service';
import {
  isOverlayPermissionGranted,
  openAppDetailsSettings,
  openOverlayPermissionSettings,
} from '@/src/modules/rest-overlay/service';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { clearDiagnosticLogs, getDiagnosticEvents } from '@/src/shared/diagnostics/service';
import { colors } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { createLocalProfileSettingsInput } from '@/tests/fixtures/factories';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const flattenStyle = (style: unknown) => StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style);
const startUpdate = jest.fn(async () => undefined);
const completeUpdate = jest.fn(async () => undefined);
const refreshUpdate = jest.fn(async () => undefined);

const getActionTestIds = (children: unknown[]) =>
  children
    .map((child) =>
      typeof child === 'object' && child !== null && 'props' in child
        ? (child as { props: { testID?: string } }).props.testID
        : null,
    )
    .filter((testID): testID is string => Boolean(testID));

describe('SettingsScreen', () => {
  const originalPlatform = Platform.OS;
  const originalDiagnosticsFlag = process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;

  beforeEach(() => {
    jest.clearAllMocks();
    clearDiagnosticLogs();
    delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'upToDate' },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
    if (originalDiagnosticsFlag === undefined) {
      delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
      return;
    }

    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = originalDiagnosticsFlag;
  });

  it('saves local preferences and refreshes bootstrap state', async () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh, restOverlayEnabled: false });
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'intermediate',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 90,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: true,
        remindersEnabled: false,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    fireEvent.changeText(screen.getByTestId('input-settings-display-name'), 'Ana Local');
    fireEvent.changeText(screen.getByTestId('input-settings-default-rest-seconds'), '180');
    fireEvent.press(screen.getByTestId('btn-settings-save'));

    await waitFor(() =>
      expect(saveLocalProfileSettings).toHaveBeenCalledWith(
        expect.objectContaining(
          createLocalProfileSettingsInput({
            displayName: 'Ana Local',
            defaultRestSeconds: 180,
            remindersEnabled: false,
            reminderTimeLocal: '19:00',
            reminderDays: [2, 4],
          }),
        ),
      ),
    );
    const savedPayload = (saveLocalProfileSettings as jest.Mock).mock.calls[0]?.[0];
    expect(savedPayload).not.toHaveProperty('hapticsEnabled');
    expect(savedPayload).not.toHaveProperty('showRpe');
    expect(savedPayload).not.toHaveProperty('showPreviousValues');
    await waitFor(() => expect(syncWorkoutReminderNotifications).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(routes.profile());
  });

  it('saves the rest overlay preference and refreshes runtime settings without requiring restart', async () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh, restOverlayEnabled: false });
    (isOverlayPermissionGranted as jest.Mock).mockReturnValue(true);
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'intermediate',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 90,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: true,
        remindersEnabled: false,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    fireEvent(screen.getByTestId('switch-settings-rest-overlay'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('btn-settings-save'));

    await waitFor(() =>
      expect(saveLocalProfileSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          restOverlayEnabled: true,
        }),
      ),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/reinicie/i)).toBeNull();
  });

  it('navigates to privacy/data and persists enabled reminders with custom options', async () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 90,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: true,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    fireEvent.press(screen.getByText('Privacidade e dados'));
    expect(router.push).toHaveBeenCalledWith(routes.settingsData());

    expect(screen.queryByDisplayValue('19:00')).toBeNull();
    fireEvent.press(screen.getByTestId('btn-settings-reminder-time'));
    expect(screen.getByTestId('modal-time-picker')).toBeTruthy();
    expect(getActionTestIds(screen.getByTestId('modal-time-picker-actions').children)).toEqual([
      'modal-time-picker-ok',
      'modal-time-picker-cancel',
    ]);

    fireEvent.press(screen.getByTestId('modal-time-picker-cancel'));
    expect(screen.queryByTestId('modal-time-picker')).toBeNull();
    expect(screen.getByText('19:00')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-settings-reminder-time'));
    fireEvent.press(screen.getByTestId('modal-time-picker-hour-option-7'));
    fireEvent.press(screen.getByTestId('modal-time-picker-minute-option-30'));
    fireEvent.press(screen.getByTestId('modal-time-picker-ok'));
    expect(screen.getByText('07:30')).toBeTruthy();

    fireEvent.press(screen.getByText('sex'));
    fireEvent.press(screen.getByText('segunda'));
    fireEvent.press(screen.getByTestId('btn-settings-save'));

    await waitFor(() =>
      expect(saveLocalProfileSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          weekStartsOn: 1,
          remindersEnabled: true,
          reminderTimeLocal: '07:30',
          reminderDays: [2, 6],
        }),
      ),
    );
    expect(screen.queryByText(/invalid_format/i)).toBeNull();
    expect(screen.queryByText(/org\.json\.JSONObject/i)).toBeNull();
  });

  it('keeps saved settings visible and shows a friendly reminder sync error', async () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'intermediate',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 90,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: true,
        remindersEnabled: false,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });
    (syncWorkoutReminderNotifications as jest.Mock).mockRejectedValueOnce(new Error('Falha ao salvar'));

    const screen = renderScreen(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('btn-settings-save'));

    await waitFor(() =>
      expect(screen.getByText('Preferências salvas, mas não foi possível atualizar os lembretes agora.')).toBeTruthy(),
    );
    expect(saveLocalProfileSettings).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/org\.json\.JSONObject/i)).toBeNull();
  });

  it('falls back to local defaults, lets the user change chips and removes reminder days', async () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const screen = renderScreen(<SettingsScreen />);

    fireEvent.press(screen.getByText('Avançado'));
    fireEvent.press(screen.getByText('Imperial'));
    fireEvent.press(screen.getByText('domingo'));
    fireEvent.press(screen.getByTestId('btn-settings-save'));

    await waitFor(() =>
      expect(saveLocalProfileSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: '',
          experienceLevel: 'advanced',
          unitSystem: 'imperial',
          defaultRestSeconds: 90,
          weekStartsOn: 0,
          keepAwake: true,
          restOverlayEnabled: false,
          restTimerNotificationEnabled: true,
          prNotificationEnabled: true,
          remindersEnabled: false,
          reportsEnabled: true,
          reminderTimeLocal: '19:00',
          reminderDays: [2, 4, 6],
        }),
      ),
    );
  });

  it('uses back navigation first and falls back to profile when needed', () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const screen = renderScreen(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('btn-settings-back'));
    expect(router.back).toHaveBeenCalled();

    (router.canGoBack as jest.Mock).mockReturnValue(false);
    fireEvent.press(screen.getByTestId('btn-settings-back'));

    expect(router.replace).toHaveBeenCalledWith(routes.profile());
  });

  it('toggles reminder chips and shows a generic save error for unknown persistence failures', async () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 90,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: true,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });
    (saveLocalProfileSettings as jest.Mock).mockImplementationOnce(() => {
      throw new Error('[{"origin":"string","code":"invalid_format","path":["reminderTimeLocal"]}]');
    });

    const screen = renderScreen(<SettingsScreen />);

    fireEvent.press(screen.getByText('seg'));
    fireEvent.press(screen.getByText('sex'));
    fireEvent.press(screen.getByTestId('btn-settings-save'));

    await waitFor(() => expect(screen.getByText('Não foi possível salvar as configurações.')).toBeTruthy());
    expect(saveLocalProfileSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderDays: [4, 6],
      }),
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(syncWorkoutReminderNotifications).not.toHaveBeenCalled();
    expect(screen.queryByText(/invalid_format/i)).toBeNull();
  });

  it('renders the compact default rest input with the current value', () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 180,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: false,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.getByText('Descanso padrão (segundos)')).toBeTruthy();
    expect(screen.getByTestId('input-settings-default-rest-seconds').props.value).toBe('180');
    expect(flattenStyle(screen.getByTestId('input-settings-default-rest-seconds').props.style).textAlign).toBe('center');
  });

  it('keeps the settings default rest input reachable with measured scroll while the keyboard is open', () => {
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';
    const keyboardShowListeners: Array<(event: { endCoordinates?: { height?: number } }) => void> = [];
    const keyboardHideListeners: Array<() => void> = [];
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListeners.push(listener as (event: { endCoordinates?: { height?: number } }) => void);
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListeners.push(listener as () => void);
      }

      return { remove: jest.fn() } as any;
    });
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: { defaultRestSeconds: 180, keepAwake: true, restOverlayEnabled: false, weekStartsOn: 1 },
      notifications: null,
    });

    const screen = renderScreen(<SettingsScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    const input = screen.getByTestId('input-settings-default-rest-seconds');

    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
    });

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 312 })]),
    );

    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 520 } } });
    });
    fireEvent(input, 'layout', {
      nativeEvent: { layout: { y: 1120, height: 48 } },
    });
    fireEvent(input, 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    const lastSettingsScroll = scrollToSpy.mock.calls.at(-1)?.[0] as { y?: number } | undefined;
    expect(lastSettingsScroll?.y ?? 0).toBeGreaterThan(520);
    expect(scrollToEndSpy).not.toHaveBeenCalled();
    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'keyboard', screen: 'settings', status: 'show', height: 280 }),
        expect.objectContaining({ type: 'scroll', screen: 'settings', offset: 520 }),
        expect.objectContaining({ type: 'focus', screen: 'settings', fieldId: 'settings-default-rest' }),
        expect.objectContaining({ type: 'measure', screen: 'settings', fieldId: 'settings-default-rest' }),
      ]),
    );

    scrollToSpy.mockClear();
    const displayNameInput = screen.getByTestId('input-settings-display-name');
    fireEvent(displayNameInput, 'layout', {
      nativeEvent: { layout: { y: 1120, height: 48 } },
    });
    fireEvent(displayNameInput, 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(getDiagnosticEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'focus', screen: 'settings', fieldId: 'input-settings-display-name' }),
        expect.objectContaining({ type: 'measure', screen: 'settings', fieldId: 'input-settings-display-name' }),
      ]),
    );

    act(() => {
      keyboardHideListeners.forEach((listener) => listener());
    });

    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle).paddingBottom).toBe(32);

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('only shows diagnostic export controls in diagnostics APK mode', async () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const regularScreen = renderScreen(<SettingsScreen />);
    expect(regularScreen.queryByTestId('card-settings-diagnostics')).toBeNull();
    regularScreen.unmount();

    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';
    const diagnosticsScreen = renderScreen(<SettingsScreen />);

    expect(diagnosticsScreen.getByTestId('card-settings-diagnostics')).toBeTruthy();
    expect(diagnosticsScreen.getByText('Diagnóstico')).toBeTruthy();
    expect(diagnosticsScreen.getByText('Não inclui valores digitados.')).toBeTruthy();

    fireEvent.press(diagnosticsScreen.getByTestId('btn-settings-diagnostics-export'));

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));

    fireEvent.press(diagnosticsScreen.getByTestId('btn-settings-diagnostics-clear'));

    expect(getDiagnosticEvents()).toEqual([]);
    expect(diagnosticsScreen.getByText('Logs de diagnóstico limpos.')).toBeTruthy();
  });

  it('uses the settings visual language for week start and reminder time controls', () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 180,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: true,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.getByText('Semana inicia em')).toBeTruthy();
    expect(screen.queryByText('Semana inicia')).toBeNull();
    expect(screen.getByTestId('btn-settings-reminder-time')).toBeTruthy();

    const activeWeekStyle = flattenStyle(screen.getByTestId('btn-settings-week-monday').props.style);
    expect(activeWeekStyle.backgroundColor).toBe(colors.primary);
    expect(activeWeekStyle.borderColor).toBe(colors.primary);
  });

  it('keeps all reminder weekdays in one compact accessible row', () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 180,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: true,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [1, 3, 7],
      },
    });

    const screen = renderScreen(<SettingsScreen />);
    const rowStyle = flattenStyle(screen.getByTestId('settings-reminder-days-row').props.style);

    expect(rowStyle.flexDirection).toBe('row');
    expect(rowStyle.flexWrap).toBe('nowrap');
    expect(screen.getByTestId('btn-settings-reminder-day-1').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('btn-settings-reminder-day-2').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('btn-settings-reminder-day-7').props.accessibilityState).toEqual({ selected: true });
    expect(flattenStyle(screen.getByTestId('btn-settings-reminder-day-7').props.style).flex).toBe(1);
  });

  it('does not render preferences that no longer change workout behavior', () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 180,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: false,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: false,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.queryByText('Vibração')).toBeNull();
    expect(screen.queryByText('Mostrar RPE')).toBeNull();
    expect(screen.queryByText('Mostrar valores anteriores')).toBeNull();
  });

  it('shows the restricted settings guidance on Android and lets the user retry both permission paths', async () => {
    (isOverlayPermissionGranted as jest.Mock).mockReturnValue(false);
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 180,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: true,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: false,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.getByText('Overlay de descanso fora do treino')).toBeTruthy();
    expect(screen.getByTestId('card-settings-overlay-permission')).toBeTruthy();
    expect(screen.getByText('O Android ainda está bloqueando o overlay')).toBeTruthy();
    expect(screen.getAllByText(/configurações restritas/i)).toHaveLength(2);

    fireEvent.press(screen.getByTestId('btn-settings-overlay-permission'));
    fireEvent.press(screen.getByTestId('btn-settings-overlay-app-details'));

    await waitFor(() => expect(openOverlayPermissionSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(openAppDetailsSettings).toHaveBeenCalledTimes(1));
  });

  it('shows a confirmation when overlay is enabled and Android permission is granted', () => {
    (isOverlayPermissionGranted as jest.Mock).mockReturnValue(true);
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Frog Athlete',
        experienceLevel: 'beginner',
        unitSystem: 'metric',
      },
      preferences: {
        defaultRestSeconds: 180,
        keepAwake: true,
        hapticsEnabled: true,
        showRpe: true,
        showPreviousValues: true,
        restOverlayEnabled: true,
        weekStartsOn: 1,
      },
      notifications: {
        restTimerNotificationEnabled: true,
        prNotificationEnabled: false,
        remindersEnabled: false,
        reportsEnabled: true,
        reminderTimeLocal: '19:00',
        reminderDays: [2, 4],
      },
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.queryByTestId('card-settings-overlay-permission')).toBeNull();
    expect(screen.getByTestId('card-settings-overlay-ready')).toBeTruthy();
    expect(screen.getByText('Overlay liberado para os próximos descansos.')).toBeTruthy();
    expect(screen.queryByText(/reinicie/i)).toBeNull();
  });

  it('shows that the app is updated and lets the user check again from settings', async () => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.getByText('Atualizações')).toBeTruthy();
    expect(screen.getByText('Você está na versão mais atualizada')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('text-settings-app-update-status').props.style).textAlign).toBe(
      'center',
    );
    expect(flattenStyle(screen.getByTestId('btn-settings-app-update-refresh').props.style)).toEqual(
      expect.objectContaining({ minWidth: expect.any(Number), alignSelf: 'center' }),
    );

    fireEvent.press(screen.getByTestId('btn-settings-app-update-refresh'));

    await waitFor(() => expect(refreshUpdate).toHaveBeenCalledTimes(1));
  });

  it('shows an available update and starts the Play update flow from settings', async () => {
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'available', availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('row-settings-app-update-actions').props.style)).toEqual(
      expect.objectContaining({ justifyContent: 'center', alignItems: 'center' }),
    );
    expect(flattenStyle(screen.getByTestId('btn-settings-app-update-start').props.style).minWidth).toBeGreaterThanOrEqual(
      180,
    );
    fireEvent.press(screen.getByTestId('btn-settings-app-update-start'));

    await waitFor(() => expect(startUpdate).toHaveBeenCalledTimes(1));
  });

  it('shows checking and error update states only in settings', () => {
    (useAppUpdateStatus as jest.Mock).mockReturnValueOnce({
      state: { status: 'checking' },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const checkingScreen = renderScreen(<SettingsScreen />);
    expect(checkingScreen.getByText('Procurando atualizações...')).toBeTruthy();
    checkingScreen.unmount();

    (useAppUpdateStatus as jest.Mock).mockReturnValueOnce({
      state: { status: 'error', message: 'Falha nativa' },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });

    const errorScreen = renderScreen(<SettingsScreen />);
    expect(errorScreen.getByText('Não foi possível verificar agora.')).toBeTruthy();
  });

  it.each([
    ['downloading', 'Baixando atualização...'],
    ['installing', 'Instalando atualização...'],
  ])('shows %s as a busy update state without a manual refresh button', (status, label) => {
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status, availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByTestId('btn-settings-app-update-refresh')).toBeNull();
  });

  it('installs a downloaded flexible update from settings', async () => {
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'downloaded', availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: null,
      preferences: null,
      notifications: null,
    });

    const screen = renderScreen(<SettingsScreen />);

    expect(screen.getByText('Atualização pronta para instalar')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-settings-app-update-complete'));

    await waitFor(() => expect(completeUpdate).toHaveBeenCalledTimes(1));
  });
});
