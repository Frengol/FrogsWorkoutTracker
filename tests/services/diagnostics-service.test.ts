import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  DIAGNOSTIC_MAX_EVENTS,
  clearDiagnosticLogs,
  exportDiagnosticLogs,
  getDiagnosticEvents,
  isDiagnosticsEnabled,
  recordDiagnosticAction,
  recordDiagnosticEvent,
} from '@/src/shared/diagnostics/service';

describe('diagnostics service', () => {
  const originalDiagnosticsFlag = process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;

  beforeEach(() => {
    clearDiagnosticLogs();
    delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
  });

  afterAll(() => {
    if (originalDiagnosticsFlag === undefined) {
      delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
      return;
    }

    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = originalDiagnosticsFlag;
  });

  it('stays disabled unless the diagnostics APK flag is active', () => {
    expect(isDiagnosticsEnabled()).toBe(false);

    recordDiagnosticEvent({
      type: 'focus',
      screen: 'settings',
      fieldId: 'input-settings-default-rest-seconds',
    });

    expect(getDiagnosticEvents()).toEqual([]);
  });

  it('stores technical focus, action and measurement events without sensitive values', async () => {
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';

    recordDiagnosticEvent({
      type: 'focus',
      screen: 'settings',
      fieldId: 'input-settings-default-rest-seconds',
      testID: 'input-settings-default-rest-seconds',
      value: 'secret-typed-value',
    } as never);
    recordDiagnosticAction('workout-live', 'complete-set', {
      seconds: 180,
      note: 'secret-note-value',
    } as never);
    recordDiagnosticEvent({
      type: 'measure',
      screen: 'workout-live',
      fieldId: 'set-kg-input',
      fieldTop: 660,
      fieldBottom: 708,
      visibleTop: 0,
      visibleBottom: 520,
      keyboardHeight: 300,
      safeAreaBottom: 24,
      bottomOverlayHeight: 0,
      currentOffset: 420,
      targetOffset: 624,
      didScroll: true,
      source: 'measureInWindow',
    });

    const events = getDiagnosticEvents();
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'focus',
        screen: 'settings',
        fieldId: 'input-settings-default-rest-seconds',
        testID: 'input-settings-default-rest-seconds',
      }),
    );
    expect(events[1]).toEqual(
      expect.objectContaining({
        type: 'action',
        screen: 'workout-live',
        action: 'complete-set',
        detail: { seconds: 180 },
      }),
    );

    const uri = await exportDiagnosticLogs();
    const content = await new File(uri).text();

    expect(content).toContain('"type": "measure"');
    expect(content).not.toContain('secret-typed-value');
    expect(content).not.toContain('secret-note-value');
  });

  it('stores focus-scroll suppression and numeric input touch diagnostics without typed values', () => {
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';

    recordDiagnosticEvent({
      type: 'suppressed_pending_scroll',
      screen: 'workout-live',
      fieldId: 'input-workout-live-weight-set-2',
      currentOffset: 512,
      targetOffset: 620,
      pendingOffset: 604,
      value: 'secret-typed-value',
    } as never);
    recordDiagnosticEvent({
      type: 'numeric_input_touch_start',
      screen: 'workout-live',
      fieldId: 'input-workout-live-weight-set-2',
      testID: 'input-workout-live-weight-set-2',
      value: 'secret-weight',
    } as never);
    recordDiagnosticEvent({
      type: 'numeric_input_touch_move_threshold',
      screen: 'workout-live',
      fieldId: 'input-workout-live-weight-set-2',
      testID: 'input-workout-live-weight-set-2',
      deltaY: 18,
      value: 'secret-weight',
    } as never);
    recordDiagnosticEvent({
      type: 'numeric_input_edit_cancelled_by_drag',
      screen: 'workout-live',
      fieldId: 'input-workout-live-weight-set-2',
      testID: 'input-workout-live-weight-set-2',
      value: 'secret-weight',
    } as never);

    expect(getDiagnosticEvents()).toEqual([
      expect.objectContaining({
        type: 'suppressed_pending_scroll',
        screen: 'workout-live',
        fieldId: 'input-workout-live-weight-set-2',
        currentOffset: 512,
        targetOffset: 620,
        pendingOffset: 604,
      }),
      expect.objectContaining({
        type: 'numeric_input_touch_start',
        screen: 'workout-live',
        fieldId: 'input-workout-live-weight-set-2',
        testID: 'input-workout-live-weight-set-2',
      }),
      expect.objectContaining({
        type: 'numeric_input_touch_move_threshold',
        screen: 'workout-live',
        fieldId: 'input-workout-live-weight-set-2',
        testID: 'input-workout-live-weight-set-2',
        deltaY: 18,
      }),
      expect.objectContaining({
        type: 'numeric_input_edit_cancelled_by_drag',
        screen: 'workout-live',
        fieldId: 'input-workout-live-weight-set-2',
        testID: 'input-workout-live-weight-set-2',
      }),
    ]);
    expect(JSON.stringify(getDiagnosticEvents())).not.toContain('secret');
  });

  it('keeps a circular in-memory buffer', () => {
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';

    Array.from({ length: DIAGNOSTIC_MAX_EVENTS + 3 }).forEach((_, index) => {
      recordDiagnosticEvent({
        type: 'scroll',
        screen: 'routine-editor',
        offset: index,
      });
    });

    const events = getDiagnosticEvents();
    expect(events).toHaveLength(DIAGNOSTIC_MAX_EVENTS);
    expect(events[0]).toEqual(expect.objectContaining({ type: 'scroll', offset: 3 }));
  });

  it('exports and clears logs through the Android sharing flow', async () => {
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';

    recordDiagnosticEvent({
      type: 'keyboard',
      screen: 'history-edit',
      status: 'show',
      height: 320,
      previousHeight: 0,
    });

    const uri = await exportDiagnosticLogs();
    const content = JSON.parse(await new File(uri).text()) as {
      version: number;
      diagnosticsEnabled: boolean;
      eventCount: number;
    };

    expect(content).toEqual(
      expect.objectContaining({
        version: 1,
        diagnosticsEnabled: true,
        eventCount: 1,
      }),
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({
        mimeType: 'application/json',
        dialogTitle: 'Exportar logs de diagnóstico',
      }),
    );

    clearDiagnosticLogs();

    expect(getDiagnosticEvents()).toEqual([]);
  });
});
