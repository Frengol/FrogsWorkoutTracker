import React from 'react';

jest.mock('@/src/modules/identity/service', () => ({
  bootstrapIdentity: jest.fn(),
  getIdentitySnapshot: jest.fn(),
}));

jest.mock('@/src/modules/notifications/service', () => ({
  initializeLocalNotifications: jest.fn(async () => undefined),
  registerNotificationResponseListener: jest.fn(() => jest.fn()),
  syncWorkoutReminderNotifications: jest.fn(async () => 0),
}));

import { Text, Pressable } from 'react-native';

import { bootstrapIdentity, getIdentitySnapshot } from '@/src/modules/identity/service';
import {
  initializeLocalNotifications,
  registerNotificationResponseListener,
  syncWorkoutReminderNotifications,
} from '@/src/modules/notifications/service';
import { AppBootstrapProvider, useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const Consumer = () => {
  const bootstrap = useAppBootstrap();

  return (
    <>
      <Text testID="bootstrap-ready">{String(bootstrap.ready)}</Text>
      <Text testID="bootstrap-name">{bootstrap.displayName}</Text>
      <Text testID="bootstrap-onboarding">{String(bootstrap.onboardingCompleted)}</Text>
      <Pressable testID="btn-bootstrap-refresh" onPress={bootstrap.refresh}>
        <Text>refresh</Text>
      </Pressable>
    </>
  );
};

describe('AppBootstrapProvider', () => {
  beforeEach(() => {
    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Ana Local',
        onboardingCompleted: true,
      },
    });
  });

  it('bootstraps the local app state and registers notifications', async () => {
    const screen = renderScreen(
      <AppBootstrapProvider>
        <Consumer />
      </AppBootstrapProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('bootstrap-ready').props.children).toBe('true'));
    expect(screen.getByTestId('bootstrap-name').props.children).toBe('Ana Local');
    expect(screen.getByTestId('bootstrap-onboarding').props.children).toBe('true');
    expect(bootstrapIdentity).toHaveBeenCalledTimes(1);
    expect(initializeLocalNotifications).toHaveBeenCalledTimes(1);
    expect(syncWorkoutReminderNotifications).toHaveBeenCalledTimes(1);
    expect(registerNotificationResponseListener).toHaveBeenCalledTimes(1);
  });

  it('refreshes the displayed bootstrap state', async () => {
    const screen = renderScreen(
      <AppBootstrapProvider>
        <Consumer />
      </AppBootstrapProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('bootstrap-name').props.children).toBe('Ana Local'));

    (getIdentitySnapshot as jest.Mock).mockReturnValue({
      user: {
        displayName: 'Bruno',
        onboardingCompleted: false,
      },
    });

    fireEvent.press(screen.getByTestId('btn-bootstrap-refresh'));

    await waitFor(() => expect(screen.getByTestId('bootstrap-name').props.children).toBe('Bruno'));
    expect(screen.getByTestId('bootstrap-onboarding').props.children).toBe('false');
  });
});
