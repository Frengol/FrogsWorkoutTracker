import {
  getAnalyticsPeriodLabel,
  getDashboardViewLabel,
  getEquipmentLabel,
  getExerciseModalityLabel,
  getExperienceLevelLabel,
  getImportJobStatusLabel,
  getMuscleGroupLabel,
  getPrMetricLabel,
  getRoutineSourceLabel,
  getSetTypeLabel,
  getShortDateLabel,
  getUnitSystemLabel,
  getWeekdayLabel,
  getWorkoutStatusLabel,
  productGlossary,
} from '@/src/shared/copy/labels';

describe('labels', () => {
  it('exposes the stable product glossary', () => {
    expect(productGlossary.routine).toBe('Treino');
    expect(productGlossary.routines).toBe('Treinos salvos');
    expect(productGlossary.library).toBe('Biblioteca');
    expect(productGlossary.backup).toBe('Cópia de segurança');
  });

  it('maps muscle groups, equipment, modalities and dashboard views', () => {
    expect(getMuscleGroupLabel('chest')).toBe('Peito');
    expect(getMuscleGroupLabel('back')).toBe('Costas');
    expect(getMuscleGroupLabel('shoulders')).toBe('Ombros');
    expect(getMuscleGroupLabel('biceps')).toBe('Bíceps');
    expect(getMuscleGroupLabel('triceps')).toBe('Tríceps');
    expect(getMuscleGroupLabel('quads')).toBe('Quadríceps');
    expect(getMuscleGroupLabel('hamstrings')).toBe('Posterior');
    expect(getMuscleGroupLabel('glutes')).toBe('Glúteos');
    expect(getMuscleGroupLabel('calves')).toBe('Panturrilhas');
    expect(getMuscleGroupLabel('core')).toBe('Abdômen');
    expect(getMuscleGroupLabel('forearms')).toBe('Antebraço');
    expect(getMuscleGroupLabel('full_body')).toBe('Corpo todo');
    expect(getMuscleGroupLabel('cardio')).toBe('Cardio');

    expect(getEquipmentLabel('barbell')).toBe('Barra');
    expect(getEquipmentLabel('dumbbell')).toBe('Halteres');
    expect(getEquipmentLabel('machine')).toBe('Máquina');
    expect(getEquipmentLabel('cable')).toBe('Polia');
    expect(getEquipmentLabel('bodyweight')).toBe('Peso corporal');
    expect(getEquipmentLabel('kettlebell')).toBe('Kettlebell');
    expect(getEquipmentLabel('smith_machine')).toBe('Smith');
    expect(getEquipmentLabel('band')).toBe('Faixa');
    expect(getEquipmentLabel('cardio_machine')).toBe('Máquina de cardio');
    expect(getEquipmentLabel('ez_bar')).toBe('Barra EZ');
    expect(getEquipmentLabel('bench')).toBe('Banco');
    expect(getEquipmentLabel('other')).toBe('Outro');

    expect(getExerciseModalityLabel('strength')).toBe('Força');
    expect(getExerciseModalityLabel('bodyweight')).toBe('Peso corporal');
    expect(getExerciseModalityLabel('timed')).toBe('Tempo');
    expect(getExerciseModalityLabel('distance')).toBe('Distância');

    expect(getDashboardViewLabel('overview')).toBe('Resumo');
    expect(getDashboardViewLabel('exercises')).toBe('Exercícios');
    expect(getDashboardViewLabel('muscles')).toBe('Músculos');
    expect(getDashboardViewLabel('body')).toBe('Corpo');
  });

  it('maps sources, experience and units with fallback', () => {
    expect(getRoutineSourceLabel('library')).toBe('Treino do Frogs');
    expect(getRoutineSourceLabel('custom')).toBe('Criado por você');
    expect(getRoutineSourceLabel('copied')).toBe('Duplicado');
    expect(getRoutineSourceLabel('external')).toBe('external');

    expect(getExperienceLevelLabel('beginner')).toBe('Iniciante');
    expect(getExperienceLevelLabel('intermediate')).toBe('Intermediário');
    expect(getExperienceLevelLabel('advanced')).toBe('Avançado');
    expect(getExperienceLevelLabel('coach')).toBe('coach');

    expect(getUnitSystemLabel('imperial')).toBe('Imperial');
    expect(getUnitSystemLabel('metric')).toBe('Métrico');
    expect(getUnitSystemLabel('other')).toBe('other');
  });

  it('maps weekdays, short dates, set types, workout statuses, PR metrics and import statuses', () => {
    expect(getAnalyticsPeriodLabel('7d')).toBe('7d');
    expect(getAnalyticsPeriodLabel('30d')).toBe('30d');
    expect(getAnalyticsPeriodLabel('3m')).toBe('3m');
    expect(getAnalyticsPeriodLabel('1y')).toBe('1a');
    expect(getAnalyticsPeriodLabel('all')).toBe('Tudo');
    expect(getAnalyticsPeriodLabel('3y')).toBe('3a');

    expect(getWeekdayLabel(1)).toBe('dom');
    expect(getWeekdayLabel(2)).toBe('seg');
    expect(getWeekdayLabel(3)).toBe('ter');
    expect(getWeekdayLabel(4)).toBe('qua');
    expect(getWeekdayLabel(5)).toBe('qui');
    expect(getWeekdayLabel(6)).toBe('sex');
    expect(getWeekdayLabel(7)).toBe('sáb');
    expect(getWeekdayLabel(9)).toBe('9');

    expect(getShortDateLabel('2026-03-27')).toBe('27/03');
    expect(getShortDateLabel('invalid-date')).toBe('invalid-date');

    expect(getSetTypeLabel('normal')).toBe('Normal');
    expect(getSetTypeLabel('warmup')).toBe('Aquecimento');
    expect(getSetTypeLabel('drop')).toBe('Drop');
    expect(getSetTypeLabel('failure')).toBe('Falha');
    expect(getSetTypeLabel('superset')).toBe('Superset');
    expect(getSetTypeLabel('assisted')).toBe('Assistida');
    expect(getSetTypeLabel('timed')).toBe('Tempo');
    expect(getSetTypeLabel('distance')).toBe('Distância');

    expect(getWorkoutStatusLabel('draft')).toBe('Rascunho');
    expect(getWorkoutStatusLabel('in_progress')).toBe('Em andamento');
    expect(getWorkoutStatusLabel('completed')).toBe('Concluído');
    expect(getWorkoutStatusLabel('discarded')).toBe('Descartado');
    expect(getWorkoutStatusLabel('paused' as never)).toBe('paused');

    expect(getPrMetricLabel('heaviest_weight')).toBe('Maior carga');
    expect(getPrMetricLabel('estimated_1rm')).toBe('1RM estimado');
    expect(getPrMetricLabel('best_reps')).toBe('Mais repetições');
    expect(getPrMetricLabel('best_duration')).toBe('Maior duração');
    expect(getPrMetricLabel('best_distance')).toBe('Maior distância');
    expect(getPrMetricLabel('best_volume')).toBe('Maior volume');
    expect(getPrMetricLabel('custom_metric')).toBe('custom metric');

    expect(getImportJobStatusLabel('success')).toBe('concluída');
    expect(getImportJobStatusLabel('failed')).toBe('falhou');
    expect(getImportJobStatusLabel('blocked_duplicate')).toBe('arquivo já importado');
    expect(getImportJobStatusLabel('pending_review')).toBe('revisão pendente');
    expect(getImportJobStatusLabel('discarded')).toBe('descartada');
    expect(getImportJobStatusLabel('unknown')).toBe('unknown');
  });
});
