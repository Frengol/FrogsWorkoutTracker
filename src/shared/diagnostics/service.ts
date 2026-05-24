import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const DIAGNOSTIC_MAX_EVENTS = 500;

const DIAGNOSTIC_DIRECTORY_NAME = 'frog-diagnostics';
const DIAGNOSTIC_BUFFER_FILE_NAME = 'frog-diagnostics-buffer.json';
const DIAGNOSTIC_EXPORT_VERSION = 1;

type DiagnosticBase = {
  at: string;
  screen: string;
};

export type DiagnosticEvent =
  | (DiagnosticBase & {
      type: 'focus';
      fieldId: string;
      testID?: string;
    })
  | (DiagnosticBase & {
      type: 'keyboard';
      status: 'show' | 'hide';
      height: number;
      previousHeight: number;
    })
  | (DiagnosticBase & {
      type: 'scroll';
      offset: number;
    })
  | (DiagnosticBase & {
      type: 'measure';
      fieldId: string;
      fieldTop: number;
      fieldBottom: number;
      visibleTop: number;
      visibleBottom: number;
      keyboardHeight: number;
      safeAreaBottom: number;
      bottomOverlayHeight: number;
      currentOffset: number;
      targetOffset: number;
      didScroll: boolean;
      source: 'measureInWindow' | 'layoutFallback';
    })
  | (DiagnosticBase & {
      type: 'measure_error';
      fieldId: string;
      reason: string;
    })
  | (DiagnosticBase & {
      type: 'suppressed_pending_scroll';
      fieldId: string;
      currentOffset: number;
      targetOffset: number;
      pendingOffset: number;
    })
  | (DiagnosticBase & {
      type: 'numeric_input_touch_start';
      fieldId: string;
      testID?: string;
    })
  | (DiagnosticBase & {
      type: 'numeric_input_touch_move_threshold';
      fieldId: string;
      testID?: string;
      deltaY: number;
    })
  | (DiagnosticBase & {
      type: 'numeric_input_edit_cancelled_by_drag';
      fieldId: string;
      testID?: string;
    })
  | (DiagnosticBase & {
      type: 'action';
      action: string;
      detail?: Record<string, number | boolean | null>;
    });

export type DiagnosticEventInput =
  | (Omit<Extract<DiagnosticEvent, { type: 'focus' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'keyboard' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'scroll' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'measure' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'measure_error' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'suppressed_pending_scroll' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'numeric_input_touch_start' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'numeric_input_touch_move_threshold' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'numeric_input_edit_cancelled_by_drag' }>, 'at'> & Record<string, unknown>)
  | (Omit<Extract<DiagnosticEvent, { type: 'action' }>, 'at' | 'detail'> & {
      detail?: Record<string, unknown>;
    } & Record<string, unknown>);

let diagnosticEvents: DiagnosticEvent[] = [];

export const isDiagnosticsEnabled = () => process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS === '1';

const toText = (value: unknown, fallback = 'unknown') => (typeof value === 'string' && value.trim() ? value : fallback);

const toOptionalText = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

const toFiniteNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const getDiagnosticsDirectory = () => new Directory(Paths.document, DIAGNOSTIC_DIRECTORY_NAME);

const getWritableDiagnosticsDirectory = () => {
  const directory = getDiagnosticsDirectory();

  if (!directory.exists) {
    directory.create();
  }

  return directory;
};

const getDiagnosticsBufferFile = () => new File(getDiagnosticsDirectory(), DIAGNOSTIC_BUFFER_FILE_NAME);

const persistDiagnosticBuffer = () => {
  try {
    const file = new File(getWritableDiagnosticsDirectory(), DIAGNOSTIC_BUFFER_FILE_NAME);
    file.write(
      JSON.stringify(
        {
          version: DIAGNOSTIC_EXPORT_VERSION,
          updatedAt: new Date().toISOString(),
          events: diagnosticEvents,
        },
        null,
        2,
      ),
    );
  } catch {
    // Diagnostics must never affect the workout flow.
  }
};

const sanitizeActionDetail = (detail: unknown) => {
  if (!detail || typeof detail !== 'object') {
    return undefined;
  }

  const sanitizedDetail: Record<string, number | boolean | null> = {};

  Object.entries(detail as Record<string, unknown>).forEach(([key, value]) => {
    if (value === null) {
      sanitizedDetail[key] = null;
      return;
    }

    if (typeof value === 'number') {
      sanitizedDetail[key] = toFiniteNumber(value);
      return;
    }

    if (typeof value === 'boolean') {
      sanitizedDetail[key] = value;
    }
  });

  return Object.keys(sanitizedDetail).length > 0 ? sanitizedDetail : undefined;
};

