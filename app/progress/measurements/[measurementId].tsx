import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { getBodyMeasurement, saveBodyMeasurement } from '@/src/modules/measurements/service';
import { formatMeasurementDateValue, parseMeasurementDateValue } from '@/src/modules/measurements/date';
import {
  buildMeasurementSaveInput,
  createMeasurementFormValuesFromMeasurement,
  MeasurementFormCard,
} from '@/src/modules/measurements/form';
import { AppDatePickerModal } from '@/src/shared/design/app-date-picker';
import { AppScreen, EmptyState, ScreenHeader } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';

export default function ProgressMeasurementEditScreen() {
  const { measurementId } = useLocalSearchParams<{ measurementId: string }>();
  const measurement = useMemo(
    () => (typeof measurementId === 'string' && measurementId.length > 0 ? getBodyMeasurement(measurementId) : null),
    [measurementId],
  );
  const [values, setValues] = useState(() =>
    measurement
      ? createMeasurementFormValuesFromMeasurement(measurement)
      : {
          recordedDate: '',
          weightKg: '',
          chestCm: '',
          waistCm: '',
          hipsCm: '',
          armCm: '',
          thighCm: '',
          note: '',
        },
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.progress({ view: 'body' }));
  };

  if (!measurement) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Progresso" title="Editar medida" backAction={handleBack} backTestID="btn-progress-measurement-edit-back" />
        <EmptyState
          title="Medida não encontrada"
          subtitle="Esse registro corporal não está mais disponível no aparelho."
        />
      </AppScreen>
    );
  }

  const handleDateConfirm = (selectedDate: Date) => {
    setIsDatePickerVisible(false);

    setValues((current) => ({
      ...current,
      recordedDate: formatMeasurementDateValue(selectedDate),
    }));
  };

  const handleSave = () => {
    const payload = buildMeasurementSaveInput(values);
    const { recordedAt, ...rest } = payload;
    if (!recordedAt) {
      setErrorMessage('Selecione uma data válida para a medida.');
      return;
    }

    saveBodyMeasurement({ recordedAt, ...rest }, measurement.id);
    handleBack();
  };

  return (
    <AppScreen scroll keyboardAware measuredFocusScreenName="progress-measurement-edit" testID="screen-progress-measurement-edit">
      <ScreenHeader
        eyebrow="Progresso"
        title="Editar medida corporal"
        backAction={handleBack}
        backTestID="btn-progress-measurement-edit-back"
      />
      {errorMessage ? <EmptyState title="Não foi possível salvar" subtitle={errorMessage} /> : null}
      <MeasurementFormCard
        title="Editar medida completa"
        values={values}
        onChange={(field, value) => {
          setErrorMessage('');
          setValues((current) => ({ ...current, [field]: value }));
        }}
        onPressDate={() => setIsDatePickerVisible(true)}
        onSubmit={handleSave}
        submitLabel="Salvar alterações"
        submitTestID="btn-progress-save-measurement-edit"
        testID="card-progress-edit-measurement"
      />
      <AppDatePickerModal
        visible={isDatePickerVisible}
        value={parseMeasurementDateValue(values.recordedDate) ?? new Date()}
        title="Data da medida"
        onCancel={() => setIsDatePickerVisible(false)}
        onConfirm={handleDateConfirm}
        testID="modal-progress-measurement-edit-date-picker"
      />
    </AppScreen>
  );
}
