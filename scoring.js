export function calculateStrategyScores(strategies, state, scoringMatrix) {
  const idIndexMap = scoringMatrix.ID_Index_Map;

  return strategies.map(strategy => {
    const strategyId = parseInt(strategy.id, 10);
    const index = idIndexMap.indexOf(strategyId);

    let finalMultiplier = 1.0;
    let isApplicable = true;
    const baseScore = strategy.baseScore || 100;

    // Combine all filters into a single object
    const allFilters = {
      ...state.preferences,
      ...state.otherFactors,
      ...(state.situationSpecificFilters || {}),
      ...(state.ipTypeSpecificFilters || {})
    };

    Object.entries(allFilters).forEach(([key, value]) => {
      // Skip inactive filters
      const isInactive = value === 0 || value === 'neutral' || value === '' || value === null;
      if (isInactive) return;

      // Try to match by FilterKey and OptionValue
      const match = scoringMatrix.Filters.find(f =>
        f.FilterKey === key &&
        f.OptionValue === value // 👈 Add this field in JSON if not already
      );

      if (match && match.Values && match.Values[index] !== undefined) {
        const multiplier = match.Values[index];
        finalMultiplier *= multiplier;
        if (multiplier === 0) isApplicable = false;
      }
    });

    const rawScore = baseScore * finalMultiplier;
    const matchScore = isApplicable ? Math.min(100, Math.max(0, rawScore)) : 0;

    return {
      ...strategy,
      matchScore,
      isApplicable
    };
  }).sort((a, b) => {
    if (a.isApplicable !== b.isApplicable) return a.isApplicable ? -1 : 1;
    return b.matchScore - a.matchScore;
  });
}
