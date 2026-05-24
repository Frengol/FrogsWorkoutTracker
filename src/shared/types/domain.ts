export type SyncState = 'local_only' | 'pending_export' | 'exported';

export type SetType =
  | 'normal'
  | 'warmup'
  | 'drop'
  | 'failure'
  | 'superset'
  | 'assisted'
  | 'timed'
  | 'distance';

export type WorkoutStatus = 'draft' | 'in_progress' | 'completed' | 'discarded';

export type ExerciseModality = 'strength' | 'bodyweight' | 'timed' | 'distance';

export type StorageScope = 'local_only' | 'prepared_for_remote';

export type AnalyticsPeriod = '7d' | '30d' | '3m' | '1y' | 'all';

export type ComparisonPeriod = AnalyticsPeriod;

export type DashboardView = 'overview' | 'exercises' | 'muscles' | 'body';

export type ReportMonthKey = `${number}-${number}`;

export type ReportYearKey = `${number}`;

export type ImportSourceType =
  | 'frog_workouts_csv'
  | 'frog_measurements_csv'
  | 'hevy_csv'
  | 'frog_backup_json'
  | 'frog_routine_json';

export type ImportJobStatus = 'success' | 'failed' | 'blocked_duplicate' | 'pending_review' | 'discarded';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'full_body'
  | 'cardio';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'smith_machine'
  | 'band'
  | 'cardio_machine'
  | 'ez_bar'
  | 'bench'
  | 'plate'
  | 'other';

export type BaseEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  version: number;
  schemaVersion: number;
  remoteId?: string | null;
  syncState: SyncState;
  lastExportedAt?: string | null;
  originDeviceId: string;
};

export type User = BaseEntity & {
  mode: 'guest' | 'local_profile';
  displayName: string;
  avatarUri?: string | null;
  unitSystem: 'metric' | 'imperial';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  onboardingCompleted: boolean;
};

export type UserPreferences = BaseEntity & {
  userId: string;
  defaultRestSeconds: number;
  keepAwake: boolean;
  restOverlayEnabled: boolean;
  weekStartsOn: 0 | 1;
  autoBackupEnabled: boolean;
  autoBackupLastUpdatedAt?: string | null;
};

export type NotificationPreference = BaseEntity & {
  userId: string;
  restTimerNotificationEnabled: boolean;
  prNotificationEnabled: boolean;
  remindersEnabled: boolean;
  reportsEnabled: boolean;
  reminderTimeLocal?: string | null;
  reminderDays: number[];
};

export type Exercise = BaseEntity & {
  slug: string;
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  modality: ExerciseModality;
  isCustom: boolean;
  instructions?: string | null;
};

export type RoutineFolder = BaseEntity & {
  name: string;
  colorToken: string;
  sortOrder: number;
};

export type Routine = BaseEntity & {
  folderId?: string | null;
  name: string;
  description?: string | null;
  source: 'custom' | 'library' | 'copied';
  estimatedMinutes?: number | null;
  isArchived: boolean;
};

export type RoutineExercise = BaseEntity & {
  routineId: string;
  exerciseId: string;
  sortOrder: number;
  targetSets: number;
  targetRepsLabel: string;
  restSeconds: number;
  cardioDurationSeconds?: number | null;
  cardioDistanceMeters?: number | null;
  cardioSpeed?: number | null;
  cardioElevation?: number | null;
  note?: string | null;
  privateLink?: string | null;
  supersetGroup?: string | null;
  warmupEnabled: boolean;
};

export type Workout = BaseEntity & {
  routineId?: string | null;
  title: string;
  status: WorkoutStatus;
  source: 'empty' | 'routine' | 'library' | 'copied';
  startedAt: string;
  endedAt?: string | null;
  durationSeconds: number;
  generalNote?: string | null;
  totalVolume: number;
  totalReps: number;
  totalDistanceMeters: number;
};

export type WorkoutExercise = BaseEntity & {
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
  note?: string | null;
  restSeconds: number;
  previousPerformance?: string | null;
  supersetGroup?: string | null;
};

export type SetEntry = BaseEntity & {
  workoutExerciseId: string;
  setIndex: number;
  type: SetType;
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  speed?: number | null;
  elevation?: number | null;
  rpe?: number | null;
  completedAt?: string | null;
  isCompleted: boolean;
};

export type WorkoutMedia = BaseEntity & {
  workoutId: string;
  localUri: string;
  mediaType: 'photo' | 'video';
  thumbnailUri?: string | null;
  storageScope: StorageScope;
  fileName: string;
  fileSizeBytes: number;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
};

export type BodyMeasurement = BaseEntity & {
  userId: string;
  recordedAt: string;
  weightKg?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  note?: string | null;
};

export type RecordType = 'pr' | 'one_rm';

export type OneRmMetric = 'estimated_1rm';

export type PRMetric =
  | 'heaviest_weight'
  | 'best_reps'
  | 'best_duration'
  | 'best_distance'
  | 'best_volume';

export type RecordMetric = PRMetric | OneRmMetric;

