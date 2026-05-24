const pendingExerciseSelections = new Map<string, string>();

export const registerPendingExerciseSelection = (contextId: string, exerciseId: string) => {
  if (!contextId || !exerciseId) {
    return;
  }

  pendingExerciseSelections.set(contextId, exerciseId);
};

export const consumePendingExerciseSelection = (contextId: string) => {
  const exerciseId = pendingExerciseSelections.get(contextId) ?? null;
  pendingExerciseSelections.delete(contextId);

  return exerciseId;
};

export const clearPendingExerciseSelections = () => {
  pendingExerciseSelections.clear();
};
