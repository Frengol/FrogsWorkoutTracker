jest.mock('@/src/modules/measurements/service', () => ({
  getBodyMeasurement: jest.fn(),
  saveBodyMeasurement: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';

import ProgressMeasurementEditScreen from '@/app/progress/measurements/[measurementId]';
import { getBodyMeasurement, saveBodyMeasurement } from '@/src/modules/measurements/service';
import { act, fireEvent, renderScreen } from '@/tests/utils/render';

describe('ProgressMeasurementEditScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ measurementId: 'measurement-1' });
    (getBodyMeasurement as jest.Mock).mockReturnValue({
      id: 'measurement-1',
      recordedAt: '2026-03-27T12:00:00.000Z',
      weightKg: 82.5,
      chestCm: 101,
      waistCm: 81,
      hipsCm: 96,
      armCm: 39,
      thighCm: 60,
      note: 'Pós treino',
    });
  });

  it('opens prefilled and lets the user pick a localized date', () => {
    const screen = renderScreen(<ProgressMeasurementEditScreen />);

    expect(screen.getByText('27/03/2026')).toBeTruthy();
    expect(screen.getByTestId('input-progress-measurement-weight').props.value).toBe('82.5');

    fireEvent.press(screen.getByTestId('input-progress-measurement-date'));
    act(() => {
      fireEvent.press(screen.getByTestId('modal-progress-measurement-edit-date-picker-day-2026-03-28'));
    });
    act(() => {
      fireEvent.press(screen.getByTestId('modal-progress-measurement-edit-date-picker-confirm'));
    });

    expect(screen.getByText('28/03/2026')).toBeTruthy();
  });

  it('saves changes and returns to the previous screen', () => {
    const screen = renderScreen(<ProgressMeasurementEditScreen />);

    fireEvent.changeText(screen.getByTestId('input-progress-measurement-weight'), '81,4');
    fireEvent.press(screen.getByTestId('btn-progress-save-measurement-edit'));

    expect(saveBodyMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        recordedAt: '2026-03-27T12:00:00.000Z',
        weightKg: 81.4,
      }),
      'measurement-1',
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('shows an empty state when the measurement no longer exists and falls back to progress body', () => {
    (getBodyMeasurement as jest.Mock).mockReturnValue(null);
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    const screen = renderScreen(<ProgressMeasurementEditScreen />);

    expect(screen.getByText('Medida não encontrada')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-progress-measurement-edit-back'));

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/progress',
      params: { view: 'body' },
    });
  });
});
