import { getHistoryMenuPosition } from '@/src/modules/profile/history-menu-position';

describe('getHistoryMenuPosition', () => {
  const baseInput = {
    viewportWidth: 360,
    viewportHeight: 800,
    menuWidth: 136,
    menuHeight: 96,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  it('opens below the anchor when there is space', () => {
    expect(
      getHistoryMenuPosition({
        ...baseInput,
        anchorX: 300,
        anchorY: 180,
        anchorWidth: 34,
        anchorHeight: 34,
      }),
    ).toEqual({
      left: 198,
      top: 222,
    });
  });

  it('opens above the anchor when there is not enough space below', () => {
    expect(
      getHistoryMenuPosition({
        ...baseInput,
        anchorX: 300,
        anchorY: 740,
        anchorWidth: 34,
        anchorHeight: 34,
      }),
    ).toEqual({
      left: 198,
      top: 636,
    });
  });

  it('clamps the menu inside the screen bounds', () => {
    expect(
      getHistoryMenuPosition({
        ...baseInput,
        anchorX: 4,
        anchorY: 12,
        anchorWidth: 34,
        anchorHeight: 34,
        insets: { top: 24, right: 12, bottom: 0, left: 10 },
      }),
    ).toEqual({
      left: 26,
      top: 54,
    });
  });
});
