import React from 'react';
import { Platform } from 'react-native';

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(),
  saveLocalProfileSettings: jest.fn(),
}));

jest.mock('@/src/modules/notifications/service', () => ({
  syncWorkoutReminderNotifications: jest.fn(async () => 0),
}));

jest.mock('@/src/modules/rest-overlay/service', () => ({
  isOverlayPermissionGranted: jest.fn(() => false),
  openAppDetailsSettings: jest.fn(() => Promise.resolve()),
  openOverlayPermissionSettings: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(() => ({
    refresh: jest.fn(),
  })),
}));

import SettingsScreen from '@/app/settings/index';
import { router } from 'expo-router';
import { getIdentitySnapshot, saveLocalProfileSettings } from '@/src/modules/identity/service';
import { syncWorkoutReminderNotifications } from '@/src/modules/notifications/service';
import {
  isOverlayPermissionGranted,
  openAppDetailsSettings,
  openOverlayPermissionSettings,
} from '@/src/modules/rest-overlay/service';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';
import { createLocalProfileSettingsInput } from '@/tests/fixtures/factories';
import { fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('SettingsScreen', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  it('saves local preferences and refreshes bootstrap state', async () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh });
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
    await waitFor(() => expect(syncWorkoutReminderNotifications).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(routes.profile());
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

    fireEvent.changeText(screen.getByDisplayValue('19:00'), '07:30');
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
  });

  it('shows a save error when persistence fails', async () => {
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

    await waitFor(() => expect(screen.getByText('Falha ao salvar')).toBeTruthy());
    expect(router.replace).not.toHaveBeenCalled();
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
          hapticsEnabled: true,
          showRpe: true,
          showPreviousValues: true,
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

  it('toggles reminder chips and shows a generic save error for unknown failures', async () => {
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
    (syncWorkoutReminderNotifications as jest.Mock).mockRejectedValueOnce('falha cru');

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
});
