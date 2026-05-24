import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';

import { recordDiagnosticEvent } from '@/src/shared/diagnostics/service';

export const KEYBOARD_REVEAL_DELAY_MS = 250;
export const KEYBOARD_OPEN_REVEAL_DELAY_MS = 80;
export const KEYBOARD_SETTLED_REVEAL_DELAY_MS = 320;
export const KEYBOARD_SUGGESTION_GUARD_HEIGHT = 72;
export const KEYBOARD_FOCUSED_FIELD_GAP = 16;
const PENDING_SCROLL_SETTLE_DISTANCE = 4;

type ScrollToOffsetList = {
  scrollToOffset?: (params: { animated?: boolean; offset: number }) => void;
};

type ScrollToOffsetView = {
  scrollTo?: (params: { animated?: boolean; y: number }) => void;
};

type MeasuredScrollOptions = {
  viewportHeight: number;
  keyboardHeight: number;
  safeAreaBottom: number;
  bottomOverlayHeight?: number;
  topGuard?: number;
  gap?: number;
  screenName?: string;
};

type MeasurableNode = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

type StoredLayout = {
  y: number;
  height: number;
};

type PendingScrollTarget = {
  fieldId: string;
  offset: number;
  startOffset: number;
  revalidateOnSettle: boolean;
};

const hasPendingScrollSettled = (pendingTarget: PendingScrollTarget, offset: number) => {
  if (Math.abs(offset - pendingTarget.offset) <= PENDING_SCROLL_SETTLE_DISTANCE) {
    return true;
  }

  if (pendingTarget.offset >= pendingTarget.startOffset) {
    return offset >= pendingTarget.offset - PENDING_SCROLL_SETTLE_DISTANCE;
  }

  return offset <= pendingTarget.offset + PENDING_SCROLL_SETTLE_DISTANCE;
};

export const calculateMeasuredScrollOffset = ({
  currentOffset,
  fieldTop,
  fieldBottom,
  visibleTop,
  visibleBottom,
  gap = KEYBOARD_FOCUSED_FIELD_GAP,
}: {
  currentOffset: number;
  fieldTop: number;
  fieldBottom: number;
  visibleTop: number;
  visibleBottom: number;
  gap?: number;
}) => {
  const guardedTop = visibleTop + gap;
  const guardedBottom = visibleBottom - gap;

  if (fieldBottom > guardedBottom) {
    return Math.max(0, currentOffset + fieldBottom - guardedBottom);
  }

  if (fieldTop < guardedTop) {
    return Math.max(0, currentOffset - (guardedTop - fieldTop));
  }

  return Math.max(0, currentOffset);
};

export const useKeyboardHeight = (enabled: boolean) => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setKeyboardHeight(0);
      return undefined;
    }

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      setKeyboardHeight(0);
    };
  }, [enabled]);

  return keyboardHeight;
};

export const useKeyboardRevealScheduler = (delayMs = KEYBOARD_REVEAL_DELAY_MS) => {
  const revealTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancelKeyboardReveal = useCallback(() => {
    revealTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    revealTimeoutsRef.current = [];
  }, []);

  const scheduleKeyboardReveal = useCallback(
    (reveal: () => void, options: { keyboardVisible?: boolean; repeatOnKeyboardSettled?: boolean } = {}) => {
      cancelKeyboardReveal();

      const firstDelay = options.keyboardVisible ? KEYBOARD_OPEN_REVEAL_DELAY_MS : delayMs;
      const revealAt = (timeoutDelay: number) => {
        const timeout = setTimeout(() => {
          revealTimeoutsRef.current = revealTimeoutsRef.current.filter((entry) => entry !== timeout);
          reveal();
        }, timeoutDelay);

        revealTimeoutsRef.current.push(timeout);
      };

      revealAt(firstDelay);

      if (options.repeatOnKeyboardSettled) {
        revealAt(firstDelay + KEYBOARD_SETTLED_REVEAL_DELAY_MS);
      }
    },
    [cancelKeyboardReveal, delayMs],
  );

  useEffect(() => cancelKeyboardReveal, [cancelKeyboardReveal]);

  return {
    cancelKeyboardReveal,
    scheduleKeyboardReveal,
  };
};

