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

type MonthYearPickerModalProps = {
  visible: boolean;
  value: Date;
  title?: string;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
  testID?: string;
};

const monthShortLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const yearRangeRadius = 10;
const wheelItemHeight = 48;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const createLocalDate = (year: number, month: number, day: number) => new Date(year, month, day, 12, 0, 0, 0);

const createYearOptions = (centerYear: number) =>
  Array.from({ length: yearRangeRadius * 2 + 1 }, (_, index) => centerYear - yearRangeRadius + index);

type WheelOption = {
  label: string;
  value: number;
};

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

export const MonthYearPickerModal = ({
  visible,
  value,
  title = 'Selecionar mês e ano',
  onCancel,
  onConfirm,
  testID = 'modal-month-year-picker',
}: MonthYearPickerModalProps) => {
  const [selectedMonth, setSelectedMonth] = useState(value.getMonth());
  const [selectedYear, setSelectedYear] = useState(value.getFullYear());
  const [yearOptions, setYearOptions] = useState(() => createYearOptions(value.getFullYear()));

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedMonth(value.getMonth());
    setSelectedYear(value.getFullYear());
    setYearOptions(createYearOptions(value.getFullYear()));
  }, [value, visible]);

  const monthOptions = useMemo(
    () => monthShortLabels.map((label, index) => ({ label, value: index })),
    [],
  );

  const yearWheelOptions = useMemo(
    () => yearOptions.map((year) => ({ label: String(year), value: year })),
    [yearOptions],
  );

  const handleConfirm = () => {
    onConfirm(createLocalDate(selectedYear, selectedMonth, 1));
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar seletor de mês e ano"
        onPress={onCancel}
        style={styles.backdrop}
        testID={`${testID}-backdrop`}>
        <Pressable onPress={() => undefined} style={styles.card} testID={testID}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.monthYearPicker} testID={`${testID}-month-year-picker`}>
            <WheelColumn
              label="Mês"
              onSelect={setSelectedMonth}
              options={monthOptions}
              selectedValue={selectedMonth}
              testID={`${testID}-month`}
            />
            <WheelColumn
              label="Ano"
              onSelect={setSelectedYear}
              options={yearWheelOptions}
              selectedValue={selectedYear}
              testID={`${testID}-year`}
            />
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              onPress={onCancel}
              style={({ pressed }) => [styles.actionButton, styles.secondaryAction, pressed ? styles.pressed : null]}
              testID={`${testID}-cancel`}>
              <Text style={styles.secondaryActionText}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirmar"
              onPress={handleConfirm}
              style={({ pressed }) => [styles.actionButton, styles.primaryAction, pressed ? styles.pressed : null]}
              testID={`${testID}-confirm`}>
              <Text style={styles.primaryActionText}>Confirmar</Text>
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
  monthYearPicker: {
    flexDirection: 'row',
    gap: spacing.md,
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
  secondaryAction: {
    backgroundColor: colors.input,
    borderColor: colors.border,
  },
  primaryAction: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.86,
  },
  secondaryActionText: {
    color: colors.text,
    fontFamily: typography.bodySemi,
    fontSize: 15,
  },
  primaryActionText: {
    color: '#F8FBFF',
    fontFamily: typography.bodyStrong,
    fontSize: 15,
  },
});
