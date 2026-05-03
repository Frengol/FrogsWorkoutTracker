import { Ionicons } from '@expo/vector-icons';
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

type AppDatePickerModalProps = {
  visible: boolean;
  value: Date;
  title?: string;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
  testID?: string;
};

const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const monthShortLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const yearRangeRadius = 10;
const wheelItemHeight = 48;

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);

const createLocalDate = (year: number, month: number, day: number) => new Date(year, month, day, 12, 0, 0, 0);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatMonthLabel = (date: Date) => {
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
};

const buildCalendarGrid = (visibleMonth: Date) => {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = createLocalDate(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(createLocalDate(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

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

export const AppDatePickerModal = ({
  visible,
  value,
  title = 'Selecionar data',
  onCancel,
  onConfirm,
  testID = 'modal-app-date-picker',
}: AppDatePickerModalProps) => {
  const [selectedDate, setSelectedDate] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value));
  const [mode, setMode] = useState<'calendar' | 'monthYear'>('calendar');
  const [draftMonth, setDraftMonth] = useState(value.getMonth());
  const [draftYear, setDraftYear] = useState(value.getFullYear());
  const [yearOptions, setYearOptions] = useState(() => createYearOptions(value.getFullYear()));

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedDate(value);
    setVisibleMonth(startOfMonth(value));
    setMode('calendar');
    setDraftMonth(value.getMonth());
    setDraftYear(value.getFullYear());
    setYearOptions(createYearOptions(value.getFullYear()));
  }, [value, visible]);

  const cells = useMemo(() => buildCalendarGrid(visibleMonth), [visibleMonth]);
  const monthOptions = useMemo(
    () => monthShortLabels.map((label, index) => ({ label, value: index })),
    [],
  );
  const yearWheelOptions = useMemo(
    () => yearOptions.map((year) => ({ label: String(year), value: year })),
    [yearOptions],
  );
  const selectedDateKey = formatDateKey(selectedDate);

  const goToPreviousMonth = () => {
    setVisibleMonth((current) => startOfMonth(createLocalDate(current.getFullYear(), current.getMonth() - 1, 1)));
  };

  const goToNextMonth = () => {
    setVisibleMonth((current) => startOfMonth(createLocalDate(current.getFullYear(), current.getMonth() + 1, 1)));
  };

  const openMonthYearPicker = () => {
    const year = visibleMonth.getFullYear();

    setDraftMonth(visibleMonth.getMonth());
    setDraftYear(year);
    setYearOptions(createYearOptions(year));
    setMode('monthYear');
  };

  const applyMonthYearPicker = () => {
    const day = Math.min(selectedDate.getDate(), getDaysInMonth(draftYear, draftMonth));
    const nextDate = createLocalDate(draftYear, draftMonth, day);

    setSelectedDate(nextDate);
    setVisibleMonth(startOfMonth(nextDate));
    setMode('calendar');
  };

  const cancelMonthYearPicker = () => {
    setDraftMonth(visibleMonth.getMonth());
    setDraftYear(visibleMonth.getFullYear());
    setMode('calendar');
  };

  const handleCancel = () => {
    if (mode === 'monthYear') {
      cancelMonthYearPicker();
      return;
    }

    onCancel();
  };

  const handleConfirm = () => {
    if (mode === 'monthYear') {
      applyMonthYearPicker();
      return;
    }

    onConfirm(selectedDate);
  };

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar calendário"
        onPress={onCancel}
        style={styles.backdrop}
        testID={`${testID}-backdrop`}>
        <Pressable onPress={() => undefined} style={styles.card} testID={testID}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mês anterior"
              disabled={mode === 'monthYear'}
              onPress={goToPreviousMonth}
              style={[styles.monthButton, mode === 'monthYear' ? styles.monthButtonDisabled : null]}
              testID={`${testID}-previous-month`}>
              <Ionicons color={colors.text} name="chevron-back" size={20} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Selecionar mês e ano"
              onPress={openMonthYearPicker}
              style={styles.monthLabelButton}
              testID={`${testID}-month-year-trigger`}>
              <Text style={styles.monthLabel}>{formatMonthLabel(visibleMonth)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Próximo mês"
              disabled={mode === 'monthYear'}
              onPress={goToNextMonth}
              style={[styles.monthButton, mode === 'monthYear' ? styles.monthButtonDisabled : null]}
              testID={`${testID}-next-month`}>
              <Ionicons color={colors.text} name="chevron-forward" size={20} />
            </Pressable>
          </View>

          {mode === 'calendar' ? (
            <>
              <View style={styles.weekdayRow}>
                {weekdays.map((weekday, index) => (
                  <Text key={`${weekday}-${index}`} style={styles.weekdayLabel}>
                    {weekday}
                  </Text>
                ))}
              </View>

              <View style={styles.daysGrid}>
                {cells.map((date, index) => {
                  if (!date) {
                    return <View key={`empty-${index}`} style={styles.dayCell} />;
                  }

                  const dateKey = formatDateKey(date);
                  const isSelected = dateKey === selectedDateKey;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Selecionar ${date.getDate()}`}
                      key={dateKey}
                      onPress={() => setSelectedDate(date)}
                      style={[styles.dayCell, isSelected ? styles.dayCellSelected : null]}
                      testID={`${testID}-day-${dateKey}`}>
                      <Text style={[styles.dayText, isSelected ? styles.dayTextSelected : null]}>{date.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.monthYearPicker} testID={`${testID}-month-year-picker`}>
              <WheelColumn
                label="Mês"
                onSelect={setDraftMonth}
                options={monthOptions}
                selectedValue={draftMonth}
                testID={`${testID}-month`}
              />
              <WheelColumn
                label="Ano"
                onSelect={setDraftYear}
                options={yearWheelOptions}
                selectedValue={draftYear}
                testID={`${testID}-year`}
              />
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              onPress={handleCancel}
              style={({ pressed }) => [styles.actionButton, styles.secondaryAction, pressed ? styles.pressed : null]}
              testID={`${testID}-cancel`}>
              <Text style={styles.secondaryActionText}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="OK"
              onPress={handleConfirm}
              style={({ pressed }) => [styles.actionButton, styles.primaryAction, pressed ? styles.pressed : null]}
              testID={`${testID}-confirm`}>
              <Text style={styles.primaryActionText}>OK</Text>
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
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
  },
  monthButtonDisabled: {
    opacity: 0.35,
  },
  monthLabelButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  monthLabel: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 16,
    textAlign: 'center',
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
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    color: colors.textTertiary,
    fontFamily: typography.bodySemi,
    fontSize: 12,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    color: colors.text,
    fontFamily: typography.bodySemi,
    fontSize: 15,
  },
  dayTextSelected: {
    color: '#F8FBFF',
    fontFamily: typography.bodyStrong,
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
