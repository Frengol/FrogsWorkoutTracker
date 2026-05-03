type FloatingMenuInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type FloatingMenuAnchor = {
  anchorX: number;
  anchorY: number;
  anchorWidth: number;
  anchorHeight: number;
};

type FloatingMenuPositionInput = FloatingMenuAnchor & {
  viewportWidth: number;
  viewportHeight: number;
  menuWidth: number;
  menuHeight: number;
  insets: FloatingMenuInsets;
  gap?: number;
  screenMargin?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const getFloatingMenuPosition = ({
  anchorX,
  anchorY,
  anchorWidth,
  anchorHeight,
  viewportWidth,
  viewportHeight,
  menuWidth,
  menuHeight,
  insets,
  gap = 8,
  screenMargin = 16,
}: FloatingMenuPositionInput) => {
  const minLeft = Math.max(screenMargin, insets.left + screenMargin);
  const maxLeft = Math.max(
    minLeft,
    viewportWidth - menuWidth - Math.max(screenMargin, insets.right + screenMargin),
  );
  const preferredLeft = anchorX + anchorWidth - menuWidth;
  const left = clamp(preferredLeft, minLeft, maxLeft);

  const minTop = Math.max(screenMargin, insets.top + screenMargin);
  const maxTop = Math.max(
    minTop,
    viewportHeight - menuHeight - Math.max(screenMargin, insets.bottom + screenMargin),
  );
  const preferredBelowTop = anchorY + anchorHeight + gap;
  const preferredAboveTop = anchorY - menuHeight - gap;
  const top =
    preferredBelowTop <= maxTop
      ? preferredBelowTop
      : clamp(preferredAboveTop, minTop, maxTop);

  return { left, top };
};
