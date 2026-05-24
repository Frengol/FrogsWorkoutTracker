import { forwardRef, useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { recordDiagnosticEvent } from '@/src/shared/diagnostics/service';

const NUMERIC_INPUT_SCROLL_THRESHOLD = 12;

type SeriesNumberInputProps = TextInputProps & {
  diagnosticScreen: string;
  diagnosticFieldId?: string;
};

const assignInputRef = (
  ref: ((instance: TextInput | null) => void) | MutableRefObject<TextInput | null> | null | undefined,
  node: TextInput | null,
) => {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(node);
    return;
  }

  ref.current = node;
};

export const SeriesNumberInput = forwardRef<TextInput, SeriesNumberInputProps>(
  (
    {
      defaultValue,
      diagnosticFieldId,
      diagnosticScreen,
      onBlur,
      onChangeText,
      onEndEditing,
      onTouchMove,
      onTouchStart,
      placeholder = '-',
      placeholderTextColor,
      style,
      testID,
      value,
      ...props
    },
    ref,
  ) => {
    const [isEditing, setIsEditing] = useState(false);
    const [uncontrolledText, setUncontrolledText] = useState(defaultValue ?? '');
    const inputRef = useRef<TextInput | null>(null);
    const previousDefaultValueRef = useRef(defaultValue);
    const touchStartYRef = useRef<number | null>(null);
    const didRecordMoveThresholdRef = useRef(false);
    const fieldId = diagnosticFieldId ?? testID ?? 'series-number-input';
    const isControlled = value != null;
    const currentText = isControlled ? value ?? '' : uncontrolledText;
    const hasText = currentText.trim().length > 0;
    const displayText = hasText ? currentText : placeholder;
    const flattenedStyle = StyleSheet.flatten(style) as (TextStyle & ViewStyle) | undefined;
    const displayTextStyle: StyleProp<TextStyle> = {
      color: hasText ? flattenedStyle?.color : placeholderTextColor ?? flattenedStyle?.color,
      fontFamily: flattenedStyle?.fontFamily,
      fontSize: flattenedStyle?.fontSize,
      fontStyle: flattenedStyle?.fontStyle,
      fontWeight: flattenedStyle?.fontWeight,
      letterSpacing: flattenedStyle?.letterSpacing,
      lineHeight: flattenedStyle?.lineHeight,
      textAlign: flattenedStyle?.textAlign ?? 'center',
    };
    const editorTextStyle: StyleProp<TextStyle> = {
      color: flattenedStyle?.color,
      fontFamily: flattenedStyle?.fontFamily,
      fontSize: flattenedStyle?.fontSize,
      fontStyle: flattenedStyle?.fontStyle,
      fontWeight: flattenedStyle?.fontWeight,
      letterSpacing: flattenedStyle?.letterSpacing,
      lineHeight: flattenedStyle?.lineHeight,
      textAlign: flattenedStyle?.textAlign ?? 'center',
    };

    useEffect(() => {
      if (isControlled || isEditing) {
        return;
      }

      if (previousDefaultValueRef.current === defaultValue) {
        return;
      }

      previousDefaultValueRef.current = defaultValue;
      setUncontrolledText(defaultValue ?? '');
    }, [defaultValue, isControlled, isEditing]);

    useEffect(() => {
      if (!isEditing) {
        return undefined;
      }

      const timeout = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);

      return () => clearTimeout(timeout);
    }, [isEditing]);

    const recordTouchStart = (event: GestureResponderEvent) => {
      touchStartYRef.current = event.nativeEvent.pageY;
      didRecordMoveThresholdRef.current = false;
      recordDiagnosticEvent({
        type: 'numeric_input_touch_start',
        screen: diagnosticScreen,
        fieldId,
        testID,
      });
      onTouchStart?.(event);
    };

    const finishEditingAfterDrag = () => {
      if (!isEditing) {
        return;
      }

      inputRef.current?.blur();
      setIsEditing(false);
      recordDiagnosticEvent({
        type: 'numeric_input_edit_cancelled_by_drag',
        screen: diagnosticScreen,
        fieldId,
        testID,
      });
    };

    const recordTouchMove = (event: GestureResponderEvent) => {
      const touchStartY = touchStartYRef.current;
      if (touchStartY != null && !didRecordMoveThresholdRef.current) {
        const deltaY = event.nativeEvent.pageY - touchStartY;
        if (Math.abs(deltaY) >= NUMERIC_INPUT_SCROLL_THRESHOLD) {
          didRecordMoveThresholdRef.current = true;
          recordDiagnosticEvent({
            type: 'numeric_input_touch_move_threshold',
            screen: diagnosticScreen,
            fieldId,
            testID,
            deltaY,
          });
          finishEditingAfterDrag();
        }
      }

      onTouchMove?.(event);
    };

    const setInputRef = useCallback(
      (node: TextInput | null) => {
        inputRef.current = node;
        assignInputRef(ref, node);
      },
      [ref],
    );

    const activateEditing = () => {
      if (didRecordMoveThresholdRef.current) {
        return;
      }

      setIsEditing(true);
    };

    const handleChangeText = (nextText: string) => {
      if (!isControlled) {
        setUncontrolledText(nextText);
      }

      onChangeText?.(nextText);
    };

    const handleEndEditing: NonNullable<TextInputProps['onEndEditing']> = (event) => {
      if (!isControlled) {
        setUncontrolledText(event.nativeEvent.text);
      }

      onEndEditing?.(event);
      setIsEditing(false);
    };

    const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
      onBlur?.(event);
      setIsEditing(false);
    };

    return (
      <Pressable
        accessibilityLabel={props.accessibilityLabel}
        onLayout={props.onLayout}
        onMoveShouldSetResponderCapture={() => false}
        onPress={isEditing ? undefined : activateEditing}
        onResponderTerminationRequest={() => true}
        onStartShouldSetResponderCapture={() => false}
        onTouchMove={recordTouchMove}
        onTouchStart={recordTouchStart}
        style={[style as StyleProp<ViewStyle>, styles.displaySurface]}
        testID={testID}>
        {isEditing ? (
          <TextInput
            {...props}
            defaultValue={isControlled ? undefined : uncontrolledText}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor}
            ref={setInputRef}
            rejectResponderTermination={false}
            scrollEnabled={false}
            style={[styles.editorInput, editorTextStyle]}
            testID={testID ? `${testID}-editor` : undefined}
            value={isControlled ? value : undefined}
            onBlur={handleBlur}
            onChangeText={handleChangeText}
            onEndEditing={handleEndEditing}
            onMoveShouldSetResponderCapture={() => false}
            onResponderTerminationRequest={() => true}
            onStartShouldSetResponderCapture={() => false}
            onTouchMove={recordTouchMove}
            onTouchStart={recordTouchStart}
          />
        ) : (
          <View
            pointerEvents="none"
            style={styles.displayLayer}
            testID={testID ? `${testID}-display-layer` : undefined}>
            <Text
              numberOfLines={1}
              style={[styles.displayText, displayTextStyle]}
              testID={testID ? `${testID}-display-value` : undefined}>
              {displayText}
            </Text>
          </View>
        )}
      </Pressable>
    );
  },
);

SeriesNumberInput.displayName = 'SeriesNumberInput';

const styles = StyleSheet.create({
  displaySurface: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  displayLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayText: {
    includeFontPadding: false,
    maxWidth: '100%',
  },
  editorInput: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderWidth: 0,
    includeFontPadding: false,
    margin: 0,
    padding: 0,
    textAlignVertical: 'center',
  },
});
