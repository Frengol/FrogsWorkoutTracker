import React from 'react';

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  AppBootstrapProvider: ({ children }: any) => children,
}));

jest.mock('@/src/shared/config/rest-overlay-controller', () => ({
  RestOverlayController: () => null,
}));

import { router } from 'expo-router';

import RootLayout from '@/app/_layout';
import TabsLayout from '@/app/(tabs)/_layout';
import { routes } from '@/src/shared/navigation/routes';
import { fireEvent, renderScreen } from '@/tests/utils/render';

const safeAreaMock = jest.requireMock('react-native-safe-area-context') as {
  __resetMockSafeAreaInsets: () => void;
  __setMockSafeAreaInsets: (nextInsets: Partial<{ top: number; bottom: number; left: number; right: number }>) => void;
};

describe('App layouts', () => {
  beforeEach(() => {
    safeAreaMock.__resetMockSafeAreaInsets();
  });

  it('renders the root layout stack shell', () => {
    const screen = renderScreen(<RootLayout />);

    expect(screen.getByTestId('stack-router')).toBeTruthy();
  });

  it('renders the tabs layout and routes the floating workout button', () => {
    const screen = renderScreen(<TabsLayout />);

    fireEvent.press(screen.getByTestId('btn-tabs-fab-start-workout'));

    expect(screen.getByTestId('tabs-router')).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith(routes.workout.start());
  });

  it('keeps the tabs shell stable with a bottom safe-area inset', () => {
    safeAreaMock.__setMockSafeAreaInsets({ bottom: 28 });

    const screen = renderScreen(<TabsLayout />);

    fireEvent.press(screen.getByTestId('btn-tabs-fab-start-workout'));

    expect(screen.getByTestId('tabs-router')).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith(routes.workout.start());
  });
});
