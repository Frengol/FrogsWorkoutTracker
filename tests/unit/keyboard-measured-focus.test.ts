import React, { useEffect, useRef } from 'react';
import { act, render } from '@testing-library/react-native';

import { calculateMeasuredScrollOffset, useMeasuredListFocus, useMeasuredScrollViewFocus } from '@/src/shared/utils/keyboard';
import { clearDiagnosticLogs, getDiagnosticEvents } from '@/src/shared/diagnostics/service';

describe('calculateMeasuredScrollOffset', () => {
  it('keeps the current offset when the focused field is fully visible', () => {
    expect(
      calculateMeasuredScrollOffset({
        currentOffset: 320,
        fieldTop: 260,
        fieldBottom: 316,
        visibleTop: 120,
        visibleBottom: 620,
        gap: 16,
      }),
    ).toBe(320);
  });

  it('scrolls down only by the delta needed when the focused field is under the keyboard', () => {
    expect(
      calculateMeasuredScrollOffset({
        currentOffset: 320,
        fieldTop: 630,
        fieldBottom: 690,
        visibleTop: 120,
        visibleBottom: 620,
        gap: 16,
      }),
    ).toBe(406);
  });

  it('scrolls up only by the delta needed when the focused field is above the visible area', () => {
    expect(
      calculateMeasuredScrollOffset({
        currentOffset: 520,
        fieldTop: 72,
        fieldBottom: 128,
        visibleTop: 120,
        visibleBottom: 620,
        gap: 16,
      }),
    ).toBe(456);
  });

  it('never returns a negative offset', () => {
    expect(
      calculateMeasuredScrollOffset({
        currentOffset: 20,
        fieldTop: 0,
        fieldBottom: 52,
        visibleTop: 120,
        visibleBottom: 620,
        gap: 16,
      }),
    ).toBe(0);
  });
});

