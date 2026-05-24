export const estimateOneRepMax = (weightKg?: number | null, reps?: number | null) => {
  if (!weightKg || !reps || reps <= 0) {
    return 0;
  }

  return weightKg * (1 + reps / 30);
};

export const getPlateBreakdown = (targetWeightKg?: number | null, barbellWeightKg = 20) => {
  if (!targetWeightKg || targetWeightKg <= barbellWeightKg) {
    return [];
  }

  const availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25];
  let remaining = (targetWeightKg - barbellWeightKg) / 2;
  const perSide: number[] = [];

  for (const plate of availablePlates) {
    while (remaining >= plate - 0.001) {
      perSide.push(plate);
      remaining -= plate;
    }
  }

  return perSide;
};

export const getWarmupSuggestions = (workingWeightKg?: number | null) => {
  if (!workingWeightKg || workingWeightKg <= 0) {
    return [];
  }

  return [
    { label: 'Primer', weight: Math.round(workingWeightKg * 0.4), reps: 8 },
    { label: 'Build', weight: Math.round(workingWeightKg * 0.6), reps: 5 },
    { label: 'Prime', weight: Math.round(workingWeightKg * 0.75), reps: 3 },
  ];
};
