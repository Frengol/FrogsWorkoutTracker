import React from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';

jest.mock('@/src/modules/identity/service', () => ({
  completeOnboarding: jest.fn(),
}));

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(() => ({
    refresh: jest.fn(),
  })),
}));

import { router } from 'expo-router';

import OnboardingScreen from '@/app/onboarding/index';
import { completeOnboarding } from '@/src/modules/identity/service';
import { routes } from '@/src/shared/navigation/routes';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { act, fireEvent, renderScreen } from '@/tests/utils/render';

describe('OnboardingScreen', () => {
  it('submits the chosen display name and redirects to home', () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh });

    const screen = renderScreen(<OnboardingScreen />);

    expect(screen.getByText('Frogs Workout Tracker')).toBeTruthy();
    expect(
      screen.getByText('O Frogs funciona só neste aparelho e foi feito para registrar treinos com rapidez, segurança e clareza.'),
    ).toBeTruthy();
    expect(screen.queryByText('O que já funciona agora')).toBeNull();
    expect(screen.getByText('Preferências iniciais')).toBeTruthy();
    expect(screen.getByText('Semana começa')).toBeTruthy();
    expect(screen.getByText('Domingo')).toBeTruthy();
    expect(screen.getByText('Segunda')).toBeTruthy();
    expect(screen.getByText('Unidade')).toBeTruthy();
    expect(screen.getByText('Métrico')).toBeTruthy();
    expect(screen.getByText('Imperial')).toBeTruthy();
    expect(screen.getByText('Descanso padrão (segundos)')).toBeTruthy();
    expect(screen.getByTestId('btn-onboarding-week-sunday').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('btn-onboarding-week-monday').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('btn-onboarding-unit-metric').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('input-onboarding-default-rest-seconds').props.value).toBe('90');
    expect(StyleSheet.flatten(screen.getByTestId('btn-onboarding-week-sunday').props.style).flex).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('btn-onboarding-week-monday').props.style).flex).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('btn-onboarding-unit-metric').props.style).flex).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('btn-onboarding-unit-imperial').props.style).flex).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('row-onboarding-default-rest').props.style).flexDirection).toBe('row');
    expect(StyleSheet.flatten(screen.getByTestId('input-onboarding-default-rest-seconds').props.style).textAlign).toBe('center');

    fireEvent.changeText(screen.getByTestId('input-onboarding-display-name'), 'Ana Frog');
    fireEvent.press(screen.getByTestId('btn-onboarding-week-sunday'));
    fireEvent.press(screen.getByTestId('btn-onboarding-unit-imperial'));
    fireEvent.changeText(screen.getByTestId('input-onboarding-default-rest-seconds'), '120');
    fireEvent.press(screen.getByTestId('btn-onboarding-enter'));

    expect(completeOnboarding).toHaveBeenCalledWith({
      displayName: 'Ana Frog',
      unitSystem: 'imperial',
      weekStartsOn: 0,
      defaultRestSeconds: 120,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(routes.home());
  });

  it('allows continuing with the default local name', () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh });

    const screen = renderScreen(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId('btn-onboarding-default-name'));

    expect(completeOnboarding).toHaveBeenCalledWith({
      displayName: '',
      unitSystem: 'metric',
      weekStartsOn: 0,
      defaultRestSeconds: 90,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('uses 90 seconds when the initial rest input is invalid', () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh });

    const screen = renderScreen(<OnboardingScreen />);

    fireEvent.changeText(screen.getByTestId('input-onboarding-default-rest-seconds'), '');
    fireEvent.press(screen.getByTestId('btn-onboarding-enter'));

    expect(completeOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultRestSeconds: 90,
      }),
    );
  });

  it('adds extra bottom padding while the keyboard is open', () => {
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

    const screen = renderScreen(<OnboardingScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
    });

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 312 })]),
    );

    act(() => {
      keyboardHideListeners.forEach((listener) => listener());
    });

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 32 })]),
    );

    keyboardSpy.mockRestore();
  });

  it('measures the default rest input when it receives focus instead of jumping to the end', () => {
    jest.useFakeTimers();
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    const screen = renderScreen(<OnboardingScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    fireEvent(screen.getByTestId('input-onboarding-default-rest-seconds'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-onboarding-default-rest-seconds'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    scrollToSpy.mockClear();
    fireEvent(screen.getByTestId('input-onboarding-display-name'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-onboarding-display-name'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    jest.useRealTimers();
  });

  it('keeps the default rest input on measured scroll without duplicating pending scroll when the keyboard changes', () => {
    jest.useFakeTimers();
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
    const screen = renderScreen(<OnboardingScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);
    const input = screen.getByTestId('input-onboarding-default-rest-seconds');

    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    fireEvent(input, 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(input, 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    act(() => {
      keyboardHideListeners.forEach((listener) => listener());
    });
    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    fireEvent(input, 'blur');
    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
      jest.runOnlyPendingTimers();
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });
});
