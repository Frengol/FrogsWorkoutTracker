import React from 'react';

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportBackupJson: jest.fn(async () => 'file:///backup.json'),
  exportMeasurementsCsv: jest.fn(async () => 'file:///measurements.csv'),
  exportWorkoutsCsv: jest.fn(async () => 'file:///workouts.csv'),
  getDataManagementSummary: jest.fn(),
  pickAndImportCsvData: jest.fn(async () => null),
  pickAndRestoreBackup: jest.fn(async () => null),
  resetLocalAppData: jest.fn(async () => undefined),
}));

jest.mock('@/src/modules/media/service', () => ({
  cleanupOrphanWorkoutMedia: jest.fn(async () => 2),
}));

const mockRefreshBootstrap = jest.fn();

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(() => ({
    refresh: mockRefreshBootstrap,
  })),
}));

import DataScreen from '@/app/settings/data';
import { router } from 'expo-router';
import {
  exportBackupJson,
  exportMeasurementsCsv,
  exportWorkoutsCsv,
  getDataManagementSummary,
  pickAndImportCsvData,
  pickAndRestoreBackup,
  resetLocalAppData,
} from '@/src/modules/data-transfer/service';
import { cleanupOrphanWorkoutMedia } from '@/src/modules/media/service';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('DataScreen', () => {
  beforeEach(() => {
    mockRefreshBootstrap.mockReset();
    (getDataManagementSummary as jest.Mock).mockReturnValue({
      workoutsRows: 12,
      measurementRows: 3,
      lastImportJob: null,
    });
  });

  it('exports workouts csv and surfaces status feedback', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-workouts'));

    await waitFor(() => expect(exportWorkoutsCsv).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Arquivo CSV de treinos pronto para compartilhar.')).toBeTruthy());
    expect(mockRefreshBootstrap).toHaveBeenCalled();
  });

  it('renders only the local-first privacy message in the intro card', () => {
    (getDataManagementSummary as jest.Mock).mockReturnValue({
      workoutsRows: 18,
      measurementRows: 7,
      lastImportJob: {
        file_name: 'frog.csv',
        status: 'success',
      },
    });

    const screen = renderScreen(<DataScreen />);

    expect(screen.getByTestId('screen-settings-data')).toBeTruthy();
    expect(screen.getByText('O Frogs funciona só neste aparelho e não depende de conta nem internet para registrar seus dados.')).toBeTruthy();
    expect(screen.queryByText('Treinos salvos')).toBeNull();
    expect(screen.queryByText('Registros de medidas')).toBeNull();
    expect(screen.queryByText('Última importação')).toBeNull();
    expect(screen.queryByText('18')).toBeNull();
    expect(screen.queryByText('frog.csv · concluída')).toBeNull();
  });

  it('exports measurements and backup files', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-measurements'));
    await waitFor(() => expect(exportMeasurementsCsv).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Arquivo CSV de medidas pronto para compartilhar.')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-data-export-backup'));
    await waitFor(() => expect(exportBackupJson).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Cópia de segurança gerada.')).toBeTruthy());
  });

  it('handles CSV import cancel, error and success states', async () => {
    const screen = renderScreen(<DataScreen />);

    expect(screen.getByText('Importar treinos')).toBeTruthy();
    expect(screen.queryByText('Importar CSV')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-data-import-csv'));
    await waitFor(() => expect(screen.getByText('Importação cancelada.')).toBeTruthy());

    (pickAndImportCsvData as jest.Mock).mockResolvedValueOnce({
      insertedCount: 0,
      skippedCount: 0,
      errors: ['CSV inválido'],
    });
    fireEvent.press(screen.getByTestId('btn-data-import-csv'));
    await waitFor(() => expect(screen.getByText('CSV inválido')).toBeTruthy());

    (pickAndImportCsvData as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_workouts_csv',
      insertedCount: 8,
      skippedCount: 2,
      errors: [],
    });
    fireEvent.press(screen.getByTestId('btn-data-import-csv'));
    await waitFor(() => expect(screen.getByText('Importação concluída: 8 itens adicionados, 2 ignorados.')).toBeTruthy());
  });

  it('opens the import review screen when an import needs exercise review', async () => {
    (pickAndImportCsvData as jest.Mock).mockResolvedValueOnce({
      sourceType: 'hevy_csv',
      status: 'pending_review',
      reviewJobId: 'import-job-1',
      insertedCount: 3,
      skippedCount: 0,
      errors: [],
    });

    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-import-csv'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/settings/import-review',
        params: { importJobId: 'import-job-1' },
      }),
    );
  });

  it('handles backup restore cancel and success states', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-restore-backup'));
    await waitFor(() => expect(screen.getByText('Restauração cancelada.')).toBeTruthy());

    (pickAndRestoreBackup as jest.Mock).mockResolvedValueOnce({
      insertedCount: 42,
    });
    fireEvent.press(screen.getByTestId('btn-data-restore-backup'));
    await waitFor(() => expect(screen.getByText('Cópia restaurada com 42 registros.')).toBeTruthy());
  });

  it('cleans orphan media files and handles the empty result', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-cleanup-media'));
    await waitFor(() => expect(cleanupOrphanWorkoutMedia).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('2 arquivo(s) sem vínculo removido(s).')).toBeTruthy());

    (cleanupOrphanWorkoutMedia as jest.Mock).mockResolvedValueOnce(0);
    fireEvent.press(screen.getByTestId('btn-data-cleanup-media'));
    await waitFor(() => expect(screen.getByText('Nenhum arquivo solto foi encontrado.')).toBeTruthy());
  });

  it('resets local data after confirmation', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-reset-local'));
    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getAllByText('Reiniciar base local').length).toBeGreaterThan(0);
    expect(screen.getByText(/Isso apaga treinos/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() => expect(resetLocalAppData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Base local reiniciada para o estado inicial.')).toBeTruthy());
  });

  it('surfaces action errors and disables buttons while busy', async () => {
    (exportWorkoutsCsv as jest.Mock).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('Falha ao exportar')), 0)),
    );

    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-workouts'));

    expect(screen.getByTestId('btn-data-export-workouts').props.accessibilityState.disabled).toBe(true);
    await waitFor(() => expect(screen.getByText('Falha ao exportar')).toBeTruthy());
  });
});