const useMeasuredScrollableFocus = ({
  scrollToMeasuredOffset,
  viewportHeight,
  keyboardHeight,
  safeAreaBottom,
  bottomOverlayHeight = 0,
  topGuard = 0,
  gap = KEYBOARD_FOCUSED_FIELD_GAP,
  screenName = 'unknown',
}: MeasuredScrollOptions & {
  scrollToMeasuredOffset: (offset: number) => void;
}) => {
  const scrollOffsetRef = useRef(0);
  const focusableNodesRef = useRef(new Map<string, MeasurableNode>());
  const focusableLayoutsRef = useRef(new Map<string, StoredLayout>());
  const lastFocusedIdRef = useRef<string | null>(null);
  const pendingScrollTargetRef = useRef<PendingScrollTarget | null>(null);
  const revealTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previousKeyboardHeightRef = useRef(keyboardHeight);
  const latestKeyboardHeightRef = useRef(keyboardHeight);
  const scheduleMeasuredRevealRef = useRef<(fieldId: string, delayMs?: number) => void>(() => undefined);

  const bottomInset = safeAreaBottom + Math.max(
    bottomOverlayHeight,
    keyboardHeight > 0 ? keyboardHeight + KEYBOARD_SUGGESTION_GUARD_HEIGHT : 0,
  );
  const visibleBottom = Math.max(topGuard + gap * 2, viewportHeight - bottomInset);

  const clearPendingMeasuredReveals = useCallback(() => {
    revealTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    revealTimeoutsRef.current = [];
  }, []);

  const clearFocusedMeasuredReveal = useCallback(() => {
    lastFocusedIdRef.current = null;
    pendingScrollTargetRef.current = null;
    clearPendingMeasuredReveals();
  }, [clearPendingMeasuredReveals]);

  useEffect(() => {
    latestKeyboardHeightRef.current = keyboardHeight;
  }, [keyboardHeight]);

  const updateMeasuredScrollOffset = useCallback(
    (offset: number) => {
      scrollOffsetRef.current = offset;

      const pendingTarget = pendingScrollTargetRef.current;
      if (pendingTarget && hasPendingScrollSettled(pendingTarget, offset)) {
        pendingScrollTargetRef.current = null;

        if (
          pendingTarget.revalidateOnSettle &&
          lastFocusedIdRef.current === pendingTarget.fieldId &&
          latestKeyboardHeightRef.current > 0
        ) {
          clearPendingMeasuredReveals();
          scheduleMeasuredRevealRef.current(pendingTarget.fieldId, KEYBOARD_OPEN_REVEAL_DELAY_MS);
        }
      }

      recordDiagnosticEvent({
        type: 'scroll',
        screen: screenName,
        offset,
      });
    },
    [clearPendingMeasuredReveals, screenName],
  );

  const scrollMeasuredLayout = useCallback(
    (fieldId: string, layout: StoredLayout, source: 'measureInWindow' | 'layoutFallback') => {
      const currentOffset = scrollOffsetRef.current;
      const targetOffset = calculateMeasuredScrollOffset({
        currentOffset,
        fieldTop: layout.y,
        fieldBottom: layout.y + layout.height,
        visibleTop: topGuard,
        visibleBottom,
        gap,
      });
      const pendingTarget = pendingScrollTargetRef.current;
      const isWaitingForSameField = Boolean(
        pendingTarget &&
          pendingTarget.fieldId === fieldId &&
          !hasPendingScrollSettled(pendingTarget, currentOffset),
      );
      const didScroll = targetOffset !== currentOffset && !isWaitingForSameField;

      recordDiagnosticEvent({
        type: 'measure',
        screen: screenName,
        fieldId,
        fieldTop: layout.y,
        fieldBottom: layout.y + layout.height,
        visibleTop: topGuard,
        visibleBottom,
        keyboardHeight,
        safeAreaBottom,
        bottomOverlayHeight,
        currentOffset,
        targetOffset,
        didScroll,
        source,
      });

      if (isWaitingForSameField && targetOffset !== currentOffset && pendingTarget) {
        recordDiagnosticEvent({
          type: 'suppressed_pending_scroll',
          screen: screenName,
          fieldId,
          currentOffset,
          targetOffset,
          pendingOffset: pendingTarget.offset,
        });
      }

      if (didScroll) {
        pendingScrollTargetRef.current = {
          fieldId,
          offset: targetOffset,
          startOffset: currentOffset,
          revalidateOnSettle: true,
        };
        scrollToMeasuredOffset(targetOffset);
      }
    },
    [bottomOverlayHeight, gap, keyboardHeight, safeAreaBottom, screenName, scrollToMeasuredOffset, topGuard, visibleBottom],
  );

  const measureAndReveal = useCallback(
    (fieldId: string) => {
      const node = focusableNodesRef.current.get(fieldId);
      if (node?.measureInWindow) {
        let didMeasure = false;
        node.measureInWindow((_x, y, _width, height) => {
          didMeasure = true;
          scrollMeasuredLayout(fieldId, { y, height }, 'measureInWindow');
        });

        if (didMeasure || process.env.NODE_ENV !== 'test') {
          return;
        }

        recordDiagnosticEvent({
          type: 'measure_error',
          screen: screenName,
          fieldId,
          reason: 'measureInWindow_no_callback',
        });
      }

      const fallbackLayout = focusableLayoutsRef.current.get(fieldId);
      if (fallbackLayout) {
        scrollMeasuredLayout(fieldId, fallbackLayout, 'layoutFallback');
        return;
      }

      recordDiagnosticEvent({
        type: 'measure_error',
        screen: screenName,
        fieldId,
        reason: 'missing_measurement',
      });
    },
    [screenName, scrollMeasuredLayout],
  );

  const scheduleMeasuredReveal = useCallback(
    (fieldId: string, delayMs = 0) => {
      const timeout = setTimeout(() => {
        revealTimeoutsRef.current = revealTimeoutsRef.current.filter((entry) => entry !== timeout);
        measureAndReveal(fieldId);
      }, delayMs);
      revealTimeoutsRef.current.push(timeout);
    },
    [measureAndReveal],
  );

  useEffect(() => {
    scheduleMeasuredRevealRef.current = scheduleMeasuredReveal;
  }, [scheduleMeasuredReveal]);

  const revealFocusable = useCallback(
    (fieldId: string) => {
      clearPendingMeasuredReveals();
      if (pendingScrollTargetRef.current?.fieldId !== fieldId) {
        pendingScrollTargetRef.current = null;
      }
      lastFocusedIdRef.current = fieldId;
      recordDiagnosticEvent({
        type: 'focus',
        screen: screenName,
        fieldId,
      });
      measureAndReveal(fieldId);
      scheduleMeasuredReveal(fieldId, keyboardHeight > 0 ? KEYBOARD_OPEN_REVEAL_DELAY_MS : KEYBOARD_REVEAL_DELAY_MS);
    },
    [clearPendingMeasuredReveals, keyboardHeight, measureAndReveal, scheduleMeasuredReveal, screenName],
  );

  const registerFocusable = useCallback(
    (fieldId: string) => (node: MeasurableNode | null) => {
      if (node) {
        focusableNodesRef.current.set(fieldId, node);
        return;
      }

      focusableNodesRef.current.delete(fieldId);
      focusableLayoutsRef.current.delete(fieldId);
    },
    [],
  );

  const registerFocusableLayout = useCallback(
    (fieldId: string) => (event: LayoutChangeEvent) => {
      focusableLayoutsRef.current.set(fieldId, {
        y: event.nativeEvent.layout.y,
        height: event.nativeEvent.layout.height,
      });
    },
    [],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset?.y ?? 0;

    updateMeasuredScrollOffset(offset);
  }, [updateMeasuredScrollOffset]);

  useEffect(() => {
    const lastFocusedId = lastFocusedIdRef.current;
    if (!lastFocusedId || latestKeyboardHeightRef.current <= 0) {
      return undefined;
    }

    scheduleMeasuredReveal(lastFocusedId, KEYBOARD_REVEAL_DELAY_MS);

    return undefined;
  }, [bottomOverlayHeight, scheduleMeasuredReveal, viewportHeight]);

  useEffect(() => {
    const previousHeight = previousKeyboardHeightRef.current;

    if (previousHeight === keyboardHeight) {
      return;
    }

    recordDiagnosticEvent({
      type: 'keyboard',
      screen: screenName,
      status: keyboardHeight > 0 ? 'show' : 'hide',
      height: keyboardHeight,
        previousHeight,
    });

    clearPendingMeasuredReveals();

    if (keyboardHeight <= 0 && previousHeight > 0) {
      pendingScrollTargetRef.current = null;
      previousKeyboardHeightRef.current = keyboardHeight;
      return;
    }

    if (keyboardHeight > previousHeight && lastFocusedIdRef.current) {
      scheduleMeasuredReveal(lastFocusedIdRef.current, KEYBOARD_OPEN_REVEAL_DELAY_MS);
    }

    previousKeyboardHeightRef.current = keyboardHeight;
  }, [clearPendingMeasuredReveals, keyboardHeight, scheduleMeasuredReveal, screenName]);

  useEffect(() => clearPendingMeasuredReveals, [clearPendingMeasuredReveals]);

  return {
    cancelMeasuredFocusReveal: clearFocusedMeasuredReveal,
    handleScroll,
    handleScrollOffset: updateMeasuredScrollOffset,
    registerFocusable,
    registerFocusableLayout,
    revealFocusable,
  };
};

