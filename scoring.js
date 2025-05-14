export function calculateStrategyScores(strategies, state, scoringMatrix) {
  const idIndexMap = scoringMatrix.ID_Index_Map;
  
  return strategies.map(strategy => {
    const strategyId = parseInt(strategy.id, 10);
    const index = idIndexMap.indexOf(strategyId);

    let baseScore = strategy.baseScore || 100;
    let finalMultiplier = 1.0;
    let isApplicable = true;

    const strategyTags = {
      ipTypes: strategy.ipTypeTags || [],
      approaches: strategy.approachTags || [],
      features: strategy.features ? strategy.features.split('; ') : []
    };

    const tagMatch = tag => Object.values(strategyTags).some(tagArr => tagArr.includes(tag));

    const applyFilters = (filters, sourceKey, getValueFn) => {
      Object.entries(filters).forEach(([key, value]) => {
        if (getValueFn(value)) {
          const displayLabel = getDisplayLabel(key, value, sourceKey);
          const match = scoringMatrix.Filters.find(f => f.FilterKey === key && f.DisplayLabel === displayLabel);
          if (match && match.Values[index] !== undefined) {
            const multiplier = match.Values[index];
            finalMultiplier *= multiplier;
            if (multiplier === 0) isApplicable = false;
          }
        }
      });
    };

    const getDisplayLabel = (key, value, source) => {
      const group = scoringMatrix.Filters.find(f => f.FilterKey === key && f.FilterCategory.includes(source));
      const possibleValues = group?.Values || [];
      const allSameKey = scoringMatrix.Filters.filter(f => f.FilterKey === key);
      const labelObj = allSameKey.find(f => f.Values?.some(v => v !== 1));
      return labelObj?.DisplayLabel || `${key}:${value}`;
    };

    applyFilters(state.preferences, 'Regular Preference', v => v !== 0);
    applyFilters(state.otherFactors, 'Other Factors', v => v !== 'neutral');
    applyFilters(state.situationSpecificFilters || {}, 'Situation-Specific', v => v);
    applyFilters(state.ipTypeSpecificFilters || {}, 'IP Type-Specific', v => v);

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
