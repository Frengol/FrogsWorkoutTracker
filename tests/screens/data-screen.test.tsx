import React from 'react';
import { Linking, StyleSheet } from 'react-native';

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportBackupJson: jest.fn(async () => 'file:///backup.json'),
  exportMeasurementsCsv: jest.fn(async () => 'file:///measurements.csv'),
  exportRoutinesJson: jest.fn(async () => 'file:///routines.json'),
  exportWorkoutsCsv: jest.fn(async () => 'file:///workouts.csv'),
  getAutoBackupStatus: jest.fn(() => ({
    enabled: false,
    lastUpdatedAt: null,
    fileSizeBytes: 0,
  })),
  pickAndImportCsvData: jest.fn(async () => null),
  pickAndImportRoutineJson: jest.fn(async () => null),
  pickAndRestoreBackup: jest.fn(async () => null),
  resetLocalAppData: jest.fn(async () => undefined),
  setAutoBackupEnabled: jest.fn(async (enabled: boolean) => ({
    enabled,
    lastUpdatedAt: enabled ? '2026-05-16T15:34:00.000Z' : null,
    fileSizeBytes: enabled ? 42 : 0,
  })),
  writeAutoBackupSnapshot: jest.fn(async () => ({
    enabled: true,
    lastUpdatedAt: '2026-05-16T15:34:00.000Z',
    fileSizeBytes: 84,
  })),
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

jest.mock('@/src/shared/utils/date', () => ({
  formatLocalDateTimeLabel: jest.fn(() => '16/05/2026 às 12:34'),
}));

import DataScreen from '@/app/settings/data';
import { router } from 'expo-router';
import {
  exportBackupJson,
  exportMeasurementsCsv,
  exportRoutinesJson,
  exportWorkoutsCsv,
  getAutoBackupStatus,
  pickAndImportCsvData,
  pickAndImportRoutineJson,
  pickAndRestoreBackup,
  resetLocalAppData,
  setAutoBackupEnabled,
  writeAutoBackupSnapshot,
} from '@/src/modules/data-transfer/service';
import { cleanupOrphanWorkoutMedia } from '@/src/modules/media/service';
import { PRIVACY_POLICY_URL } from '@/src/shared/config/privacy-policy';
import { colors } from '@/src/shared/design/tokens';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const flattenPressableStyle = (style: unknown) =>
  StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style);

const getActionTestIds = (children: unknown[]) =>
  children
    .map((child) =>
      typeof child === 'object' && child !== null && 'props' in child
        ? (child as { props: { testID?: string } }).props.testID
        : null,
    )
    .filter((testID): testID is string => Boolean(testID));

const flattenRenderedText = (node: unknown): string[] => {
  if (node == null || typeof node === 'boolean') {
    return [];
  }

  if (typeof node === 'string') {
    return [node];
  }

  if (Array.isArray(node)) {
    return node.flatMap(flattenRenderedText);
  }

  if (typeof node === 'object' && 'children' in node) {
    return flattenRenderedText((node as { children?: unknown }).children);
  }

  return [];
};

