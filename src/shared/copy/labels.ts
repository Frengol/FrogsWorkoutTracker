import {
  AnalyticsPeriod,
  DashboardView,
  Equipment,
  ExerciseModality,
  MuscleGroup,
  RecordMetric,
  RecordType,
  SetType,
  Workout,
  WorkoutStatus,
} from '@/src/shared/types/domain';

export const productGlossary = {
  routine: 'Treino',
  routines: 'Treinos salvos',
  library: 'Biblioteca',
  overview: 'Resumo',
  exercises: 'Exercícios',
  muscles: 'Músculos',
  body: 'Corpo',
  backup: 'Cópia de segurança',
} as const;

const muscleGroupLabels: Record<MuscleGroup, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  quads: 'Quadríceps',
  hamstrings: 'Posterior',
  glutes: 'Glúteos',
  calves: 'Panturrilhas',
  core: 'Abdômen',
  forearms: 'Antebraço',
  full_body: 'Corpo todo',
  cardio: 'Cardio',
};

const equipmentLabels: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Halteres',
  machine: 'Máquina',
  cable: 'Polia',
  bodyweight: 'Peso corporal',
  kettlebell: 'Kettlebell',
  smith_machine: 'Smith',
  band: 'Faixa',
  cardio_machine: 'Máquina de cardio',
  ez_bar: 'Barra EZ',
  bench: 'Banco',
  other: 'Outro',
};

const modalityLabels: Record<ExerciseModality, string> = {
  strength: 'Força',
  bodyweight: 'Peso corporal',
  timed: 'Tempo',
  distance: 'Distância',
};

const dashboardViewLabels: Record<DashboardView, string> = {
  overview: 'Resumo',
  exercises: 'Exercícios',
  muscles: 'Músculos',
  body: 'Corpo',
};

const analyticsPeriodLabels: Record<AnalyticsPeriod, string> = {
  '7d': '7d',
  '30d': '30d',
  '3m': '3m',
  '1y': '1a',
  all: 'Tudo',
};

export const getMuscleGroupLabel = (value: MuscleGroup) => muscleGroupLabels[value];
export const getEquipmentLabel = (value: Equipment) => equipmentLabels[value];
export const getExerciseModalityLabel = (value: ExerciseModality) => modalityLabels[value];
export const getDashboardViewLabel = (value: DashboardView) => dashboardViewLabels[value];
export const getAnalyticsPeriodLabel = (value: AnalyticsPeriod | string) => {
  if (value in analyticsPeriodLabels) {
    return analyticsPeriodLabels[value as AnalyticsPeriod];
  }

  if (value === 'all') {
    return 'Tudo';
  }

  if (/^\d+y$/i.test(value)) {
    return `${value.slice(0, -1)}a`;
  }

  return value;
};

export const getRoutineSourceLabel = (value: string) => {
  switch (value) {
    case 'library':
      return 'Treino do Frogs';
    case 'custom':
      return 'Criado por você';
    case 'copied':
      return 'Duplicado';
    default:
      return value;
  }
};

export const getExperienceLevelLabel = (value: string) => {
  switch (value) {
    case 'beginner':
      return 'Iniciante';
    case 'intermediate':
      return 'Intermediário';
    case 'advanced':
      return 'Avançado';
    default:
      return value;
  }
};

export const getUnitSystemLabel = (value: string) => {
  switch (value) {
    case 'imperial':
      return 'Imperial';
    case 'metric':
      return 'Métrico';
    default:
      return value;
  }
};

export const getWeekdayLabel = (weekdayNumber: number) => {
  switch (weekdayNumber) {
    case 1:
      return 'dom';
    case 2:
      return 'seg';
    case 3:
      return 'ter';
    case 4:
      return 'qua';
    case 5:
      return 'qui';
    case 6:
      return 'sex';
    case 7:
      return 'sáb';
    default:
      return String(weekdayNumber);
  }
};

export const getShortDateLabel = (dayKey: string) => {
  const parsed = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dayKey;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(parsed);
};

export const getSetTypeLabel = (value: SetType) => {
  switch (value) {
    case 'normal':
      return 'Normal';
    case 'warmup':
      return 'Aquecimento';
    case 'drop':
      return 'Drop';
    case 'failure':
      return 'Falha';
    case 'superset':
      return 'Superset';
    case 'assisted':
      return 'Assistida';
    case 'timed':
      return 'Tempo';
    case 'distance':
      return 'Distância';
    default:
      return value;
  }
};

export const getWorkoutStatusLabel = (value: WorkoutStatus) => {
  switch (value) {
    case 'draft':
      return 'Rascunho';
    case 'in_progress':
      return 'Em andamento';
    case 'completed':
      return 'Concluído';
    case 'discarded':
      return 'Descartado';
    default:
      return value;
  }
};

export const getWorkoutTitleLabel = (title: string, source?: Workout['source']) => {
  const normalizedTitle = title.trim().toLowerCase();

  if (
    source === 'empty' &&
    (normalizedTitle === 'empty workout' || normalizedTitle === 'treino vazio' || normalizedTitle === 'treino rápido')
  ) {
    return 'Treino rápido';
  }

  return title;
};

export const getRecordTypeLabel = (value: RecordType | string) => {
  switch (value) {
    case 'pr':
      return 'PR';
    case 'one_rm':
      return '1RM';
    default:
      return value.replaceAll('_', ' ');
  }
};

export const getPrMetricLabel = (value: RecordMetric | string) => {
  switch (value) {
    case 'heaviest_weight':
      return 'Maior carga';
    case 'estimated_1rm':
      return '1RM estimado';
    case 'best_reps':
      return 'Mais repetições';
    case 'best_duration':
      return 'Maior duração';
    case 'best_distance':
      return 'Maior distância';
    case 'best_volume':
      return 'Maior volume';
    default:
      return value.replaceAll('_', ' ');
  }
};

export const getPrAnnouncementLabel = (value: RecordMetric | string) => {
  switch (value) {
    case 'heaviest_weight':
      return 'novo recorde de carga';
    case 'estimated_1rm':
      return 'novo recorde de 1RM estimado';
    case 'best_reps':
      return 'novo recorde de repetições';
    case 'best_duration':
      return 'novo recorde de duração';
    case 'best_distance':
      return 'novo recorde de distância';
    case 'best_volume':
      return 'novo recorde de volume';
    default:
      return 'novo recorde pessoal';
  }
};

export const getRecordAnnouncementMetricLabel = (value: RecordMetric | string) => {
  switch (value) {
    case 'heaviest_weight':
      return 'carga';
    case 'estimated_1rm':
      return '1RM estimado';
    case 'best_reps':
      return 'repetições';
    case 'best_duration':
      return 'duração';
    case 'best_distance':
      return 'distância';
    case 'best_volume':
      return 'volume';
    default:
      return value.replaceAll('_', ' ');
  }
};

export const getImportJobStatusLabel = (value: string) => {
  switch (value) {
    case 'success':
      return 'concluída';
    case 'failed':
      return 'falhou';
    case 'blocked_duplicate':
      return 'arquivo já importado';
    case 'pending_review':
      return 'revisão pendente';
    case 'discarded':
      return 'descartada';
    default:
      return value;
  }
};
