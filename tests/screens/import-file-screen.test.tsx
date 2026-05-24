import React from 'react';

jest.mock('@/src/modules/data-transfer/service', () => ({
  importExternalDataFile: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';

import ImportFileScreen from '@/app/settings/import-file';
import { importExternalDataFile } from '@/src/modules/data-transfer/service';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const pendingReviewResult = {
  sourceType: 'frog_workouts_csv',
  fileName: 'treino.csv',
  status: 'pending_review',
  insertedCount: 1,
  skippedCount: 0,
  errors: [],
  reviewJobId: 'import-job-1',
};

describe('ImportFileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      uri: 'file:///mock-documents/treino.csv',
      fileName: 'treino.csv',
    });
  });

  it('shows the loading state while processing an external file', () => {
    (importExternalDataFile as jest.Mock).mockReturnValue(new Promise(() => undefined));

    const screen = renderScreen(<ImportFileScreen />);

    expect(screen.getByTestId('screen-import-file')).toBeTruthy();
    expect(screen.getByText('IMPORTAÇÃO')).toBeTruthy();
    expect(screen.getByText('Importando arquivo...')).toBeTruthy();
    expect(importExternalDataFile).toHaveBeenCalledWith({
      uri: 'file:///mock-documents/treino.csv',
      fileName: 'treino.csv',
    });
  });

  it('navigates workout CSV pending reviews back to Profile', async () => {
    (importExternalDataFile as jest.Mock).mockResolvedValue(pendingReviewResult);

    renderScreen(<ImportFileScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(routes.settingsImportReview('import-job-1', { returnTo: 'profile' })),
    );
  });

  it('navigates routine JSON pending reviews back to Library', async () => {
    (importExternalDataFile as jest.Mock).mockResolvedValue({
      ...pendingReviewResult,
      sourceType: 'frog_routine_json',
      fileName: 'rotina.json',
      reviewJobId: 'import-job-routine',
    });

    renderScreen(<ImportFileScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(routes.settingsImportReview('import-job-routine', { returnTo: 'library' })),
    );
  });

  it('asks confirmation before processing backup JSON files opened by Android', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      uri: 'file:///mock-documents/frog-backup-v1.json',
      fileName: 'frog-backup-v1.json',
    });
    (importExternalDataFile as jest.Mock).mockResolvedValue({
      sourceType: 'frog_backup_json',
      fileName: 'frog-backup-v1.json',
      status: 'pending_review',
      insertedCount: 4,
      skippedCount: 0,
      errors: [],
      reviewJobId: 'import-job-backup',
    });

    const screen = renderScreen(<ImportFileScreen />);

    await waitFor(() => expect(screen.getByText('Restaurar cópia de segurança')).toBeTruthy());
    expect(screen.getByText(/A base atual deste aparelho será substituída/)).toBeTruthy();
    expect(importExternalDataFile).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        routes.settingsImportReview('import-job-backup', { returnTo: 'settingsData' }),
      ),
    );
  });

  it('cancels backup JSON files opened by Android without importing', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      uri: 'file:///mock-documents/frog-backup-v1.json',
      fileName: 'frog-backup-v1.json',
    });

    const screen = renderScreen(<ImportFileScreen />);

    await waitFor(() => expect(screen.getByText('Restaurar cópia de segurança')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-cancel'));
    });

    expect(importExternalDataFile).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(routes.settingsData());
  });

  it('routes successful imports without review to their destination', async () => {
    (importExternalDataFile as jest.Mock).mockResolvedValue({
      sourceType: 'frog_routine_json',
      fileName: 'rotina.json',
      status: 'success',
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
    });

    renderScreen(<ImportFileScreen />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(routes.library()));
  });

  it('shows invalid file errors without navigating', async () => {
    (importExternalDataFile as jest.Mock).mockResolvedValue({
      sourceType: 'frog_workouts_csv',
      fileName: 'arquivo.txt',
      status: 'failed',
      insertedCount: 0,
      skippedCount: 0,
      errors: [
        'Este arquivo não é um CSV de treino Frogs/Hevy, um JSON de rotina Frogs ou uma cópia de segurança do Frogs.',
      ],
    });

    const screen = renderScreen(<ImportFileScreen />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'Este arquivo não é um CSV de treino Frogs/Hevy, um JSON de rotina Frogs ou uma cópia de segurança do Frogs.',
        ),
      ).toBeTruthy(),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