describe('DataScreen', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockRefreshBootstrap.mockReset();
    (getAutoBackupStatus as jest.Mock).mockReturnValue({
      enabled: false,
      lastUpdatedAt: null,
      fileSizeBytes: 0,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports all workouts csv from the Privacy and Data export options', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-workouts'));

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Exportar treinos')).toBeTruthy();
    expect(getActionTestIds(screen.getByTestId('modal-app-dialog-actions').children)).toEqual([
      'btn-app-dialog-action-all_workouts',
      'btn-app-dialog-action-select_workouts',
      'btn-app-dialog-cancel',
    ]);
    expect(flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-all_workouts').props.style).backgroundColor).toBe(
      colors.primary,
    );
    expect(flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-select_workouts').props.style).backgroundColor).toBe(
      colors.input,
    );
    expect(flattenPressableStyle(screen.getByTestId('btn-app-dialog-cancel').props.style).backgroundColor).toBe(
      colors.danger,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-all_workouts'));
    });

    await waitFor(() => expect(exportWorkoutsCsv).toHaveBeenCalledWith());
    await waitFor(() => expect(screen.getByText('Arquivo CSV de treinos pronto para compartilhar.')).toBeTruthy());
    expect(mockRefreshBootstrap).toHaveBeenCalled();
  });

  it('opens the workout selection screen from the Privacy and Data export options', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-workouts'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-select_workouts'));
    });

    expect(router.push).toHaveBeenCalledWith('/settings/workout-export');
    expect(exportWorkoutsCsv).not.toHaveBeenCalled();
  });

  it('renders only the local-first privacy message in the intro card', () => {
    const screen = renderScreen(<DataScreen />);

    expect(screen.getByTestId('screen-settings-data')).toBeTruthy();
    expect(screen.getByText('O Frogs funciona só neste aparelho e não depende de conta nem internet para registrar seus dados.')).toBeTruthy();
    expect(screen.queryByText('Treinos salvos')).toBeNull();
    expect(screen.queryByText('Registros de medidas')).toBeNull();
    expect(screen.queryByText('Última importação')).toBeNull();
    expect(screen.queryByText('18')).toBeNull();
    expect(screen.queryByText('frog.csv · concluída')).toBeNull();
  });

  it('opens a discreet support email contact before Android auto backup', async () => {
    const screen = renderScreen(<DataScreen />);
    const contactTitle = 'Sugestões ou problemas?';
    const contactAction = 'Clique aqui e envie para frogsworkout@gmail.com';

    expect(screen.getByTestId('btn-data-support-email')).toBeTruthy();
    expect(screen.getByText(contactTitle)).toBeTruthy();
    expect(screen.getByText(contactAction)).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText(contactTitle).props.style).color).toBe(colors.accent);

    const renderedTexts = flattenRenderedText(screen.toJSON());
    const introIndex = renderedTexts.indexOf('O Frogs funciona só neste aparelho e não depende de conta nem internet para registrar seus dados.');
    const contactTitleIndex = renderedTexts.indexOf(contactTitle);
    const contactActionIndex = renderedTexts.indexOf(contactAction);
    const backupIndex = renderedTexts.indexOf('Backup automático');

    expect(introIndex).toBeGreaterThan(-1);
    expect(contactTitleIndex).toBeGreaterThan(introIndex);
    expect(contactActionIndex).toBeGreaterThan(contactTitleIndex);
    expect(backupIndex).toBeGreaterThan(contactActionIndex);

    fireEvent.press(screen.getByTestId('btn-data-support-email'));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        'mailto:frogsworkout@gmail.com?subject=Frogs%20-%20sugest%C3%A3o%20ou%20problema',
      ),
    );
  });

  it('shows an alert when the support email app cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('No email app available'));
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-support-email'));

    await waitFor(() => expect(screen.getByTestId('modal-app-dialog')).toBeTruthy());
    expect(screen.getByText('Não foi possível abrir o email')).toBeTruthy();
    expect(screen.getByText('Tente novamente pelo aplicativo de email do aparelho.')).toBeTruthy();
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

  it('controls Android auto backup with clear privacy copy', async () => {
    const screen = renderScreen(<DataScreen />);

    expect(screen.getByText('Backup automático do Android')).toBeTruthy();
    expect(screen.getByText(/depende do backup Android\/Google Drive/i)).toBeTruthy();
    expect(screen.getByText(/O Frogs não tem acesso nem gerencia a cópia na nuvem/i)).toBeTruthy();
    expect(screen.queryByText(/inclui apenas dados essenciais/i)).toBeNull();
    expect(screen.queryByText(/logs, histórico de importação e caches analíticos ficam fora/i)).toBeNull();

    await act(async () => {
      fireEvent(screen.getByTestId('switch-data-auto-backup'), 'valueChange', true);
    });

    await waitFor(() => expect(setAutoBackupEnabled).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.getByText('Backup automático ativado.')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Última atualização: 16/05/2026 às 12:34.')).toBeTruthy());
    expect(screen.queryByText(/2026-05-16 15:34/)).toBeNull();

    fireEvent.press(screen.getByTestId('btn-data-auto-backup-update'));

    await waitFor(() => expect(writeAutoBackupSnapshot).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Backup automático atualizado.')).toBeTruthy());
  });

  it('exports all routines from the Privacy and Data export options', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-routines'));

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Exportar rotinas')).toBeTruthy();
    expect(getActionTestIds(screen.getByTestId('modal-app-dialog-actions').children)).toEqual([
      'btn-app-dialog-action-all_routines',
      'btn-app-dialog-action-select_routines',
      'btn-app-dialog-cancel',
    ]);
    expect(flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-all_routines').props.style).backgroundColor).toBe(
      colors.primary,
    );
    expect(flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-select_routines').props.style).backgroundColor).toBe(
      colors.input,
    );
    expect(flattenPressableStyle(screen.getByTestId('btn-app-dialog-cancel').props.style).backgroundColor).toBe(
      colors.danger,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-all_routines'));
    });

    await waitFor(() => expect(exportRoutinesJson).toHaveBeenCalledWith());
    await waitFor(() => expect(screen.getByText('Arquivo JSON de rotinas pronto para compartilhar.')).toBeTruthy());
  });

  it('opens the routine selection screen from the Privacy and Data export options', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-routines'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-select_routines'));
    });

    expect(router.push).toHaveBeenCalledWith('/settings/routine-export');
    expect(exportRoutinesJson).not.toHaveBeenCalled();
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

  it('handles routine JSON import cancel, success and review states', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-import-routines'));
    await waitFor(() => expect(screen.getByText('Importação de rotinas cancelada.')).toBeTruthy());

    (pickAndImportRoutineJson as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_routine_json',
      fileName: 'rotinas.json',
      status: 'success',
      insertedCount: 2,
      skippedCount: 0,
      errors: [],
    });
    fireEvent.press(screen.getByTestId('btn-data-import-routines'));
    await waitFor(() => expect(screen.getByText('Importação concluída: 2 rotinas adicionadas.')).toBeTruthy());

    (pickAndImportRoutineJson as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_routine_json',
      fileName: 'rotinas-revisao.json',
      status: 'pending_review',
      reviewJobId: 'import-job-routines',
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
    });
    fireEvent.press(screen.getByTestId('btn-data-import-routines'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/settings/import-review',
        params: { importJobId: 'import-job-routines', returnTo: 'settingsData' },
      }),
    );
    await waitFor(() => expect(screen.getByText('Importação pronta para revisar exercícios importados.')).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText('Importação pronta para revisar exercícios importados.')).toBeTruthy());
  });

  it('handles backup restore cancel and success states', async () => {
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-restore-backup'));
    await waitFor(() => expect(screen.getByTestId('modal-app-dialog')).toBeTruthy());
    expect(screen.getByText(/A base atual deste aparelho será substituída/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-cancel'));
    });
    expect(pickAndRestoreBackup).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('btn-data-restore-backup'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });
    await waitFor(() => expect(screen.getByText('Restauração cancelada.')).toBeTruthy());

    (pickAndRestoreBackup as jest.Mock).mockResolvedValueOnce({
      status: 'success',
      insertedCount: 42,
      errors: [],
    });
    fireEvent.press(screen.getByTestId('btn-data-restore-backup'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });
    await waitFor(() => expect(screen.getByText('Cópia restaurada com 42 registros.')).toBeTruthy());
  });

  it('opens review when restoring a backup with exercises from the data screen', async () => {
    (pickAndRestoreBackup as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_backup_json',
      fileName: 'frog-backup-v1.json',
      status: 'pending_review',
      reviewJobId: 'import-job-backup',
      insertedCount: 4,
      skippedCount: 0,
      errors: [],
    });

    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-restore-backup'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/settings/import-review',
        params: { importJobId: 'import-job-backup', returnTo: 'settingsData' },
      }),
    );
    await waitFor(() => expect(screen.getByText('Cópia pronta para revisar exercícios importados.')).toBeTruthy());
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

  it('opens the public privacy policy from a discreet action below local cleanup', async () => {
    const screen = renderScreen(<DataScreen />);

    expect(screen.getByTestId('btn-data-privacy-policy')).toBeTruthy();
    expect(screen.getByText('Política de privacidade')).toBeTruthy();

    const renderedTexts = flattenRenderedText(screen.toJSON());
    const cleanupSectionIndex = renderedTexts.indexOf('Limpeza local');
    const resetActionIndex = renderedTexts.indexOf('Reiniciar base local');
    const privacyActionIndex = renderedTexts.indexOf('Política de privacidade');

    expect(cleanupSectionIndex).toBeGreaterThan(-1);
    expect(resetActionIndex).toBeGreaterThan(cleanupSectionIndex);
    expect(privacyActionIndex).toBeGreaterThan(resetActionIndex);

    fireEvent.press(screen.getByTestId('btn-data-privacy-policy'));

    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL));
  });

  it('shows an alert when the public privacy policy cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('No browser available'));
    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-privacy-policy'));

    await waitFor(() => expect(screen.getByTestId('modal-app-dialog')).toBeTruthy());
    expect(screen.getByText('Não foi possível abrir a política')).toBeTruthy();
    expect(screen.getByText('Tente novamente em instantes ou abra o link pelo navegador.')).toBeTruthy();
  });

  it('surfaces action errors and disables buttons while busy', async () => {
    let rejectExport!: (error: Error) => void;
    (exportWorkoutsCsv as jest.Mock).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectExport = reject;
        }),
    );

    const screen = renderScreen(<DataScreen />);

    fireEvent.press(screen.getByTestId('btn-data-export-workouts'));

    await waitFor(() => expect(screen.getByTestId('btn-app-dialog-action-all_workouts')).toBeTruthy());
    act(() => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-all_workouts'));
    });

    await waitFor(() => expect(screen.getByTestId('btn-data-export-workouts').props.accessibilityState.disabled).toBe(true));
    await act(async () => {
      rejectExport(new Error('Falha ao exportar'));
    });
    await waitFor(() => expect(screen.getByText('Falha ao exportar')).toBeTruthy());
  });
});
