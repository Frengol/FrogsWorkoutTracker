import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { importExternalDataFile } from '@/src/modules/data-transfer/service';
import { setLibrarySuccessNotice } from '@/src/shared/config/library-success-notice';
import { setProfileSuccessNotice } from '@/src/shared/config/profile-success-notice';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { Card, AppScreen, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { colors, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { ImportJobResult } from '@/src/shared/types/domain';

const invalidExternalImportMessage =
  'Este arquivo não é um CSV de treino Frogs/Hevy, um JSON de rotina Frogs ou uma cópia de segurança do Frogs.';

const toParamString = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const getDestinationForImport = (result: ImportJobResult) =>
  result.sourceType === 'frog_routine_json'
    ? routes.library()
    : result.sourceType === 'frog_backup_json'
      ? routes.settingsData()
      : routes.profile();

const getReviewReturnTo = (result: ImportJobResult) =>
  result.sourceType === 'frog_routine_json'
    ? 'library'
    : result.sourceType === 'frog_backup_json'
      ? 'settingsData'
      : 'profile';

const shouldConfirmBackupRestore = (fileName: string | null | undefined, uri: string | null | undefined) => {
  const candidate = `${fileName ?? ''} ${uri ?? ''}`.toLowerCase();
  return candidate.includes('backup') && candidate.includes('.json');
};

const formatSuccessNotice = (result: ImportJobResult) => {
  if (result.sourceType === 'frog_routine_json') {
    const insertedLabel =
      result.insertedCount === 1 ? '1 treino adicionado' : `${result.insertedCount} treinos adicionados`;
    return `Rotina importada: ${insertedLabel}.`;
  }

  if (result.sourceType === 'frog_backup_json') {
    const insertedLabel =
      result.insertedCount === 1 ? '1 registro restaurado' : `${result.insertedCount} registros restaurados`;
    return `Cópia de segurança restaurada: ${insertedLabel}.`;
  }

  return `Importação concluída: ${result.insertedCount} itens adicionados, ${result.skippedCount} ignorados.`;
};

const setDestinationNotice = (result: ImportJobResult) => {
  if (result.sourceType === 'frog_backup_json') {
    return;
  }

  const message = formatSuccessNotice(result);
  if (result.sourceType === 'frog_routine_json') {
    setLibrarySuccessNotice(message);
    return;
  }

  setProfileSuccessNotice(message);
};

export default function ImportFileScreen() {
  const params = useLocalSearchParams<{ uri?: string | string[]; fileName?: string | string[] }>();
  const uri = toParamString(params.uri);
  const fileName = toParamString(params.fileName);
  const dialog = useAppDialog();
  const dialogRef = useRef(dialog);
  const [message, setMessage] = useState('Importando arquivo...');
  const [hasError, setHasError] = useState(false);
  dialogRef.current = dialog;

  useEffect(() => {
    let didCancel = false;

    const processFile = async () => {
      if (!uri) {
        setHasError(true);
        setMessage('Arquivo para importação não encontrado.');
        return;
      }

      setHasError(false);
      setMessage('Importando arquivo...');

      if (shouldConfirmBackupRestore(fileName, uri)) {
        const confirmed = await dialogRef.current.confirm({
          title: 'Restaurar cópia de segurança',
          message:
            'A base atual deste aparelho será substituída pela cópia de segurança importada. Se houver exercícios, você poderá revisar antes de salvar a restauração.',
          confirmLabel: 'Continuar',
          tone: 'danger',
        });

        if (didCancel) {
          return;
        }

        if (!confirmed) {
          router.replace(routes.settingsData());
          return;
        }
      }

      const result = await importExternalDataFile({ uri, fileName });
      if (didCancel) {
        return;
      }

      if (result.status === 'pending_review' && result.reviewJobId) {
        router.replace(routes.settingsImportReview(result.reviewJobId, { returnTo: getReviewReturnTo(result) }));
        return;
      }

      if (result.status === 'success') {
        setDestinationNotice(result);
        router.replace(getDestinationForImport(result));
        return;
      }

      setHasError(true);
      setMessage(result.errors.length > 0 ? result.errors.join('\n') : invalidExternalImportMessage);
    };

    processFile().catch((error) => {
      if (didCancel) {
        return;
      }

      setHasError(true);
      setMessage(error instanceof Error ? error.message : invalidExternalImportMessage);
    });

    return () => {
      didCancel = true;
    };
  }, [fileName, uri]);

  return (
    <AppScreen testID="screen-import-file">
      <ScreenHeader eyebrow="IMPORTAÇÃO" title="Abrir arquivo" backAction={() => router.replace(routes.settingsData())} />

      <Card variant={hasError ? 'muted' : 'spotlight'}>
        <Text style={[styles.message, hasError ? styles.errorMessage : null]}>{message}</Text>
        {hasError ? (
          <SecondaryButton
            label="Voltar"
            onPress={() => router.replace(routes.settingsData())}
            testID="btn-import-file-back"
          />
        ) : null}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  message: {
    fontFamily: typography.bodySemi,
    fontSize: 15,
    lineHeight: 22,
    color: colors.primary,
  },
  errorMessage: {
    color: colors.danger,
  },
});