export type PRRecord = BaseEntity & {
  exerciseId: string;
  workoutId: string;
  setEntryId: string;
  recordType: RecordType;
  metric: RecordMetric;
  value: number;
  achievedAt: string;
};

export type WorkoutRecord = PRRecord;

export type ExerciseHistorySnapshot = BaseEntity & {
  exerciseId: string;
  periodKey: string;
  workoutsCount: number;
  setsCount: number;
  totalVolume: number;
  totalReps: number;
  bestWeight: number;
  bestEstimated1Rm: number;
};

export type SyncQueueItem = BaseEntity & {
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payloadJson: string;
};

export type WorkoutDraftSnapshot = BaseEntity & {
  workoutId: string;
  summaryJson: string;
};

export type AuditLog = BaseEntity & {
  entityType: string;
  entityId: string;
  action: string;
  payloadJson: string;
};

export type RoutineComposerInput = {
  name: string;
  description: string;
  folderName: string;
  exercises: {
    exerciseId: string;
    targetSets: number;
    targetRepsLabel: string;
    restSeconds: number;
    cardioDurationSeconds?: number | null;
    cardioDistanceMeters?: number | null;
    cardioSpeed?: number | null;
    cardioElevation?: number | null;
    note: string;
    privateLink: string;
    supersetGroup: string;
    warmupEnabled: boolean;
  }[];
};

export type CustomExerciseDraft = {
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  modality: ExerciseModality;
  instructions: string;
};

export type WorkoutPreviousValues = {
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  speed?: number | null;
  elevation?: number | null;
  rpe?: number | null;
};

export type WorkoutLiveSupportedSetType = 'warmup' | 'normal' | 'failure';

export type WorkoutLiveSetEntry = SetEntry & {
  supportedType: WorkoutLiveSupportedSetType;
  seriesLabel: string;
  typeOccurrence: number;
  previousMatch?: WorkoutPreviousValues | null;
  previousMatchLabel: string;
};

export type WorkoutLiveModel = {
  workout: Workout;
  exercises: {
    workoutExercise: WorkoutExercise;
    exercise: Exercise;
    sets: WorkoutLiveSetEntry[];
    previousPerformance?: string | null;
    previousValues?: WorkoutPreviousValues | null;
  }[];
};

export type CompletedWorkoutEditDraft = WorkoutLiveModel;

export type WorkoutHistoryItem = {
  id: string;
  title: string;
  source: Workout['source'];
  startedAt: string;
  durationSeconds: number;
  totalVolume: number;
  exercises: {
    workoutExerciseId: string;
    exerciseId: string;
    exerciseName: string;
    muscleGroup: Exercise['muscleGroup'];
    durationSeconds?: number | null;
    setsCount: number;
  }[];
};

export type WorkoutDetail = {
  workout: Workout;
  exercises: WorkoutLiveModel['exercises'];
  media: WorkoutMedia[];
  prRecords: (WorkoutRecord & { exerciseName: string })[];
};

export type DashboardSnapshot = {
  totals: {
    completedWorkouts: number;
    totalVolume: number;
    totalReps: number;
    streak: number;
    last7Days: number;
  };
  weeklyFrequency: { day: string; count: number }[];
  muscleDistribution: { muscle: string; sets: number }[];
  recentRecords: (WorkoutRecord & { exerciseName: string })[];
  topExercises: { exerciseName: string; sessions: number; totalVolume: number }[];
  activeWorkout?: Workout | null;
};

export type PeriodComparisonSummary = {
  workoutsDelta: number;
  volumeDelta: number;
  repsDelta: number;
  workoutsDeltaPercent: number;
  volumeDeltaPercent: number;
  repsDeltaPercent: number;
};

export type OverviewAnalyticsSnapshot = {
  period: AnalyticsPeriod;
  summary: {
    completedWorkouts: number;
    totalVolume: number;
    totalReps: number;
    totalDistanceMeters: number;
    totalDurationSeconds: number;
    activeDays: number;
    streak: number;
    averageVolumePerWorkout: number;
    recordCount: number;
    prCount: number;
    oneRmCount: number;
    totalPrs: number;
  };
  comparison: PeriodComparisonSummary;
  calendar: {
    dayKey: string;
    workoutsCount: number;
    totalVolume: number;
  }[];
  calendarWeeks: {
    startDayKey: string;
    endDayKey: string;
    days: {
      dayKey: string;
      workoutsCount: number;
      totalVolume: number;
    }[];
  }[];
  muscleDistribution: {
    muscle: MuscleGroup;
    sets: number;
    percentage: number;
    previousSets: number;
  }[];
  topExercises: {
    exerciseId: string;
    exerciseName: string;
    sessions: number;
    totalVolume: number;
    bestWeight: number;
  }[];
  recentRecords: (WorkoutRecord & { exerciseName: string })[];
  activeWorkout?: Workout | null;
  lastClosedMonthKey?: ReportMonthKey | null;
  currentYearKey?: ReportYearKey | null;
};