describe('measured focus hooks', () => {
  type ListFocusApi = ReturnType<typeof useMeasuredListFocus>;
  type ScrollViewFocusApi = ReturnType<typeof useMeasuredScrollViewFocus>;
  const originalDiagnosticsFlag = process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;

  beforeEach(() => {
    clearDiagnosticLogs();
    delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalDiagnosticsFlag === undefined) {
      delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
      return;
    }

    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = originalDiagnosticsFlag;
  });

  const createMeasuredNode = ({ y, height }: { y: number; height: number }) => ({
    measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => {
      callback(0, y, 320, height);
    },
  });

  const ListHarness = ({
    keyboardHeight,
    onReady,
  }: {
    keyboardHeight: number;
    onReady: (api: ListFocusApi, scrollToOffset: jest.Mock) => void;
  }) => {
    const scrollToOffset = useRef(jest.fn());
    const listRef = useRef({ scrollToOffset: scrollToOffset.current });
    const api = useMeasuredListFocus({
      listRef,
      viewportHeight: 900,
      keyboardHeight,
      safeAreaBottom: 0,
      screenName: 'unit-list',
    });

    useEffect(() => {
      onReady(api, scrollToOffset.current);
    }, [api, onReady]);

    return null;
  };

  const ScrollViewHarness = ({
    keyboardHeight,
    onReady,
  }: {
    keyboardHeight: number;
    onReady: (api: ScrollViewFocusApi, scrollTo: jest.Mock) => void;
  }) => {
    const scrollTo = useRef(jest.fn());
    const scrollRef = useRef({ scrollTo: scrollTo.current });
    const api = useMeasuredScrollViewFocus({
      scrollRef,
      viewportHeight: 900,
      keyboardHeight,
      safeAreaBottom: 0,
      screenName: 'unit-scroll-view',
    });

    useEffect(() => {
      onReady(api, scrollTo.current);
    }, [api, onReady]);

    return null;
  };

  it('does not accumulate another list offset while a measured scroll target is pending', () => {
    jest.useFakeTimers();
    let api!: ListFocusApi;
    let scrollToOffset!: jest.Mock;
    const onReady = jest.fn((nextApi: ListFocusApi, nextScrollToOffset: jest.Mock) => {
      api = nextApi;
      scrollToOffset = nextScrollToOffset;
    });

    render(React.createElement(ListHarness, { keyboardHeight: 320, onReady }));

    api.handleListScrollOffset(1000);
    api.registerFocusable('field')(createMeasuredNode({ y: 620, height: 48 }));
    api.revealFocusable('field');
    expect(scrollToOffset).toHaveBeenCalledTimes(1);

    jest.runOnlyPendingTimers();

    expect(scrollToOffset).toHaveBeenCalledTimes(1);
  });

  it('accepts the confirmed list offset before allowing another measured scroll', () => {
    jest.useFakeTimers();
    let api!: ListFocusApi;
    let scrollToOffset!: jest.Mock;
    const onReady = jest.fn((nextApi: ListFocusApi, nextScrollToOffset: jest.Mock) => {
      api = nextApi;
      scrollToOffset = nextScrollToOffset;
    });

    render(React.createElement(ListHarness, { keyboardHeight: 320, onReady }));

    api.handleListScrollOffset(1000);
    api.registerFocusable('field')(createMeasuredNode({ y: 620, height: 48 }));
    api.revealFocusable('field');
    const firstTarget = scrollToOffset.mock.calls[0]?.[0]?.offset;

    api.handleListScrollOffset(firstTarget);
    jest.runOnlyPendingTimers();

    expect(scrollToOffset).toHaveBeenCalledTimes(2);
    expect(scrollToOffset.mock.calls[1]?.[0]?.offset).toBeGreaterThan(firstTarget);
  });

  it('cancels pending list reveals when the keyboard hides', () => {
    jest.useFakeTimers();
    let api!: ListFocusApi;
    let scrollToOffset!: jest.Mock;
    const onReady = jest.fn((nextApi: ListFocusApi, nextScrollToOffset: jest.Mock) => {
      api = nextApi;
      scrollToOffset = nextScrollToOffset;
    });
    const screen = render(React.createElement(ListHarness, { keyboardHeight: 320, onReady }));

    api.handleListScrollOffset(1000);
    api.registerFocusable('field')(createMeasuredNode({ y: 620, height: 48 }));
    api.revealFocusable('field');
    expect(scrollToOffset).toHaveBeenCalledTimes(1);

    scrollToOffset.mockClear();
    screen.update(React.createElement(ListHarness, { keyboardHeight: 0, onReady }));
    jest.runOnlyPendingTimers();

    expect(scrollToOffset).not.toHaveBeenCalled();
  });

  it('applies the same pending-scroll guard to ScrollView measured focus', () => {
    jest.useFakeTimers();
    let api!: ScrollViewFocusApi;
    let scrollTo!: jest.Mock;
    const onReady = jest.fn((nextApi: ScrollViewFocusApi, nextScrollTo: jest.Mock) => {
      api = nextApi;
      scrollTo = nextScrollTo;
    });

    render(React.createElement(ScrollViewHarness, { keyboardHeight: 320, onReady }));

    api.handleScrollViewScroll({ nativeEvent: { contentOffset: { y: 1000 } } } as never);
    api.registerFocusable('field')(createMeasuredNode({ y: 620, height: 48 }));
    api.revealFocusable('field');
    expect(scrollTo).toHaveBeenCalledTimes(1);

    jest.runOnlyPendingTimers();

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('suppresses recalculated targets for the same field until the pending offset is confirmed', () => {
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';
    let api!: ListFocusApi;
    let scrollToOffset!: jest.Mock;
    let fieldLayout = { y: 620, height: 48 };
    const measuredNode = {
      measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => {
        callback(0, fieldLayout.y, 320, fieldLayout.height);
      },
    };
    const onReady = jest.fn((nextApi: ListFocusApi, nextScrollToOffset: jest.Mock) => {
      api = nextApi;
      scrollToOffset = nextScrollToOffset;
    });

    render(React.createElement(ListHarness, { keyboardHeight: 320, onReady }));

    api.handleListScrollOffset(1000);
    api.registerFocusable('field')(measuredNode);
    api.revealFocusable('field');
    const firstTarget = scrollToOffset.mock.calls[0]?.[0]?.offset;

    api.handleListScrollOffset(firstTarget - 96);
    fieldLayout = { y: 584, height: 48 };
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(getDiagnosticEvents()).toContainEqual(
      expect.objectContaining({
        type: 'suppressed_pending_scroll',
        screen: 'unit-list',
        fieldId: 'field',
        pendingOffset: firstTarget,
      }),
    );
  });

  it('cancels stale zero-keyboard reveals when the keyboard opens', () => {
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';
    let api!: ListFocusApi;
    let scrollToOffset!: jest.Mock;
    const onReady = jest.fn((nextApi: ListFocusApi, nextScrollToOffset: jest.Mock) => {
      api = nextApi;
      scrollToOffset = nextScrollToOffset;
    });
    const screen = render(React.createElement(ListHarness, { keyboardHeight: 0, onReady }));

    api.handleListScrollOffset(1000);
    api.registerFocusable('field')(createMeasuredNode({ y: 620, height: 48 }));
    api.revealFocusable('field');
    expect(scrollToOffset).not.toHaveBeenCalled();

    act(() => {
      screen.update(React.createElement(ListHarness, { keyboardHeight: 320, onReady }));
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });

    const zeroKeyboardMeasures = getDiagnosticEvents().filter(
      (event) => event.type === 'measure' && event.fieldId === 'field' && event.keyboardHeight === 0,
    );
    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(zeroKeyboardMeasures).toHaveLength(1);
  });
});