const normalizeDiagnosticEvent = (event: DiagnosticEventInput): DiagnosticEvent | null => {
  const base = {
    at: new Date().toISOString(),
    screen: toText(event.screen),
  };

  switch (event.type) {
    case 'focus': {
      return {
        ...base,
        type: 'focus',
        fieldId: toText(event.fieldId),
        testID: toOptionalText(event.testID),
      };
    }
    case 'keyboard': {
      return {
        ...base,
        type: 'keyboard',
        status: event.status === 'hide' ? 'hide' : 'show',
        height: toFiniteNumber(event.height),
        previousHeight: toFiniteNumber(event.previousHeight),
      };
    }
    case 'scroll': {
      return {
        ...base,
        type: 'scroll',
        offset: toFiniteNumber(event.offset),
      };
    }
    case 'measure': {
      return {
        ...base,
        type: 'measure',
        fieldId: toText(event.fieldId),
        fieldTop: toFiniteNumber(event.fieldTop),
        fieldBottom: toFiniteNumber(event.fieldBottom),
        visibleTop: toFiniteNumber(event.visibleTop),
        visibleBottom: toFiniteNumber(event.visibleBottom),
        keyboardHeight: toFiniteNumber(event.keyboardHeight),
        safeAreaBottom: toFiniteNumber(event.safeAreaBottom),
        bottomOverlayHeight: toFiniteNumber(event.bottomOverlayHeight),
        currentOffset: toFiniteNumber(event.currentOffset),
        targetOffset: toFiniteNumber(event.targetOffset),
        didScroll: Boolean(event.didScroll),
        source: event.source === 'layoutFallback' ? 'layoutFallback' : 'measureInWindow',
      };
    }
    case 'measure_error': {
      return {
        ...base,
        type: 'measure_error',
        fieldId: toText(event.fieldId),
        reason: toText(event.reason),
      };
    }
    case 'suppressed_pending_scroll': {
      return {
        ...base,
        type: 'suppressed_pending_scroll',
        fieldId: toText(event.fieldId),
        currentOffset: toFiniteNumber(event.currentOffset),
        targetOffset: toFiniteNumber(event.targetOffset),
        pendingOffset: toFiniteNumber(event.pendingOffset),
      };
    }
    case 'numeric_input_touch_start': {
      return {
        ...base,
        type: 'numeric_input_touch_start',
        fieldId: toText(event.fieldId),
        testID: toOptionalText(event.testID),
      };
    }
    case 'numeric_input_touch_move_threshold': {
      return {
        ...base,
        type: 'numeric_input_touch_move_threshold',
        fieldId: toText(event.fieldId),
        testID: toOptionalText(event.testID),
        deltaY: toFiniteNumber(event.deltaY),
      };
    }
    case 'numeric_input_edit_cancelled_by_drag': {
      return {
        ...base,
        type: 'numeric_input_edit_cancelled_by_drag',
        fieldId: toText(event.fieldId),
        testID: toOptionalText(event.testID),
      };
    }
    case 'action': {
      const detail = sanitizeActionDetail(event.detail);

      return {
        ...base,
        type: 'action',
        action: toText(event.action),
        ...(detail ? { detail } : {}),
      };
    }
    default:
      return null;
  }
};

export const recordDiagnosticEvent = (event: DiagnosticEventInput) => {
  if (!isDiagnosticsEnabled()) {
    return;
  }

  const normalizedEvent = normalizeDiagnosticEvent(event);

  if (!normalizedEvent) {
    return;
  }

  diagnosticEvents = [...diagnosticEvents, normalizedEvent].slice(-DIAGNOSTIC_MAX_EVENTS);
  persistDiagnosticBuffer();
};

export const recordDiagnosticAction = (
  screen: string,
  action: string,
  detail?: Record<string, unknown>,
) => {
  recordDiagnosticEvent({
    type: 'action',
    screen,
    action,
    detail,
  });
};

export const getDiagnosticEvents = () => [...diagnosticEvents];

export const clearDiagnosticLogs = () => {
  diagnosticEvents = [];

  try {
    const directory = getDiagnosticsDirectory();

    if (directory.exists) {
      directory.delete();
    }
  } catch {
    try {
      const file = getDiagnosticsBufferFile();

      if (file.exists) {
        file.delete();
      }
    } catch {
      // Clearing diagnostics is best effort and must never block settings.
    }
  }
};

export const exportDiagnosticLogs = async () => {
  const directory = getWritableDiagnosticsDirectory();
  const exportedAt = new Date().toISOString();
  const fileName = `frog-diagnostics-${exportedAt.slice(0, 10)}-${exportedAt.slice(11, 19).replace(/:/g, '-')}.json`;
  const file = new File(directory, fileName);

  file.write(
    JSON.stringify(
      {
        version: DIAGNOSTIC_EXPORT_VERSION,
        exportedAt,
        diagnosticsEnabled: isDiagnosticsEnabled(),
        eventCount: diagnosticEvents.length,
        events: diagnosticEvents,
      },
      null,
      2,
    ),
  );

  if (!(await Sharing.isAvailableAsync())) {
    return file.uri;
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Exportar logs de diagnóstico',
    UTI: 'public.json',
  });

  return file.uri;
};