export type ExerciseAnalyticsSnapshot = {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  latestPerformedAt: string;
  sessions: number;
  totalVolume: number;
  totalReps: number;
  bestWeight: number;
  bestEstimated1Rm: number;
  bestSetVolume: number;
  bestSessionVolume: number;
  longestDurationSeconds: number;
  longestDistanceMeters: number;
  bestPaceMetersPerMinute: number;
  records: Partial<Record<RecordMetric, number>>;
  history: {
    dayKey: string;
    totalVolume: number;
    totalReps: number;
    bestWeight: number;
    totalDurationSeconds: number;
    totalDistanceMeters: number;
    bestPaceMetersPerMinute: number;
  }[];
};

export type MuscleAnalyticsSnapshot = {
  period: AnalyticsPeriod;
  muscles: {
    muscle: MuscleGroup;
    sets: number;
    totalVolume: number;
    percentage: number;
    previousSets: number;
    deltaSets: number;
  }[];
};

export type BodyProgressSnapshot = {
  period: AnalyticsPeriod;
  summary: {
    entries: number;
    latestWeightKg: number | null;
    weightChangeKg: number | null;
    averageWeeklyWorkouts: number;
    averageWeeklyVolume: number;
  };
  timeline: BodyMeasurement[];
};

export type MonthlyReportSnapshot = {
  monthKey: ReportMonthKey;
  label: string;
  summary: {
    workouts: number;
    activeDays: number;
    totalVolume: number;
    totalReps: number;
    totalDurationSeconds: number;
    recordCount: number;
    prCount: number;
    oneRmCount: number;
    topMuscle: MuscleGroup | null;
    topExercise: string | null;
  };
};

export type YearInReviewSnapshot = {
  yearKey: ReportYearKey;
  summary: {
    workouts: number;
    activeDays: number;
    totalVolume: number;
    totalReps: number;
    totalDistanceMeters: number;
    totalDurationSeconds: number;
    recordCount: number;
    prCount: number;
    oneRmCount: number;
    longestStreak: number;
    strongestExercise: string | null;
    mostTrainedMuscle: MuscleGroup | null;
  };
  monthlyVolume: {
    monthKey: ReportMonthKey;
    totalVolume: number;
    workouts: number;
  }[];
};

export type WorkoutCsvRow = {
  workout_id: string;
  workout_title: string;
  workout_started_at: string;
  workout_ended_at: string;
  workout_duration_seconds: number;
  workout_status: WorkoutStatus;
  workout_source: Workout['source'];
  workout_note: string;
  workout_exercise_id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_sort_order: number;
  exercise_note: string;
  rest_seconds: number;
  previous_performance: string;
  superset_group: string;
  muscle_group: MuscleGroup;
  secondary_muscles_json: string;
  equipment: Equipment;
  modality: ExerciseModality;
  instructions: string;
  set_id: string;
  set_index: number;
  set_type: SetType;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  speed: number | null;
  elevation: number | null;
  rpe: number | null;
  is_completed: 0 | 1;
};

export type MeasurementCsvRow = {
  measurement_id: string;
  recorded_at: string;
  weight_kg: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  note: string | null;
};

export type BackupEnvelopeV1 = {
  version: 1;
  exportedAt: string;
  deviceId: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export type ImportJobResult = {
  sourceType: ImportSourceType;
  fileName: string;
  status: ImportJobStatus;
  insertedCount: number;
  skippedCount: number;
  errors: string[];
  reviewJobId?: string;
};

export type ImportReviewGroupStatus = 'pending' | 'matched' | 'auto_matched' | 'replaced' | 'edited';

export type ImportReviewGroupSummary = {
  key: string;
  importedName: string;
  placeholderExerciseId: string;
  workoutExerciseIds: string[];
  routineExerciseIds?: string[];
  status: ImportReviewGroupStatus;
  differenceCount: number;
  matchedExerciseId?: string | null;
  resolvedExerciseId?: string | null;
};

export type ImportReviewSummary = {
  insertedCount: number;
  skippedCount: number;
  workoutIds: string[];
  routineIds?: string[];
  routineExerciseIds?: string[];
  createdRoutineFolderIds?: string[];
  placeholderExerciseIds: string[];
  exerciseGroups: ImportReviewGroupSummary[];
  backupRestore?: {
    envelope: BackupEnvelopeV1;
    exerciseIdsByGroupKey: Record<string, string[]>;
  };
};

export type ImportReviewGroup = ImportReviewGroupSummary & {
  placeholderExercise: Exercise | null;
  resolvedExercise: Exercise | null;
};

export type ImportReview = {
  importJobId: string;
  sourceType: Extract<ImportSourceType, 'hevy_csv' | 'frog_workouts_csv' | 'frog_routine_json' | 'frog_backup_json'>;
  fileName: string;
  status: ImportJobStatus;
  insertedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  groups: ImportReviewGroup[];
};

export type CsvImportAdapter = {
  canHandle: (headers: string[]) => boolean;
  importRows: (rows: Record<string, string>[]) => ImportJobResult;
};
