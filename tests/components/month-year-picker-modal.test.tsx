import React from 'react';

import { MonthYearPickerModal } from '@/src/shared/design/month-year-picker-modal';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('MonthYearPickerModal', () => {
  const baseProps = {
    visible: true,
    value: new Date(2026, 3, 1),
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
    testID: 'modal-month-year-picker',
  };

  it('does not render when visible is false', () => {
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} visible={false} />);

    expect(screen.queryByTestId('modal-month-year-picker')).toBeNull();
  });

  it('renders month and year wheels with current selection highlighted', () => {
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} />);

    expect(screen.getByTestId('modal-month-year-picker')).toBeTruthy();
    expect(screen.getByText('Mês')).toBeTruthy();
    expect(screen.getByText('Ano')).toBeTruthy();
    expect(screen.getByTestId('modal-month-year-picker-month-option-3-selected')).toBeTruthy();
    expect(screen.getByTestId('modal-month-year-picker-year-option-2026-selected')).toBeTruthy();
  });

  it('calls onCancel when cancel button is pressed', () => {
    const onCancel = jest.fn();
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} onCancel={onCancel} />);

    fireEvent.press(screen.getByTestId('modal-month-year-picker-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm with the selected month/year when confirm is pressed', () => {
    const onConfirm = jest.fn();
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} onConfirm={onConfirm} />);

    fireEvent.press(screen.getByTestId('modal-month-year-picker-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const confirmedDate = onConfirm.mock.calls[0][0] as Date;
    expect(confirmedDate.getFullYear()).toBe(2026);
    expect(confirmedDate.getMonth()).toBe(3);
    expect(confirmedDate.getDate()).toBe(1);
  });

  it('allows selecting a different month via wheel option press', () => {
    const onConfirm = jest.fn();
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} onConfirm={onConfirm} />);

    fireEvent.press(screen.getByTestId('modal-month-year-picker-month-option-0'));
    fireEvent.press(screen.getByTestId('modal-month-year-picker-confirm'));

    const confirmedDate = onConfirm.mock.calls[0][0] as Date;
    expect(confirmedDate.getMonth()).toBe(0);
    expect(confirmedDate.getFullYear()).toBe(2026);
  });

  it('allows selecting a different year via wheel option press', () => {
    const onConfirm = jest.fn();
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} onConfirm={onConfirm} />);

    fireEvent.press(screen.getByTestId('modal-month-year-picker-year-option-2025'));
    fireEvent.press(screen.getByTestId('modal-month-year-picker-confirm'));

    const confirmedDate = onConfirm.mock.calls[0][0] as Date;
    expect(confirmedDate.getFullYear()).toBe(2025);
    expect(confirmedDate.getMonth()).toBe(3);
  });

  it('closes when tapping the backdrop', () => {
    const onCancel = jest.fn();
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} onCancel={onCancel} />);

    fireEvent.press(screen.getByTestId('modal-month-year-picker-backdrop'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom title when provided', () => {
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} title="Selecionar mês" />);

    expect(screen.getByText('Selecionar mês')).toBeTruthy();
  });

  it('uses default title when none provided', () => {
    const screen = renderScreen(<MonthYearPickerModal {...baseProps} title={undefined} />);

    expect(screen.getByText('Selecionar mês e ano')).toBeTruthy();
  });
});