export const useMeasuredListFocus = ({
  listRef,
  ...options
}: MeasuredScrollOptions & {
  listRef: RefObject<ScrollToOffsetList | null>;
}) => {
  const scrollToMeasuredOffset = useCallback(
    (offset: number) => {
      listRef.current?.scrollToOffset?.({ animated: true, offset });
    },
    [listRef],
  );
  const measuredFocus = useMeasuredScrollableFocus({
    ...options,
    scrollToMeasuredOffset,
  });

  return {
    ...measuredFocus,
    handleListScroll: measuredFocus.handleScroll,
    handleListScrollOffset: measuredFocus.handleScrollOffset,
  };
};

export const useMeasuredScrollViewFocus = ({
  scrollRef,
  ...options
}: MeasuredScrollOptions & {
  scrollRef: RefObject<ScrollToOffsetView | null>;
}) => {
  const scrollToMeasuredOffset = useCallback(
    (offset: number) => {
      scrollRef.current?.scrollTo?.({ animated: true, y: offset });
    },
    [scrollRef],
  );
  const measuredFocus = useMeasuredScrollableFocus({
    ...options,
    scrollToMeasuredOffset,
  });

  return {
    ...measuredFocus,
    handleScrollViewScroll: measuredFocus.handleScroll,
  };
};

export const getKeyboardAwareBottomSheetStyles = ({
  keyboardHeight,
  viewportHeight,
  safeAreaBottom,
  topMargin = 64,
  bottomMargin = 16,
  minimumHeight = 240,
}: {
  keyboardHeight: number;
  viewportHeight: number;
  safeAreaBottom: number;
  topMargin?: number;
  bottomMargin?: number;
  minimumHeight?: number;
}): { backdropStyle: ViewStyle | null; cardStyle: ViewStyle | null } => {
  if (keyboardHeight <= 0) {
    return {
      backdropStyle: null,
      cardStyle: null,
    };
  }

  const visibleHeight = Math.max(
    minimumHeight,
    viewportHeight - keyboardHeight - safeAreaBottom - topMargin - bottomMargin,
  );

  return {
    backdropStyle: { paddingBottom: keyboardHeight },
    cardStyle: { maxHeight: visibleHeight },
  };
};
