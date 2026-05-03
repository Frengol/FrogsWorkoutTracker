import { router, usePathname } from 'expo-router';
import { Text, StyleSheet } from 'react-native';

import { routes } from '@/src/shared/navigation/routes';
import { AppScreen, Card, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { colors, typography } from '@/src/shared/design/tokens';

export default function NotFoundScreen() {
  const pathname = usePathname();

  return (
    <AppScreen testID="screen-not-found">
      <ScreenHeader
        eyebrow="Rota inválida"
        title="Não encontramos essa tela"
        subtitle="O link recebido não corresponde a uma rota pública válida do Frogs."
      />

      <Card>
        <Text style={styles.label}>Path recebido</Text>
        <Text style={styles.pathValue}>{pathname || '/'}</Text>
        <Text style={styles.helperText}>
          Volte para o início para continuar usando o app normalmente ou retorne para a tela anterior.
        </Text>
      </Card>

      <Card>
        <PrimaryButton label="Ir para o início" onPress={() => router.replace(routes.home())} />
        <SecondaryButton label="Voltar" onPress={() => router.back()} />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 13,
  },
  pathValue: {
    fontFamily: typography.bodyStrong,
    color: colors.primary,
    fontSize: 16,
  },
  helperText: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
});
