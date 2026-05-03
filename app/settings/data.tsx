import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import {
  exportBackupJson,
  exportMeasurementsCsv,
  exportWorkoutsCsv,
  pickAndImportCsvData,
  pickAndRestoreBackup,
  resetLocalAppData,
} from '@/src/modules/data-transfer/service';
import { cleanupOrphanWorkoutMedia } from '@/src/modules/media/service';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { AppScreen, Card, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { colors, typography } from '@/src/shared/design/tokens';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';

export default function DataScreen() {
  const dialog = useAppDialog();
  const { refresh: refreshBootstrap } = useAppBootstrap();
  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.settings());
  };

  const runAction = async (action: () => Promise<string | null>) => {
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

      <SectionTitle>Exportação</SectionTitle>
      <Card variant="muted">
        <PrimaryButton
          label={isBusy ? 'Trabalhando...' : 'Exportar treinos CSV'}
          onPress={() =>
            runAction(async () => {
              await exportWorkoutsCsv();
              return 'Arquivo CSV de treinos pronto para compartilhar.';
            })
          }
          disabled={isBusy}
          testID="btn-data-export-workouts"
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
                return 'Importação pronta para revisar exercícios novos.';
              }

              return `Importação concluída: ${result.insertedCount} itens adicionados, ${result.skippedCount} ignorados.`;
            })
          }
          disabled={isBusy}
          testID="btn-data-import-csv"
        />
        <SecondaryButton
          label="Restaurar cópia de segurança"
          onPress={() =>
            runAction(async () => {
              const result = await pickAndRestoreBackup();
              if (!result) {
                return 'Restauração cancelada.';
              }

              return `Cópia restaurada com ${result.insertedCount} registros.`;
            })
          }
          disabled={isBusy}
          testID="btn-data-restore-backup"
        />
        <Text style={styles.helpText}>
          Você pode importar o CSV do Frogs e também o CSV exportado pelo Hevy. O arquivo `frog-backup-v1.json`
          restaura sua base local completa.
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
  statusText: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },
});
