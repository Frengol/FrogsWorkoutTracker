import React from 'react';

jest.mock('@/src/modules/routines/service', () => ({
  listRoutineFolders: jest.fn(),
  listRoutines: jest.fn(),
}));

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportRoutinesJson: jest.fn(async () => 'file:///routines.json'),
}));

import { router } from 'expo-router';

import RoutineExportScreen from '@/app/settings/routine-export';
import { exportRoutinesJson } from '@/src/modules/data-transfer/service';
import { listRoutineFolders, listRoutines } from '@/src/modules/routines/service';
import { fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('RoutineExportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listRoutineFolders as jest.Mock).mockReturnValue([
      { id: 'folder-1', name: 'Push', color_token: 'blue' },
      { id: 'folder-2', name: 'Pull', color_token: 'blue' },
    ]);
    (listRoutines as jest.Mock).mockReturnValue([
      {
        id: 'routine-1',
        name: 'Upper Blue',
        description: '',
        source: 'custom',
        estimated_minutes: 45,
        folder_name: 'Push',
        exercises_count: 4,
      },
      {
        id: 'routine-2',
        name: 'Pull Blue',
        description: '',
        source: 'custom',
        estimated_minutes: 40,
        folder_name: 'Pull',
        exercises_count: 5,
      },
      {
        id: 'routine-3',
        name: 'Livre Blue',
        description: '',
        source: 'custom',
        estimated_minutes: 30,
        folder_name: null,
        exercises_count: 3,
      },
    ]);
  });

  it('filters routines by folder and search before exporting checked items', async () => {
    const screen = renderScreen(<RoutineExportScreen />);

    expect(screen.getByTestId('btn-routine-export-submit').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Upper Blue')).toBeTruthy();
    expect(screen.getByText('Pull Blue')).toBeTruthy();
    expect(screen.getByText('Livre Blue')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-routine-export-folder-push'));
    expect(screen.getByText('Upper Blue')).toBeTruthy();
    expect(screen.queryByText('Pull Blue')).toBeNull();

    fireEvent.changeText(screen.getByTestId('input-routine-export-search'), 'upper');
    expect(screen.getByText('Upper Blue')).toBeTruthy();

    fireEvent.press(screen.getByTestId('checkbox-routine-export-routine-1'));

    expect(screen.getByTestId('checkbox-routine-export-routine-1').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('btn-routine-export-submit').props.accessibilityState.disabled).toBe(false);

    fireEvent.press(screen.getByTestId('btn-routine-export-submit'));

    await waitFor(() => expect(exportRoutinesJson).toHaveBeenCalledWith({ routineIds: ['routine-1'] }));
    await waitFor(() => expect(screen.getByText('Arquivo JSON de rotinas pronto para compartilhar.')).toBeTruthy());
  });

  it('supports the no-folder filter and back fallback', () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    const screen = renderScreen(<RoutineExportScreen />);

    fireEvent.press(screen.getByTestId('btn-routine-export-folder-none'));

    expect(screen.getByText('Livre Blue')).toBeTruthy();
    expect(screen.queryByText('Upper Blue')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-routine-export-back'));

    expect(router.replace).toHaveBeenCalledWith('/settings/data');
  });
});
