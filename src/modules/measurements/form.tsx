import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BodyMeasurement } from '@/src/shared/types/domain';
import { Card, Field, PrimaryButton, SecondaryButton } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import {
  formatMeasurementDateValueFromIso,
  getTodayMeasurementDateValue,
  toMeasurementRecordedAt,
} from '@/src/modules/measurements/date';

export type MeasurementFormValues = {
  recordedDate: string;
  weightKg: string;
  chestCm: string;
  waistCm: string;
  hipsCm: string;
  armCm: string;
  thighCm: string;
  note: string;
};

export const createEmptyMeasurementFormValues = (): MeasurementFormValues => ({
  recordedDate: getTodayMeasurementDateValue(),
  weightKg: '',
  chestCm: '',
  waistCm: '',
  hipsCm: '',
  armCm: '',
  thighCm: '',
  note: '',
});

export const createMeasurementFormValuesFromMeasurement = (
  measurement: Pick<
    BodyMeasurement,
    'recordedAt' | 'weightKg' | 'chestCm' | 'waistCm' | 'hipsCm' | 'armCm' | 'thighCm' | 'note'
  >,
): MeasurementFormValues => ({
  recordedDate: formatMeasurementDateValueFromIso(measurement.recordedAt),
  weightKg: measurement.weightKg != null ? String(measurement.weightKg) : '',
  chestCm: measurement.chestCm != null ? String(measurement.chestCm) : '',
  waistCm: measurement.waistCm != null ? String(measurement.waistCm) : '',
  hipsCm: measurement.hipsCm != null ? String(measurement.hipsCm) : '',
  armCm: measurement.armCm != null ? String(measurement.armCm) : '',
  thighCm: measurement.thighCm != null ? String(measurement.thighCm) : '',
  note: measurement.note ?? '',
});

const parseMetricInput = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildMeasurementSaveInput = (values: MeasurementFormValues) => ({
  recordedAt: toMeasurementRecordedAt(values.recordedDate),
  weightKg: parseMetricInput(values.weightKg),
  chestCm: parseMetricInput(values.chestCm),
  waistCm: parseMetricInput(values.waistCm),
  hipsCm: parseMetricInput(values.hipsCm),
  armCm: parseMetricInput(values.armCm),
  thighCm: parseMetricInput(values.thighCm),
  note: values.note.trim() || null,
});

const MeasurementDateField = ({
  value,
  onPress,
  testID,
}: {
  value: string;
  onPress: () => void;
  testID: string;
}) => (
  <View>
    <Text style={styles.label}>Data</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Selecionar data da medida"
      onPress={onPress}
      style={styles.dateField}
      testID={testID}>
      <Text style={styles.dateFieldValue}>{value}</Text>
    </Pressable>
  </View>
);

export const MeasurementFormCard = ({
  title,
  values,
  onChange,
  onPressDate,
  onSubmit,
  submitLabel,
  submitTestID,
  onClear,
  clearLabel = 'Limpar',
  clearTestID,
  testID,
}: {
  title: string;
  values: MeasurementFormValues;
  onChange: (field: keyof MeasurementFormValues, value: string) => void;
  onPressDate: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitTestID: string;
  onClear?: () => void;
  clearLabel?: string;
  clearTestID?: string;
  testID?: string;
}) => (
  <Card testID={testID}>
    <Text style={styles.sectionLead}>{title}</Text>
    <MeasurementDateField value={values.recordedDate} onPress={onPressDate} testID="input-progress-measurement-date" />
    <View style={styles.formGrid}>
      <Field
        label="Peso (kg)"
        testID="input-progress-measurement-weight"
        keyboardType="decimal-pad"
        value={values.weightKg}
        onChangeText={(value) => onChange('weightKg', value)}
        style={styles.formField}
      />
      <Field
        label="Peito (cm)"
        testID="input-progress-measurement-chest"
        keyboardType="decimal-pad"
        value={values.chestCm}
        onChangeText={(value) => onChange('chestCm', value)}
        style={styles.formField}
      />
      <Field
        label="Cintura (cm)"
        testID="input-progress-measurement-waist"
        keyboardType="decimal-pad"
        value={values.waistCm}
        onChangeText={(value) => onChange('waistCm', value)}
        style={styles.formField}
      />
      <Field
        label="Quadril (cm)"
        testID="input-progress-measurement-hips"
        keyboardType="decimal-pad"
        value={values.hipsCm}
        onChangeText={(value) => onChange('hipsCm', value)}
        style={styles.formField}
      />
      <Field
        label="Braço (cm)"
        testID="input-progress-measurement-arm"
        keyboardType="decimal-pad"
        value={values.armCm}
        onChangeText={(value) => onChange('armCm', value)}
        style={styles.formField}
      />
      <Field
        label="Coxa (cm)"
        testID="input-progress-measurement-thigh"
        keyboardType="decimal-pad"
        value={values.thighCm}
        onChangeText={(value) => onChange('thighCm', value)}
        style={styles.formField}
      />
    </View>

    <Field
      label="Nota"
      testID="input-progress-measurement-note"
      value={values.note}
      onChangeText={(value) => onChange('note', value)}
      multiline
    />

    <View style={styles.buttonRow}>
      {onClear ? (
        <SecondaryButton label={clearLabel} onPress={onClear} style={styles.flexButton} testID={clearTestID} />
      ) : null}
      <PrimaryButton label={submitLabel} onPress={onSubmit} style={styles.flexButton} testID={submitTestID} />
    </View>
  </Card>
);

const styles = StyleSheet.create({
  sectionLead: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 18,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  formField: {
    minWidth: 140,
    flex: 1,
  },
  label: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  dateField: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateFieldValue: {
    fontFamily: typography.body,
    color: colors.text,
    fontSize: 17,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
});
