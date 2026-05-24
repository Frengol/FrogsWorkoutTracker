import React from 'react';
import { ScrollView } from 'react-native';

import { AppScreen, Chip, EmptyState, Field, MetricTile, PrimaryButton, SecondaryButton } from '@/src/shared/design/ui';
import { act, fireEvent, renderScreen } from '@/tests/utils/render';

describe('shared design ui', () => {
  it('renders critical primitives and supports interaction states', () => {
    const onPrimaryPress = jest.fn();
    const onSecondaryPress = jest.fn();
    const onChipPress = jest.fn();

    const screen = renderScreen(
      <AppScreen testID="screen-design-system">
        <PrimaryButton label="Salvar" onPress={onPrimaryPress} testID="btn-primary" />
        <SecondaryButton label="Cancelar" onPress={onSecondaryPress} testID="btn-secondary" disabled />
        <Chip label="Peito" active onPress={onChipPress} testID="btn-chip-muscle" />
        <MetricTile label="Volume" value="1200 kg" testID="card-metric-volume" />
      </AppScreen>,
    );

    fireEvent.press(screen.getByTestId('btn-primary'));
    fireEvent.press(screen.getByTestId('btn-chip-muscle'));

    expect(onPrimaryPress).toHaveBeenCalledTimes(1);
    expect(onChipPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('screen-design-system')).toBeTruthy();
    expect(screen.getByTestId('card-metric-volume')).toBeTruthy();
    expect(screen.getByTestId('btn-secondary').props.accessibilityState.disabled).toBe(true);
    expect(onSecondaryPress).not.toHaveBeenCalled();
  });

  it('renders fields and empty states with stable ids', () => {
    const onAction = jest.fn();

    const screen = renderScreen(
      <>
        <Field label="Nome" value="Frog" onChangeText={jest.fn()} testID="input-name" containerTestID="card-name" />
        <EmptyState
          title="Sem dados"
          subtitle="Crie seu primeiro treino."
          actionLabel="Criar treino"
          onAction={onAction}
          testID="card-empty-state"
          actionTestID="btn-empty-action"
        />
      </>,
    );

    fireEvent.press(screen.getByTestId('btn-empty-action'));

    expect(screen.getByTestId('input-name').props.value).toBe('Frog');
    expect(screen.getByTestId('card-name')).toBeTruthy();
    expect(screen.getByText('Sem dados')).toBeTruthy();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('registers fields automatically for measured focus and respects opt-out fields', () => {
    jest.useFakeTimers();
    const onMeasuredFocus = jest.fn();
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    const screen = renderScreen(
      <AppScreen scroll keyboardAware measuredFocusScreenName="design-system" testID="screen-design-system-measured">
        <Field
          label="Campo medido"
          value=""
          onChangeText={jest.fn()}
          onFocus={onMeasuredFocus}
          testID="input-design-measured"
        />
        <Field
          label="Campo modal"
          value=""
          onChangeText={jest.fn()}
          measuredFocusDisabled
          testID="input-design-modal"
        />
      </AppScreen>,
    );
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    fireEvent(screen.getByTestId('input-design-measured'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-design-measured'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(onMeasuredFocus).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    scrollToSpy.mockClear();
    fireEvent(screen.getByTestId('input-design-modal'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-design-modal'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    jest.useRealTimers();
  });
});
