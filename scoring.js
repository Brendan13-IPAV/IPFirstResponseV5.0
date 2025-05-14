export function calculateStrategyScores(strategies, state, scoringMatrix) {
  const idIndexMap = scoringMatrix.ID_Index_Map;

  return strategies.map(strategy => {
    const index = idIndexMap.indexOf(parseInt(strategy.id, 10));
    let finalMultiplier = 1.0;
    let isApplicable = true;
    const baseScore = strategy.baseScore || 100;

    // All active filters from all sources
    const activeFilterKeys = [
      ...Object.entries(state.preferences).filter(([_, v]) => v !== 0).map(([k]) => k),
      ...Object.entries(state.otherFactors).filter(([_, v]) => v !== 'neutral').map(([k]) => k),
      ...Object.entries(state.situationSpecificFilters || {}).filter(([_, v]) => v).map(([k]) => k),
      ...Object.entries(state.ipTypeSpecificFilters || {}).filter(([_, v]) => v).map(([k]) => k)
    ];

    activeFilterKeys.forEach(key => {
      const match = scoringMatrix.Filters.find(f => f.FilterKey === key);
      if (match && match.Values[index] !== undefined) {
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
