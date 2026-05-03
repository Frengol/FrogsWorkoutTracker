import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { getIdentitySnapshot, saveLocalProfileSettings } from '@/src/modules/identity/service';
import { syncWorkoutReminderNotifications } from '@/src/modules/notifications/service';
import {
  isOverlayPermissionGranted,
  openAppDetailsSettings,
  openOverlayPermissionSettings,
} from '@/src/modules/rest-overlay/service';
import { getExperienceLevelLabel, getUnitSystemLabel } from '@/src/shared/copy/labels';
import { AppScreen, Card, Chip, Field, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';

const experienceOptions = ['beginner', 'intermediate', 'advanced'] as const;
const unitOptions = ['metric', 'imperial'] as const;
const reminderDayOptions = [
  { label: 'dom', value: 1 },
  { label: 'seg', value: 2 },
  { label: 'ter', value: 3 },
  { label: 'qua', value: 4 },
  { label: 'qui', value: 5 },
  { label: 'sex', value: 6 },
  { label: 'sáb', value: 7 },
] as const;

export default function SettingsScreen() {
  const snapshot = useMemo(() => getIdentitySnapshot(), []);
  const { refresh } = useAppBootstrap();
  const isAndroid = Platform.OS === 'android';
  const [displayName, setDisplayName] = useState(snapshot.user?.displayName ?? '');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    snapshot.user?.experienceLevel ?? 'intermediate',
  );
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(snapshot.user?.unitSystem ?? 'metric');
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(String(snapshot.preferences?.defaultRestSeconds ?? 90));
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(snapshot.preferences?.weekStartsOn ?? 1);
  const [keepAwake, setKeepAwake] = useState(snapshot.preferences?.keepAwake ?? true);
  const [hapticsEnabled, setHapticsEnabled] = useState(snapshot.preferences?.hapticsEnabled ?? true);
  const [showRpe, setShowRpe] = useState(snapshot.preferences?.showRpe ?? true);
  const [showPreviousValues, setShowPreviousValues] = useState(snapshot.preferences?.showPreviousValues ?? true);
  const [restOverlayEnabled, setRestOverlayEnabled] = useState(snapshot.preferences?.restOverlayEnabled ?? false);
  const [restTimerNotificationEnabled, setRestTimerNotificationEnabled] = useState(
    snapshot.notifications?.restTimerNotificationEnabled ?? true,
  );
  const [prNotificationEnabled, setPrNotificationEnabled] = useState(
    snapshot.notifications?.prNotificationEnabled ?? true,
  );
  const [remindersEnabled, setRemindersEnabled] = useState(snapshot.notifications?.remindersEnabled ?? false);
  const [reportsEnabled, setReportsEnabled] = useState(snapshot.notifications?.reportsEnabled ?? true);
  const [reminderTimeLocal, setReminderTimeLocal] = useState(snapshot.notifications?.reminderTimeLocal ?? '19:00');
  const [reminderDays, setReminderDays] = useState<number[]>(snapshot.notifications?.reminderDays ?? [2, 4, 6]);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState(() =>
    isAndroid ? isOverlayPermissionGranted() : false,
  );
  const [overlayPermissionFlowStarted, setOverlayPermissionFlowStarted] = useState(
    () => Boolean(isAndroid && snapshot.preferences?.restOverlayEnabled && !isOverlayPermissionGranted()),
  );
  const [saveMessage, setSaveMessage] = useState('');

  const refreshOverlayPermission = useCallback(() => {
    if (!isAndroid) {
      return;
    }

    const granted = isOverlayPermissionGranted();
    setOverlayPermissionGranted(granted);
  }, [isAndroid]);

  useFocusEffect(
    useCallback(() => {
      refreshOverlayPermission();
    }, [refreshOverlayPermission]),
  );

  useEffect(() => {
    if (!isAndroid) {
      return;
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshOverlayPermission();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [isAndroid, refreshOverlayPermission]);

  const hasPendingOverlayPermission = isAndroid && restOverlayEnabled && !overlayPermissionGranted;
  const shouldShowRestrictedSettingsHelp = hasPendingOverlayPermission && overlayPermissionFlowStarted;

  const handleOverlayPermissionPress = useCallback(() => {
    setOverlayPermissionFlowStarted(true);
    openOverlayPermissionSettings()
      .then(() => refreshOverlayPermission())
      .catch(() => undefined);
  }, [refreshOverlayPermission]);

  const handleOpenAppDetailsPress = useCallback(() => {
    setOverlayPermissionFlowStarted(true);
    openAppDetailsSettings()
      .then(() => refreshOverlayPermission())
      .catch(() => undefined);
  }, [refreshOverlayPermission]);

  useEffect(() => {
    if (overlayPermissionGranted) {
      setOverlayPermissionFlowStarted(false);
      return;
    }

    if (!restOverlayEnabled) {
      setOverlayPermissionFlowStarted(false);
      return;
    }

    if (snapshot.preferences?.restOverlayEnabled) {
      setOverlayPermissionFlowStarted(true);
    }
  }, [overlayPermissionGranted, restOverlayEnabled, snapshot.preferences?.restOverlayEnabled]);

  const toggleReminderDay = (day: number) => {
    setReminderDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b),
    );
  };

  const handleSave = async () => {
    saveLocalProfileSettings({
      displayName,
      experienceLevel,
      unitSystem,
      defaultRestSeconds: Number(defaultRestSeconds) || 90,
      weekStartsOn,
      keepAwake,
      hapticsEnabled,
      showRpe,
      showPreviousValues,
      restOverlayEnabled,
      restTimerNotificationEnabled,
      prNotificationEnabled,
      remindersEnabled,
      reportsEnabled,
      reminderTimeLocal,
      reminderDays,
    });
    await syncWorkoutReminderNotifications();
    refresh();
    router.replace(routes.profile());
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.profile());
  };

  return (
    <AppScreen scroll testID="screen-settings">
      <ScreenHeader
        eyebrow="Configurações"
        title="Preferências do app"
        subtitle="Ajuste seu nome, a forma de registrar treinos e os lembretes do dia a dia."
        backAction={handleBack}
        backTestID="btn-settings-back"
      />

      <Card variant="muted">
        <Field label="Nome no app" testID="input-settings-display-name" value={displayName} onChangeText={setDisplayName} />
      </Card>

      <SectionTitle>Perfil de treino</SectionTitle>
      <Card variant="muted">
        <Text style={styles.label}>Nível</Text>
        <ChipRow
          items={experienceOptions.map((item) => ({ value: item, label: getExperienceLevelLabel(item) }))}
          selected={experienceLevel}
          onSelect={(value) => setExperienceLevel(value as typeof experienceLevel)}
        />

        <Text style={styles.label}>Unidades</Text>
        <ChipRow
          items={unitOptions.map((item) => ({ value: item, label: getUnitSystemLabel(item) }))}
          selected={unitSystem}
          onSelect={(value) => setUnitSystem(value as typeof unitSystem)}
        />

        <Text style={styles.label}>Semana inicia</Text>
        <View style={styles.inlineRow}>
          <WeekButton label="domingo" active={weekStartsOn === 0} onPress={() => setWeekStartsOn(0)} />
          <WeekButton label="segunda" active={weekStartsOn === 1} onPress={() => setWeekStartsOn(1)} />
        </View>

        <View style={styles.restRow}>
          <Text style={[styles.label, styles.restLabel]}>Descanso padrão (segundos)</Text>
          <TextInput
            accessibilityLabel="Descanso padrão (segundos)"
            keyboardType="number-pad"
            value={defaultRestSeconds}
            onChangeText={setDefaultRestSeconds}
            placeholderTextColor={colors.textMuted}
            style={styles.restInput}
            testID="input-settings-default-rest-seconds"
          />
        </View>
      </Card>

      <SectionTitle>Experiência ao vivo</SectionTitle>
      <Card variant="muted">
        <PreferenceRow label="Manter tela acordada" value={keepAwake} onChange={setKeepAwake} />
        <PreferenceRow label="Vibração" value={hapticsEnabled} onChange={setHapticsEnabled} />
        <PreferenceRow label="Mostrar RPE" value={showRpe} onChange={setShowRpe} />
        <PreferenceRow label="Mostrar valores anteriores" value={showPreviousValues} onChange={setShowPreviousValues} />
        {isAndroid ? (
          <>
            <PreferenceRow
              label="Overlay de descanso fora do treino"
              value={restOverlayEnabled}
              onChange={setRestOverlayEnabled}
            />
            {hasPendingOverlayPermission ? (
              <View style={styles.overlayPermissionNotice} testID="card-settings-overlay-permission">
                <Text style={styles.overlayPermissionTitle}>
                  {shouldShowRestrictedSettingsHelp
                    ? 'O Android ainda está bloqueando o overlay'
                    : 'Permissão necessária para mostrar o overlay'}
                </Text>
                <Text style={styles.helperText}>
                  {shouldShowRestrictedSettingsHelp
                    ? 'Em alguns aparelhos Android, apps instalados manualmente precisam liberar “configurações restritas” antes de permitir sobreposição.'
                    : 'Para mostrar o descanso fora do treino, o Frogs precisa de permissão para aparecer sobre outros apps.'}
                </Text>
                {shouldShowRestrictedSettingsHelp ? (
                  <Text style={styles.helperText}>
                    Abra as informações do app e use o menu ⋮ no topo para liberar “Permitir configurações restritas”.
                  </Text>
                ) : null}
                <PrimaryButton
                  label="Liberar permissão overlay"
                  onPress={handleOverlayPermissionPress}
                  style={styles.overlayPermissionButton}
                  testID="btn-settings-overlay-permission"
                />
                {shouldShowRestrictedSettingsHelp ? (
                  <SecondaryButton
                    label="Abrir info do app"
                    onPress={handleOpenAppDetailsPress}
                    style={styles.overlayPermissionButton}
                    testID="btn-settings-overlay-app-details"
                  />
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </Card>

      <SectionTitle>Notificações</SectionTitle>
      <Card variant="muted">
        <PreferenceRow label="Descanso automático" value={restTimerNotificationEnabled} onChange={setRestTimerNotificationEnabled} />
        <PreferenceRow label="Recordes" value={prNotificationEnabled} onChange={setPrNotificationEnabled} />
        <PreferenceRow label="Lembretes" value={remindersEnabled} onChange={setRemindersEnabled} />
        <PreferenceRow label="Relatórios" value={reportsEnabled} onChange={setReportsEnabled} />

        {remindersEnabled ? (
          <>
            <Field
              label="Horário do lembrete"
              value={reminderTimeLocal}
              onChangeText={setReminderTimeLocal}
              placeholder="19:00"
            />
            <Text style={styles.label}>Dias ativos</Text>
            <View style={styles.inlineRow}>
              {reminderDayOptions.map((item) => (
                <Chip
                  key={item.value}
                  label={item.label}
                  active={reminderDays.includes(item.value)}
                  onPress={() => toggleReminderDay(item.value)}
                />
              ))}
            </View>
            <Text style={styles.helperText}>
              Se a permissão de notificação for negada no aparelho, os lembretes podem não aparecer até o acesso ser liberado.
            </Text>
          </>
        ) : null}
      </Card>

      <Card variant="spotlight">
        <View style={styles.actionsRow}>
          <SecondaryButton label="Privacidade e dados" onPress={() => router.push(routes.settingsData())} style={styles.flexButton} />
          <PrimaryButton
            label="Salvar"
            onPress={() => {
              handleSave().catch((error) => {
                setSaveMessage(error instanceof Error ? error.message : 'Não foi possível salvar as configurações.');
              });
            }}
            style={styles.flexButton}
            testID="btn-settings-save"
          />
        </View>
        {saveMessage ? <Text style={styles.saveMessage}>{saveMessage}</Text> : null}
      </Card>
    </AppScreen>
  );
}

const ChipRow = ({
  items,
  selected,
  onSelect,
}: {
  items: readonly { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) => (
  <View style={styles.inlineRow}>
    {items.map((item) => (
      <Chip key={item.value} label={item.label} active={item.value === selected} onPress={() => onSelect(item.value)} />
    ))}
  </View>
);

const WeekButton = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Semana inicia em ${label}`}
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[styles.weekButton, active ? styles.weekButtonActive : null]}>
    <Text style={[styles.weekButtonText, active ? styles.weekButtonTextActive : null]}>{label}</Text>
  </Pressable>
);

const PreferenceRow = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <View style={styles.preferenceRow}>
    <Text style={styles.preferenceLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.borderStrong, true: colors.primarySurface }}
      thumbColor={value ? colors.primary : colors.textTertiary}
    />
  </View>
);

const styles = StyleSheet.create({
  label: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  helperText: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  restLabel: {
    flex: 1,
    marginBottom: 0,
  },
  restInput: {
    width: 96,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.body,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  preferenceLabel: {
    flex: 1,
    fontFamily: typography.body,
    color: colors.text,
    fontSize: 15,
  },
  overlayPermissionNotice: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  overlayPermissionTitle: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 14,
  },
  overlayPermissionButton: {
    alignSelf: 'flex-start',
  },
  weekButton: {
    flex: 1,
    minWidth: 128,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  weekButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  weekButtonText: {
    textAlign: 'center',
    fontFamily: typography.bodySemi,
    color: colors.textMuted,
  },
  weekButtonTextActive: {
    color: colors.primaryPressed,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  saveMessage: {
    fontFamily: typography.bodySemi,
    color: colors.primary,
    fontSize: 14,
  },
});
