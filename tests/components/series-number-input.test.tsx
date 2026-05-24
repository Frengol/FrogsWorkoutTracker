import React from 'react';
import { StyleSheet } from 'react-native';

import { SeriesNumberInput } from '@/src/modules/workouts/series-number-input';
import { clearDiagnosticLogs, getDiagnosticEvents } from '@/src/shared/diagnostics/service';
import { act, fireEvent, renderScreen } from '@/tests/utils/render';

describe('SeriesNumberInput', () => {
  const originalDiagnosticsFlag = process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;

  beforeEach(() => {
    jest.useFakeTimers();
    clearDiagnosticLogs();
    delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalDiagnosticsFlag === undefined) {
      delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
      return;
    }

    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = originalDiagnosticsFlag;
  });

  it('shows a real dash while empty and does not focus during a vertical drag', () => {
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';
    const onFocus = jest.fn();

    const screen = renderScreen(
      <SeriesNumberInput
        accessibilityLabel="Kg da série 2"
        diagnosticScreen="workout-live"
        onFocus={onFocus}
        placeholder="-"
        testID="input-series-weight"
        value=""
      />,
    );

    fireEvent(screen.getByTestId('input-series-weight'), 'touchStart', { nativeEvent: { pageY: 100 } });
    fireEvent(screen.getByTestId('input-series-weight'), 'touchMove', { nativeEvent: { pageY: 128 } });
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(screen.getByText('-')).toBeTruthy();
    expect(onFocus).not.toHaveBeenCalled();
    expect(getDiagnosticEvents()).toEqual([
      expect.objectContaining({
        type: 'numeric_input_touch_start',
        screen: 'workout-live',
        fieldId: 'input-series-weight',
      }),
      expect.objectContaining({
        type: 'numeric_input_touch_move_threshold',
        screen: 'workout-live',
        fieldId: 'input-series-weight',
        deltaY: 28,
      }),
    ]);
  });

  it('centers empty and filled display values without letting text width shift the cell', () => {
    const fixedCellStyle = {
      minHeight: 40,
      borderWidth: 1,
      borderRadius: 8,
      backgroundColor: '#111827',
      paddingHorizontal: 8,
      textAlign: 'center' as const,
      fontFamily: 'Inter-SemiBold',
      color: '#ffffff',
    };

    const emptyScreen = renderScreen(
      <SeriesNumberInput
        accessibilityLabel="Kg da série 2"
        diagnosticScreen="workout-live"
        placeholder="-"
        style={fixedCellStyle}
        testID="input-series-weight-empty"
        value=""
      />,
    );
    const emptyLayerStyle = StyleSheet.flatten(emptyScreen.getByTestId('input-series-weight-empty-display-layer').props.style);
    const emptyTextStyle = StyleSheet.flatten(emptyScreen.getByTestId('input-series-weight-empty-display-value').props.style);

    expect(emptyLayerStyle).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        bottom: 0,
        justifyContent: 'center',
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
      }),
    );
    expect(emptyTextStyle).toEqual(
      expect.objectContaining({
        textAlign: 'center',
      }),
    );
    expect(emptyTextStyle.width).toBeUndefined();
    expect(emptyTextStyle.includeFontPadding).toBe(false);
    expect(emptyScreen.getByTestId('input-series-weight-empty-display-value').props.children).toBe('-');

    const filledScreen = renderScreen(
      <SeriesNumberInput
        accessibilityLabel="Kg da série 2"
        diagnosticScreen="workout-live"
        placeholder="-"
        style={fixedCellStyle}
        testID="input-series-weight-filled"
        value="100"
      />,
    );
    const filledLayerStyle = StyleSheet.flatten(filledScreen.getByTestId('input-series-weight-filled-display-layer').props.style);
    const filledTextStyle = StyleSheet.flatten(filledScreen.getByTestId('input-series-weight-filled-display-value').props.style);

    expect(filledLayerStyle).toEqual(expect.objectContaining({ alignItems: 'center', justifyContent: 'center' }));
    expect(filledTextStyle.textAlign).toBe('center');
    expect(filledTextStyle.width).toBeUndefined();
    expect(filledScreen.getByTestId('input-series-weight-filled-display-value').props.children).toBe('100');
  });

  it('enters edit mode on a short tap and preserves controlled change handling', () => {
    const onChangeText = jest.fn();

    const screen = renderScreen(
      <SeriesNumberInput
        accessibilityLabel="Kg da série 2"
        diagnosticScreen="workout-live"
        onChangeText={onChangeText}
        placeholder="-"
        testID="input-series-weight"
        value=""
      />,
    );

    fireEvent.press(screen.getByTestId('input-series-weight'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    fireEvent.changeText(screen.getByTestId('input-series-weight-editor'), '72');

    expect(onChangeText).toHaveBeenCalledWith('72');
  });

  it('keeps the same outer box and removes TextInput layout chrome while editing', () => {
    const fixedCellStyle = {
      minHeight: 40,
      borderWidth: 1,
      borderRadius: 8,
      backgroundColor: '#111827',
      paddingHorizontal: 8,
      textAlign: 'center' as const,
      fontFamily: 'Inter-SemiBold',
      color: '#ffffff',
    };

    const screen = renderScreen(
      <SeriesNumberInput
        accessibilityLabel="Kg da série 2"
        diagnosticScreen="workout-live"
        placeholder="-"
        style={fixedCellStyle}
        testID="input-series-weight"
        value=""
      />,
    );
    const beforePressStyle = StyleSheet.flatten(screen.getByTestId('input-series-weight').props.style);

    fireEvent.press(screen.getByTestId('input-series-weight'));
    act(() => {
      jest.runOnlyPendingTimers();
    });

    const afterPressStyle = StyleSheet.flatten(screen.getByTestId('input-series-weight').props.style);
    const editorStyle = StyleSheet.flatten(screen.getByTestId('input-series-weight-editor').props.style);

    expect(afterPressStyle).toEqual(beforePressStyle);
    expect(afterPressStyle).toEqual(expect.objectContaining({ minHeight: 40, borderWidth: 1, paddingHorizontal: 8 }));
    expect(editorStyle).toEqual(
      expect.objectContaining({
        backgroundColor: 'transparent',
        borderWidth: 0,
        bottom: 0,
        left: 0,
        margin: 0,
        padding: 0,
        position: 'absolute',
        right: 0,
        textAlign: 'center',
        textAlignVertical: 'center',
        top: 0,
      }),
    );
    expect(editorStyle.height).not.toBe('100%');
    expect(editorStyle.width).not.toBe('100%');
    expect(editorStyle.includeFontPadding).toBe(false);
    expect(editorStyle.minHeight).toBeUndefined();
  });

  it('commits uncontrolled text on end editing and returns to the display surface', () => {
    const onEndEditing = jest.fn();

    const screen = renderScreen(
      <SeriesNumberInput
        accessibilityLabel="Kg da série 2"
        defaultValue=""
        diagnosticScreen="history-edit"
        onEndEditing={onEndEditing}
        placeholder="-"
        testID="input-series-weight"
      />,
    );

    fireEvent.press(screen.getByTestId('input-series-weight'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    fireEvent.changeText(screen.getByTestId('input-series-weight-editor'), '95');
    fireEvent(screen.getByTestId('input-series-weight-editor'), 'endEditing', { nativeEvent: { text: '95' } });

    expect(onEndEditing).toHaveBeenCalledWith(expect.objectContaining({ nativeEvent: { text: '95' } }));
    expect(screen.getByText('95')).toBeTruthy();
  });
});
