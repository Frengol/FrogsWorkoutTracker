import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

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
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { PRIVACY_POLICY_URL } from '@/src/shared/config/privacy-policy';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { colors, typography } from '@/src/shared/design/tokens';
import { AppScreen, Card, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { formatLocalDateTimeLabel } from '@/src/shared/utils/date';

const SUPPORT_EMAIL = 'frogsworkout@gmail.com';
const SUPPORT_EMAIL_URL = 'mailto:frogsworkout@gmail.com?subject=Frogs%20-%20sugest%C3%A3o%20ou%20problema';
const SUPPORT_EMAIL_TITLE = 'Sugestões ou problemas?';
const SUPPORT_EMAIL_ACTION = 'Clique aqui e envie para frogsworkout@gmail.com';

export default function DataScreen() {
  const dialog = useAppDialog();
  const { refresh: refreshBootstrap } = useAppBootstrap();
  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [autoBackupStatus, setAutoBackupStatus] = useState(() => getAutoBackupStatus());

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.settings());
  };

  const runAction = async (action: () => Promise<string | null> | string | null) => {
    setIsBusy(true);
    setStatusMessage('');

    try {
      const message = await action();
      refreshBootstrap();
      if (message) {
        setStatusMessage(message);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAutoBackupToggle = (enabled: boolean) =>
    runAction(async () => {
      const nextStatus = await setAutoBackupEnabled(enabled);
      setAutoBackupStatus(nextStatus);
      return enabled ? 'Backup automático ativado.' : 'Backup automático desativado.';
    });

  const handleAutoBackupUpdate = () =>
    runAction(async () => {
      const nextStatus = await writeAutoBackupSnapshot();
      setAutoBackupStatus(nextStatus);
      return 'Backup automático atualizado.';
    });

  const handleResetLocalData = async () => {
    const confirmed = await dialog.confirm({
      title: 'Reiniciar base local',
      message: 'Isso apaga treinos, medidas, exercícios personalizados, rascunhos e preferências atuais deste aparelho.',
      confirmLabel: 'Apagar tudo',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    await runAction(async () => {
      await resetLocalAppData();
      return 'Base local reiniciada para o estado inicial.';
    });
  };

  const handleOpenPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      await dialog.alert({
        title: 'Não foi possível abrir a política',
        message: 'Tente novamente em instantes ou abra o link pelo navegador.',
      });
    }
  };

  const handleOpenSupportEmail = async () => {
    try {
      await Linking.openURL(SUPPORT_EMAIL_URL);
    } catch {
      await dialog.alert({
        title: 'Não foi possível abrir o email',
        message: 'Tente novamente pelo aplicativo de email do aparelho.',
      });
    }
  };

  const handleExportWorkouts = async () => {
    const choice = await dialog.choose({
      title: 'Exportar treinos',
      message: 'Você pode compartilhar todos os treinos concluídos ou escolher um período e selecionar apenas alguns.',
      cancelPosition: 'last',
      cancelTone: 'danger',
      actions: [
        { label: 'Todos os treinos', value: 'all_workouts', tone: 'primary' },
        { label: 'Selecionar treinos', value: 'select_workouts', tone: 'neutral' },
      ],
    });

    if (choice === 'all_workouts') {
      await runAction(async () => {
        await exportWorkoutsCsv();
        return 'Arquivo CSV de treinos pronto para compartilhar.';
      });
      return;
    }

    if (choice === 'select_workouts') {
      router.push(routes.settingsWorkoutExport());
    }
  };

  const handleExportRoutines = async () => {
    const choice = await dialog.choose({
      title: 'Exportar rotinas',
      message: 'Você pode compartilhar todas as rotinas salvas ou escolher apenas algumas.',
      cancelPosition: 'last',
      cancelTone: 'danger',
      actions: [
        { label: 'Todas as rotinas', value: 'all_routines', tone: 'primary' },
        { label: 'Selecionar rotinas', value: 'select_routines', tone: 'neutral' },
      ],
    });

    if (choice === 'all_routines') {
      await runAction(async () => {
        await exportRoutinesJson();
        return 'Arquivo JSON de rotinas pronto para compartilhar.';
      });
      return;
    }

    if (choice === 'select_routines') {
      router.push(routes.settingsRoutineExport());
    }
  };

  const handleImportRoutines = () =>
    runAction(async () => {
      const result = await pickAndImportRoutineJson();
      if (!result) {
        return 'Importação de rotinas cancelada.';
      }

      if (result.errors.length > 0 || result.status === 'failed' || result.status === 'blocked_duplicate') {
        return result.errors.length > 0 ? result.errors.join('\n') : 'Não foi possível importar rotinas.';
      }

      if (result.status === 'pending_review' && result.reviewJobId) {
        router.push(routes.settingsImportReview(result.reviewJobId, { returnTo: 'settingsData' }));
        return 'Importação pronta para revisar exercícios importados.';
      }

      const insertedLabel =
        result.insertedCount === 1
          ? '1 rotina adicionada'
          : `${result.insertedCount} rotinas adicionadas`;
      return `Importação concluída: ${insertedLabel}.`;
    });

  const handleRestoreBackup = async () => {
    const confirmed = await dialog.confirm({
      title: 'Restaurar cópia de segurança',
      message:
        'A base atual deste aparelho será substituída pela cópia de segurança importada. Se houver exercícios, você poderá revisar antes de salvar a restauração.',
      confirmLabel: 'Continuar',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    await runAction(async () => {
      const result = await pickAndRestoreBackup();
      if (!result) {
        return 'Restauração cancelada.';
      }

      if (result.status === 'pending_review' && result.reviewJobId) {
        router.push(routes.settingsImportReview(result.reviewJobId, { returnTo: 'settingsData' }));
        return 'Cópia pronta para revisar exercícios importados.';
      }

      if (result.errors.length > 0 || result.status === 'failed' || result.status === 'blocked_duplicate') {
        return result.errors.length > 0 ? result.errors.join('\n') : 'Não foi possível restaurar a cópia.';
      }

      return `Cópia restaurada com ${result.insertedCount} registros.`;
    });
  };

  return (
    <AppScreen scroll testID="screen-settings-data">
      <ScreenHeader
        eyebrow="Privacidade e dados"
        title="Privacidade, exportação e limpeza"
        subtitle="Seus dados ficam no aparelho. Aqui você exporta, restaura, limpa arquivos sem vínculo e reinicia a base local."
        backAction={handleBack}
        backTestID="btn-settings-data-back"
      />

      <Card variant="muted">
        <Text style={styles.paragraph}>
          O Frogs funciona só neste aparelho e não depende de conta nem internet para registrar seus dados.
        </Text>
      </Card>

      <Card variant="muted">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Enviar sugestões ou problemas para ${SUPPORT_EMAIL}`}
          accessibilityHint="Abre o aplicativo de email do aparelho"
          hitSlop={8}
          onPress={() => {
            handleOpenSupportEmail().catch(() => undefined);
          }}
          style={styles.supportEmailAction}
          testID="btn-data-support-email"
        >
          <Text style={styles.supportEmailTitle}>{SUPPORT_EMAIL_TITLE}</Text>
          <Text style={styles.supportEmailText}>{SUPPORT_EMAIL_ACTION}</Text>
        </Pressable>
      </Card>

      <SectionTitle>Backup automático</SectionTitle>
      <Card variant="muted">
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Backup automático do Android</Text>
            <Text style={styles.helpText}>
              Depende do backup Android/Google Drive do aparelho. O Frogs não tem acesso nem gerencia a cópia
              na nuvem.
            </Text>
          </View>
          <Switch
            value={autoBackupStatus.enabled}
            onValueChange={(enabled) => {
              handleAutoBackupToggle(enabled).catch(() => undefined);
            }}
            disabled={isBusy}
            trackColor={{ false: colors.borderStrong, true: colors.primarySurface }}
            thumbColor={autoBackupStatus.enabled ? colors.primary : colors.textTertiary}
            testID="switch-data-auto-backup"
          />
        </View>
        <Text style={styles.helpText}>
          {autoBackupStatus.lastUpdatedAt
            ? `Última atualização: ${formatLocalDateTimeLabel(autoBackupStatus.lastUpdatedAt)}.`
            : 'Nenhum backup automático gerado neste aparelho.'}
        </Text>
        <SecondaryButton
          label="Atualizar backup agora"
          onPress={() => {
            handleAutoBackupUpdate().catch(() => undefined);
          }}
          disabled={isBusy || !autoBackupStatus.enabled}
          testID="btn-data-auto-backup-update"
        />
      </Card>

      <SectionTitle>Exportação</SectionTitle>
      <Card variant="muted">
        <PrimaryButton
          label={isBusy ? 'Trabalhando...' : 'Exportar treinos CSV'}
          onPress={() => {
            handleExportWorkouts().catch(() => undefined);
          }}
          disabled={isBusy}
          testID="btn-data-export-workouts"
        />
        <SecondaryButton
          label="Exportar rotinas JSON"
          onPress={() => {
            handleExportRoutines().catch(() => undefined);
          }}
          disabled={isBusy}
          testID="btn-data-export-routines"
        />
        <SecondaryButton
          label="Exportar medidas CSV"
          onPress={() =>
            runAction(async () => {
              await exportMeasurementsCsv();
              return 'Arquivo CSV de medidas pronto para compartilhar.';
            })
          }
          disabled={isBusy}
          testID="btn-data-export-measurements"
        />
        <SecondaryButton
          label="Gerar cópia de segurança"
          onPress={() =>
            runAction(async () => {
              await exportBackupJson();
              return 'Cópia de segurança gerada.';
            })
          }
          disabled={isBusy}
          testID="btn-data-export-backup"
        />
      </Card>

      <SectionTitle>Importar e restaurar</SectionTitle>
      <Card variant="muted">
        <PrimaryButton
          label="Importar treinos"
          onPress={() =>
            runAction(async () => {
              const result = await pickAndImportCsvData();
              if (!result) {
                return 'Importação cancelada.';
              }

              if (result.errors.length > 0) {
                return result.errors.join('\n');
              }

              if (result.status === 'pending_review' && result.reviewJobId) {
                router.push(routes.settingsImportReview(result.reviewJobId));
                return 'Importação pronta para revisar exercícios importados.';
              }

              return `Importação concluída: ${result.insertedCount} itens adicionados, ${result.skippedCount} ignorados.`;
            })
          }
          disabled={isBusy}
          testID="btn-data-import-csv"
        />
        <SecondaryButton
          label="Importar rotinas"
          onPress={() => {
            handleImportRoutines().catch(() => undefined);
          }}
          disabled={isBusy}
          testID="btn-data-import-routines"
        />
        <SecondaryButton
          label="Restaurar cópia de segurança"
          onPress={() => {
            handleRestoreBackup().catch(() => undefined);
          }}
          disabled={isBusy}
          testID="btn-data-restore-backup"
        />
        <Text style={styles.helpText}>
          Você pode importar treinos por CSV do Frogs ou do Hevy, importar rotinas por JSON do Frogs e restaurar
          o arquivo `frog-backup-v1.json` com os dados essenciais do app.
        </Text>
      </Card>

      <SectionTitle>Limpeza local</SectionTitle>
      <Card variant="muted">
        <SecondaryButton
          label="Limpar arquivos sem vínculo"
          onPress={() =>
            runAction(async () => {
              const removed = await cleanupOrphanWorkoutMedia();
              return removed > 0 ? `${removed} arquivo(s) sem vínculo removido(s).` : 'Nenhum arquivo solto foi encontrado.';
            })
          }
          disabled={isBusy}
          testID="btn-data-cleanup-media"
        />
        <SecondaryButton
          label="Reiniciar base local"
          tone="destructive"
          onPress={() =>
            handleResetLocalData().catch(() => undefined)
          }
          disabled={isBusy}
          testID="btn-data-reset-local"
        />
      </Card>

      <SecondaryButton
        label="Política de privacidade"
        onPress={() => {
          handleOpenPrivacyPolicy().catch(() => undefined);
        }}
        testID="btn-data-privacy-policy"
      />

      {statusMessage ? (
        <Card variant="spotlight">
          <Text style={styles.statusText}>{statusMessage}</Text>
        </Card>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  helpText: {
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  supportEmailAction: {
    minHeight: 32,
    justifyContent: 'center',
    gap: 2,
  },
  supportEmailTitle: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accent,
  },
  supportEmailText: {
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  preferenceCopy: {
    flex: 1,
    gap: 6,
  },
  preferenceTitle: {
    fontFamily: typography.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  statusText: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },
});
