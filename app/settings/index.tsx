import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppUpdateStatus } from '@/src/modules/app-update/service';
import { getIdentitySnapshot, saveLocalProfileSettings } from '@/src/modules/identity/service';
import { syncWorkoutReminderNotifications } from '@/src/modules/notifications/service';
import {
  isOverlayPermissionGranted,
  openAppDetailsSettings,
  openOverlayPermissionSettings,
} from '@/src/modules/rest-overlay/service';
import { getExperienceLevelLabel, getUnitSystemLabel } from '@/src/shared/copy/labels';
import {
  clearDiagnosticLogs,
  exportDiagnosticLogs,
  isDiagnosticsEnabled,
} from '@/src/shared/diagnostics/service';
import { AppScreen, Card, Chip, Field, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { TimePickerModal } from '@/src/shared/design/time-picker-modal';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';
import { useKeyboardHeight, useMeasuredScrollViewFocus } from '@/src/shared/utils/keyboard';

const experienceOptions = ['beginner', 'intermediate', 'advanced'] as const;
const unitOptions = ['metric', 'imperial'] as const;
const reminderSyncWarning = 'Preferências salvas, mas não foi possível atualizar os lembretes agora.';
const settingsSaveError = 'Não foi possível salvar as configurações.';
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
  const scrollRef = useRef<ScrollView | null>(null);
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight(true);
  const {
    cancelMeasuredFocusReveal,
    handleScrollViewScroll,
    registerFocusable,
    registerFocusableLayout,
    revealFocusable,
  } = useMeasuredScrollViewFocus({
    scrollRef,
    viewportHeight,
    keyboardHeight,
    safeAreaBottom: insets.bottom,
    screenName: 'settings',
  });
  const [displayName, setDisplayName] = useState(snapshot.user?.displayName ?? '');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    snapshot.user?.experienceLevel ?? 'intermediate',
  );
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(snapshot.user?.unitSystem ?? 'metric');
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(String(snapshot.preferences?.defaultRestSeconds ?? 90));
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(snapshot.preferences?.weekStartsOn ?? 1);
  const [keepAwake, setKeepAwake] = useState(snapshot.preferences?.keepAwake ?? true);
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
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState(() =>
    isAndroid ? isOverlayPermissionGranted() : false,
  );
  const [overlayPermissionFlowStarted, setOverlayPermissionFlowStarted] = useState(
    () => Boolean(isAndroid && snapshot.preferences?.restOverlayEnabled && !isOverlayPermissionGranted()),
  );
  const [saveMessage, setSaveMessage] = useState('');
  const {
    state: appUpdateState,
    refresh: refreshAppUpdate,
    startUpdate,
    completeUpdate,
  } = useAppUpdateStatus();
  const isCheckingAppUpdate = appUpdateState.status === 'checking';
  const isAppUpdateBusy = appUpdateState.status === 'checking' || appUpdateState.status === 'downloading' || appUpdateState.status === 'installing';
  const canRefreshAppUpdate = !isAppUpdateBusy;
  const diagnosticsEnabled = isDiagnosticsEnabled();
  const appUpdateTitle =
    appUpdateState.status === 'available'
      ? 'Nova versão disponível'
      : appUpdateState.status === 'downloaded'
        ? 'Atualização pronta para instalar'
        : appUpdateState.status === 'checking'
          ? 'Procurando atualizações...'
          : appUpdateState.status === 'downloading'
            ? 'Baixando atualização...'
            : appUpdateState.status === 'installing'
              ? 'Instalando atualização...'
              : appUpdateState.status === 'error'
                ? 'Não foi possível verificar agora.'
                : appUpdateState.status === 'unsupported' || appUpdateState.status === 'unavailable'
                  ? 'Atualizações pela Google Play indisponíveis neste aparelho'
                  : 'Você está na versão mais atualizada';

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
    setSaveMessage('');

    try {
      saveLocalProfileSettings({
        displayName,
        experienceLevel,
        unitSystem,
        defaultRestSeconds: Number(defaultRestSeconds) || 90,
        weekStartsOn,
        keepAwake,
        restOverlayEnabled,
        restTimerNotificationEnabled,
        prNotificationEnabled,
        remindersEnabled,
        reportsEnabled,
        reminderTimeLocal,
        reminderDays,
      });
    } catch {
      setSaveMessage(settingsSaveError);
      return;
    }

    try {
      await syncWorkoutReminderNotifications();
    } catch {
      refresh();
      setSaveMessage(reminderSyncWarning);
      return;
    }

    refresh();
    router.replace(routes.profile());
  };

  const handleExportDiagnosticLogs = async () => {
    setSaveMessage('');

    try {
      await exportDiagnosticLogs();
      setSaveMessage('Logs de diagnóstico exportados.');
    } catch {
      setSaveMessage('Não foi possível exportar os logs de diagnóstico.');
    }
  };

  const handleClearDiagnosticLogs = () => {
    clearDiagnosticLogs();
    setSaveMessage('Logs de diagnóstico limpos.');
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.profile());
  };

  return (
    <AppScreen
      scroll
      keyboardAware
      measuredFocusScreenName="settings"
      onScroll={handleScrollViewScroll}
      scrollEventThrottle={16}
      scrollRef={scrollRef}
      testID="screen-settings">
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

        <Text style={styles.label}>Semana inicia em</Text>
        <View style={styles.inlineRow}>
          <WeekButton
            label="domingo"
            active={weekStartsOn === 0}
            onPress={() => setWeekStartsOn(0)}
            testID="btn-settings-week-sunday"
          />
          <WeekButton
            label="segunda"
            active={weekStartsOn === 1}
            onPress={() => setWeekStartsOn(1)}
            testID="btn-settings-week-monday"
          />
        </View>

        <View style={styles.restRow}>
          <Text style={[styles.label, styles.restLabel]}>Descanso padrão (segundos)</Text>
          <TextInput
            accessibilityLabel="Descanso padrão (segundos)"
            keyboardType="number-pad"
            value={defaultRestSeconds}
            onChangeText={setDefaultRestSeconds}
            onBlur={cancelMeasuredFocusReveal}
            onFocus={() => revealFocusable('settings-default-rest')}
            onLayout={registerFocusableLayout('settings-default-rest')}
            placeholderTextColor={colors.textMuted}
            ref={registerFocusable('settings-default-rest')}
            style={styles.restInput}
            testID="input-settings-default-rest-seconds"
          />
        </View>
      </Card>

      <SectionTitle>Experiência ao vivo</SectionTitle>
      <Card variant="muted">
        <PreferenceRow label="Manter tela acordada" value={keepAwake} onChange={setKeepAwake} />
        {isAndroid ? (
          <>
            <PreferenceRow
              label="Overlay de descanso fora do treino"
              value={restOverlayEnabled}
              onChange={setRestOverlayEnabled}
              testID="switch-settings-rest-overlay"
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
                    ? 'O Android ainda não liberou o overlay. Confira a permissão de sobreposição nas configurações do aparelho.'
                    : 'Para mostrar o descanso fora do treino, o Frogs precisa de permissão para aparecer sobre outros apps.'}
                </Text>
                {shouldShowRestrictedSettingsHelp ? (
                  <>
                    <Text style={styles.helperText}>
                      Em alguns aparelhos Android, apps instalados manualmente precisam liberar “configurações restritas” antes de permitir sobreposição.
                    </Text>
                    <Text style={styles.helperText}>
                      Abra as informações do app e use o menu ⋮ no topo para liberar “Permitir configurações restritas”.
                    </Text>
                  </>
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
            ) : isAndroid && restOverlayEnabled && overlayPermissionGranted ? (
              <View style={styles.overlayPermissionNotice} testID="card-settings-overlay-ready">
                <Text style={styles.overlayPermissionTitle}>Overlay liberado</Text>
                <Text style={styles.helperText}>Overlay liberado para os próximos descansos.</Text>
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
            <View style={styles.reminderTimeRow}>
              <Text style={[styles.label, styles.reminderTimeLabel]}>Horário do lembrete</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Horário do lembrete ${reminderTimeLocal}`}
                onPress={() => setIsTimePickerVisible(true)}
                style={({ pressed }) => [styles.reminderTimeButton, pressed ? styles.reminderTimeButtonPressed : null]}
                testID="btn-settings-reminder-time">
                <Text style={styles.reminderTimeValue}>{reminderTimeLocal}</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>Dias ativos</Text>
            <View style={styles.reminderDaysRow} testID="settings-reminder-days-row">
              {reminderDayOptions.map((item) => (
                <ReminderDayButton
                  key={item.value}
                  label={item.label}
                  active={reminderDays.includes(item.value)}
                  onPress={() => toggleReminderDay(item.value)}
                  testID={`btn-settings-reminder-day-${item.value}`}
                />
              ))}
            </View>
            <Text style={styles.helperText}>
              Se a permissão de notificação for negada no aparelho, os lembretes podem não aparecer até o acesso ser liberado.
            </Text>
          </>
        ) : null}
      </Card>

      <SectionTitle>Atualizações</SectionTitle>
      <Card variant="muted" style={styles.updateCard} testID="card-settings-app-update">
        <Text style={styles.updateTitle} testID="text-settings-app-update-status">
          {appUpdateTitle}
        </Text>
        {appUpdateState.status === 'error' ? (
          <Text style={[styles.helperText, styles.updateHelperText]}>Tente novamente em alguns instantes.</Text>
        ) : null}
        <View style={styles.updateActionsRow} testID="row-settings-app-update-actions">
          {appUpdateState.status === 'available' ? (
            <PrimaryButton
              label="Atualizar"
              onPress={() => {
                startUpdate().catch(() => undefined);
              }}
              style={styles.updateActionButton}
              testID="btn-settings-app-update-start"
            />
          ) : null}
          {appUpdateState.status === 'downloaded' ? (
            <PrimaryButton
              label="Instalar agora"
              onPress={() => {
                completeUpdate().catch(() => undefined);
              }}
              style={styles.updateActionButton}
              testID="btn-settings-app-update-complete"
            />
          ) : null}
          {canRefreshAppUpdate ? (
            <SecondaryButton
              label="Procurar atualizações"
              onPress={() => {
                refreshAppUpdate().catch(() => undefined);
              }}
              disabled={isCheckingAppUpdate}
              style={styles.updateActionButton}
              testID="btn-settings-app-update-refresh"
            />
          ) : null}
        </View>
      </Card>

      {diagnosticsEnabled ? (
        <>
          <SectionTitle>Diagnóstico</SectionTitle>
          <Card variant="muted" testID="card-settings-diagnostics">
            <Text style={styles.helperText}>Registra eventos técnicos de foco, teclado e scroll.</Text>
            <Text style={styles.helperText}>Não inclui valores digitados.</Text>
            <View style={styles.updateActionsRow}>
              <SecondaryButton
                label="Exportar logs de diagnóstico"
                onPress={() => {
                  handleExportDiagnosticLogs().catch(() => undefined);
                }}
                style={styles.diagnosticActionButton}
                testID="btn-settings-diagnostics-export"
              />
              <SecondaryButton
                label="Limpar logs"
                onPress={handleClearDiagnosticLogs}
                style={styles.updateActionButton}
                testID="btn-settings-diagnostics-clear"
              />
            </View>
          </Card>
        </>
      ) : null}

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

      <TimePickerModal
        visible={isTimePickerVisible}
        value={reminderTimeLocal}
        onCancel={() => setIsTimePickerVisible(false)}
        onConfirm={(value) => {
          setReminderTimeLocal(value);
          setIsTimePickerVisible(false);
        }}
      />
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

const WeekButton = ({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Semana inicia em ${label}`}
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[styles.weekButton, active ? styles.weekButtonActive : null]}
    testID={testID}>
    <Text style={[styles.weekButtonText, active ? styles.weekButtonTextActive : null]}>{label}</Text>
  </Pressable>
);

const ReminderDayButton = ({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={({ pressed }) => [
      styles.reminderDayButton,
      active ? styles.reminderDayButtonActive : null,
      pressed ? styles.reminderDayButtonPressed : null,
    ]}
    testID={testID}>
    <Text style={[styles.reminderDayButtonText, active ? styles.reminderDayButtonTextActive : null]}>{label}</Text>
  </Pressable>
);

const PreferenceRow = ({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}) => (
  <View style={styles.preferenceRow}>
    <Text style={styles.preferenceLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.borderStrong, true: colors.primarySurface }}
      thumbColor={value ? colors.primary : colors.textTertiary}
      testID={testID}
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
    textAlign: 'center',
  },
  reminderTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reminderTimeLabel: {
    flex: 1,
    marginBottom: 0,
  },
  reminderTimeButton: {
    minWidth: 104,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  reminderTimeButtonPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  reminderTimeValue: {
    color: colors.text,
    fontFamily: typography.bodySemi,
    fontSize: 16,
    textAlign: 'center',
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reminderDaysRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reminderDayButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
  },
  reminderDayButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  reminderDayButtonPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  reminderDayButtonText: {
    fontFamily: typography.bodySemi,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  reminderDayButtonTextActive: {
    color: '#F8FBFF',
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
  updateTitle: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  updateCard: {
    alignItems: 'center',
    gap: spacing.md,
  },
  updateHelperText: {
    textAlign: 'center',
  },
  updateActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  updateActionButton: {
    minWidth: 190,
    maxWidth: 260,
    flexGrow: 1,
    alignSelf: 'center',
  },
  diagnosticActionButton: {
    minWidth: 210,
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
    backgroundColor: colors.primary,
  },
  weekButtonText: {
    textAlign: 'center',
    fontFamily: typography.bodySemi,
    color: colors.textMuted,
  },
  weekButtonTextActive: {
    color: '#F8FBFF',
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
