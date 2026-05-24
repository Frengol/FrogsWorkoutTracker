import { createContext, PropsWithChildren, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadows, spacing, typography } from './tokens';

type AppDialogActionTone = 'neutral' | 'primary' | 'danger';
type AppDialogCancelPosition = 'first' | 'last';
type AppDialogCancelTone = 'neutral' | 'danger';

export type AppDialogAction = {
  label: string;
  value: string;
  tone?: AppDialogActionTone;
  testID?: string;
};

type AppDialogBaseOptions = {
  title: string;
  message?: string;
};

export type AppDialogConfirmOptions = AppDialogBaseOptions & {
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

export type AppDialogAlertOptions = AppDialogBaseOptions & {
  confirmLabel?: string;
};

export type AppDialogChooseOptions = AppDialogBaseOptions & {
  cancelLabel?: string | null;
  cancelPosition?: AppDialogCancelPosition;
  cancelTone?: AppDialogCancelTone;
  actions: AppDialogAction[];
};

type AppDialogState = AppDialogBaseOptions & {
  cancelLabel?: string;
  cancelPosition: AppDialogCancelPosition;
  cancelTone: AppDialogCancelTone;
  actions: AppDialogAction[];
};

type AppDialogContextValue = {
  alert: (options: AppDialogAlertOptions) => Promise<void>;
  confirm: (options: AppDialogConfirmOptions) => Promise<boolean>;
  choose: (options: AppDialogChooseOptions) => Promise<string | null>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

const noopDialog: AppDialogContextValue = {
  alert: () => Promise.resolve(),
  confirm: () => Promise.resolve(false),
  choose: () => Promise.resolve(null),
};

export const AppDialogProvider = ({ children }: PropsWithChildren) => {
  const [dialog, setDialog] = useState<AppDialogState | null>(null);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const closeWithValue = useCallback((value: string | null) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(value);
  }, []);

  const choose = useCallback((options: AppDialogChooseOptions) => {
    if (resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }

    setDialog({
      title: options.title,
      message: options.message,
      cancelLabel: options.cancelLabel === undefined ? 'Cancelar' : options.cancelLabel ?? undefined,
      cancelPosition: options.cancelPosition ?? 'first',
      cancelTone: options.cancelTone ?? 'neutral',
      actions: options.actions,
    });

    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirm = useCallback(
    async (options: AppDialogConfirmOptions) => {
      const value = await choose({
        title: options.title,
        message: options.message,
        cancelLabel: options.cancelLabel ?? 'Cancelar',
        actions: [
          {
            label: options.confirmLabel ?? 'OK',
            value: 'confirm',
            tone: options.tone === 'danger' ? 'danger' : 'primary',
            testID: 'btn-app-dialog-confirm',
          },
        ],
      });

      return value === 'confirm';
    },
    [choose],
  );

  const alert = useCallback(
    async (options: AppDialogAlertOptions) => {
      await choose({
        title: options.title,
        message: options.message,
        cancelLabel: null,
        actions: [
          {
            label: options.confirmLabel ?? 'OK',
            value: 'ok',
            tone: 'primary',
            testID: 'btn-app-dialog-ok',
          },
        ],
      });
    },
    [choose],
  );

  const value: AppDialogContextValue = {
    alert,
    confirm,
    choose,
  };

  const renderCancelAction = (currentDialog: AppDialogState) =>
    currentDialog.cancelLabel ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={currentDialog.cancelLabel}
        onPress={() => closeWithValue(null)}
        style={({ pressed }) => [
          styles.actionButton,
          currentDialog.actions.length > 1 ? styles.actionButtonStacked : styles.actionButtonInline,
          currentDialog.cancelTone === 'danger' ? styles.actionDanger : styles.actionNeutral,
          pressed ? styles.actionPressed : null,
        ]}
        testID="btn-app-dialog-cancel">
        <Text
          style={[
            styles.actionNeutralText,
            currentDialog.cancelTone === 'danger' ? styles.actionDangerText : null,
          ]}>
          {currentDialog.cancelLabel}
        </Text>
      </Pressable>
    ) : null;

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => closeWithValue(null)}
        transparent
        visible={dialog != null}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar diálogo"
          onPress={() => closeWithValue(null)}
          style={styles.backdrop}
          testID="modal-app-dialog-backdrop">
          {dialog ? (
            <Pressable onPress={() => undefined} style={styles.card} testID="modal-app-dialog">
              <Text style={styles.title}>{dialog.title}</Text>
              {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}

              <View
                style={[styles.actions, dialog.actions.length > 1 ? styles.actionsStacked : null]}
                testID="modal-app-dialog-actions">
                {dialog.cancelPosition === 'first' ? renderCancelAction(dialog) : null}
                {dialog.actions.map((action) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    key={action.value}
                    onPress={() => closeWithValue(action.value)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      dialog.actions.length > 1 ? styles.actionButtonStacked : styles.actionButtonInline,
                      action.tone === 'danger' ? styles.actionDanger : action.tone === 'primary' ? styles.actionPrimary : styles.actionNeutral,
                      pressed ? styles.actionPressed : null,
                    ]}
                    testID={action.testID ?? `btn-app-dialog-action-${action.value}`}>
                    <Text
                      style={[
                        styles.actionText,
                        action.tone === 'danger' ? styles.actionDangerText : null,
                        action.tone === 'primary' ? styles.actionPrimaryText : null,
                      ]}>
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
                {dialog.cancelPosition === 'last' ? renderCancelAction(dialog) : null}
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </AppDialogContext.Provider>
  );
};

export const useAppDialog = () => useContext(AppDialogContext) ?? noopDialog;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  title: {
    color: colors.text,
    fontFamily: typography.heading,
    fontSize: 20,
    lineHeight: 27,
  },
  message: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  actionButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionButtonInline: {
    flex: 1,
  },
  actionButtonStacked: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  actionNeutral: {
    backgroundColor: colors.input,
    borderColor: colors.border,
  },
  actionPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionDanger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  actionPressed: {
    opacity: 0.86,
  },
  actionText: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 15,
    textAlign: 'center',
  },
  actionNeutralText: {
    color: colors.text,
    fontFamily: typography.bodySemi,
    fontSize: 15,
    textAlign: 'center',
  },
  actionPrimaryText: {
    color: '#F8FBFF',
  },
  actionDangerText: {
    color: '#FFFFFF',
  },
});
