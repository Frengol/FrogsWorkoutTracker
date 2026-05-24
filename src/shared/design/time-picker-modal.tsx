import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, shadows, spacing, typography } from './tokens';

type TimePickerModalProps = {
  visible: boolean;
  value: string;
  title?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
  testID?: string;
};

type WheelOption = {
  label: string;
  value: number;
};

const wheelItemHeight = 48;
const padTime = (value: number) => String(value).padStart(2, '0');
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const parseTime = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return { hour: 19, minute: 0 };
  }

  return {
    hour: clamp(Number(match[1]), 0, 23),
    minute: clamp(Number(match[2]), 0, 59),
  };
};

const createOptions = (length: number) =>
  Array.from({ length }, (_, value) => ({
    label: padTime(value),
    value,
  }));

type WheelColumnProps = {
  label: string;
  options: WheelOption[];
  selectedValue: number;
  onSelect: (value: number) => void;
  testID: string;
};

const WheelColumn = ({ label, options, selectedValue, onSelect, testID }: WheelColumnProps) => {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue),
  );

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = clamp(Math.round(event.nativeEvent.contentOffset.y / wheelItemHeight), 0, options.length - 1);
    onSelect(options[nextIndex].value);
  };

  return (
    <View style={styles.wheelColumn}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <ScrollView
        contentOffset={{ x: 0, y: selectedIndex * wheelItemHeight }}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollEnd={handleScroll}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={wheelItemHeight}
        style={styles.wheel}
        testID={`${testID}-wheel`}>
        <View style={styles.wheelSpacer} />
        {options.map((option) => {
          const isSelected = option.value === selectedValue;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label} ${option.label}`}
              key={`${label}-${option.value}`}
              onPress={() => onSelect(option.value)}
              style={[styles.wheelItem, isSelected ? styles.wheelItemSelected : null]}
              testID={`${testID}-option-${option.value}${isSelected ? '-selected' : ''}`}>
              <Text style={[styles.wheelItemText, isSelected ? styles.wheelItemTextSelected : styles.wheelItemTextMuted]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        <View style={styles.wheelSpacer} />
      </ScrollView>
    </View>
  );
};

export const TimePickerModal = ({
  visible,
  value,
  title = 'Selecionar horário',
  onCancel,
  onConfirm,
  testID = 'modal-time-picker',
}: TimePickerModalProps) => {
  const [{ hour, minute }, setSelectedTime] = useState(() => parseTime(value));
  const hourOptions = useMemo(() => createOptions(24), []);
  const minuteOptions = useMemo(() => createOptions(60), []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedTime(parseTime(value));
  }, [value, visible]);

  const handleConfirm = () => {
    onConfirm(`${padTime(hour)}:${padTime(minute)}`);
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar seletor de horário"
        onPress={onCancel}
        style={styles.backdrop}
        testID={`${testID}-backdrop`}>
        <Pressable onPress={() => undefined} style={styles.card} testID={testID}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.timePicker} testID={`${testID}-time-picker`}>
            <WheelColumn
              label="Hora"
              onSelect={(nextHour) => setSelectedTime((current) => ({ ...current, hour: nextHour }))}
              options={hourOptions}
              selectedValue={hour}
              testID={`${testID}-hour`}
            />
            <Text style={styles.separator}>:</Text>
            <WheelColumn
              label="Minuto"
              onSelect={(nextMinute) => setSelectedTime((current) => ({ ...current, minute: nextMinute }))}
              options={minuteOptions}
              selectedValue={minute}
              testID={`${testID}-minute`}
            />
          </View>

          <View style={styles.actions} testID={`${testID}-actions`}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="OK"
              onPress={handleConfirm}
              style={({ pressed }) => [styles.actionButton, styles.primaryAction, pressed ? styles.pressed : null]}
              testID={`${testID}-ok`}>
              <Text style={styles.primaryActionText}>OK</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              onPress={onCancel}
              style={({ pressed }) => [styles.actionButton, styles.secondaryAction, pressed ? styles.pressed : null]}
              testID={`${testID}-cancel`}>
              <Text style={styles.secondaryActionText}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

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
    gap: spacing.lg,
    ...shadows.card,
  },
  title: {
    color: colors.text,
    fontFamily: typography.heading,
    fontSize: 20,
  },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  separator: {
    color: colors.text,
    fontFamily: typography.heading,
    fontSize: 28,
    paddingTop: spacing.xl,
  },
  wheelColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  wheelLabel: {
    color: colors.textTertiary,
    fontFamily: typography.bodySemi,
    fontSize: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  wheel: {
    height: wheelItemHeight * 3,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
  },
  wheelSpacer: {
    height: wheelItemHeight,
  },
  wheelItem: {
    height: wheelItemHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    marginHorizontal: spacing.xs,
  },
  wheelItemSelected: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  wheelItemText: {
    fontFamily: typography.bodySemi,
    fontSize: 16,
  },
  wheelItemTextSelected: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
  },
  wheelItemTextMuted: {
    color: colors.textTertiary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryAction: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondaryAction: {
    backgroundColor: colors.input,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.86,
  },
  primaryActionText: {
    color: '#F8FBFF',
    fontFamily: typography.bodyStrong,
    fontSize: 15,
  },
  secondaryActionText: {
    color: colors.text,
    fontFamily: typography.bodySemi,
    fontSize: 15,
  },
});
