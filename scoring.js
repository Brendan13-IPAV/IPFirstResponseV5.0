export function calculateStrategyScores(strategies, state, scoringMatrix) {
  const idIndexMap = scoringMatrix.ID_Index_Map;

  return strategies.map(strategy => {
    const index = idIndexMap.indexOf(parseInt(strategy.id, 10));
    if (index === -1) {
      console.error(`Strategy ID ${strategy.id} not found in scoring matrix`);
      return { ...strategy, matchScore: 0, isApplicable: false };
    }

    let finalMultiplier = 1.0;
    let isApplicable = true;
    const baseScore = strategy.baseScore || 100;

    // Collect all active filters
    const activeFilterKeys = [];
    
    // Get preference filters
    if (state.preferences) {
      Object.entries(state.preferences).forEach(([key, value]) => {
        if (value !== 0) {
          // Find the corresponding filter in the preferences config
          const preferenceConfig = preferenceConfigs?.filters?.[key];
          if (preferenceConfig) {
            const option = preferenceConfig.options.find(opt => opt.value === value);
            if (option && option.pillLabel) {
              activeFilterKeys.push(option.pillLabel);
            }
          }
        }
      });
    }
    
    // Get other factors filters
    if (state.otherFactors) {
      Object.entries(state.otherFactors).forEach(([key, value]) => {
        if (value !== 'neutral') {
          const factorConfig = preferenceConfigs?.otherFactors?.[key];
          if (factorConfig) {
            const option = factorConfig.options.find(opt => opt.value === value);
            if (option && option.pillLabel) {
              activeFilterKeys.push(option.pillLabel);
            }
          }
        }
      });
    }
    
    // Get situation-specific filters
    if (state.situationSpecificFilters) {
      Object.entries(state.situationSpecificFilters).forEach(([key, value]) => {
        if (value) {
          // Find which situation contains this filter
          for (const situation of state.selectedSituations || []) {
            const situationConfig = preferenceConfigs?.situationSpecific?.[situation]?.[key];
            if (situationConfig) {
              const option = situationConfig.options.find(opt => opt.value === value);
              if (option && option.pillLabel) {
                activeFilterKeys.push(option.pillLabel);
              }
              break;
            }
          }
        }
      });
    }
    
    // Get IP-type specific filters
    if (state.ipTypeSpecificFilters) {
      Object.entries(state.ipTypeSpecificFilters).forEach(([key, value]) => {
        if (value) {
          // Find which IP type contains this filter
          for (const ipType of state.selectedRights || []) {
            const ipTypeConfig = preferenceConfigs?.ipTypeSpecific?.[ipType]?.[key];
            if (ipTypeConfig) {
              const option = ipTypeConfig.options.find(opt => opt.value === value);
              if (option && option.pillLabel) {
                activeFilterKeys.push(option.pillLabel);
              }
              break;
            }
          }
        }
      });
    }

    // Apply filter multipliers
    activeFilterKeys.forEach(key => {
      const filterObj = scoringMatrix.Filters.find(f => f.FilterKey === key);
      if (filterObj && index < filterObj.Values.length) {
        const multiplier = filterObj.Values[index];
        finalMultiplier *= multiplier;
        
        // If multiplier is 0, mark strategy as not applicable
        if (multiplier === 0) {
          isApplicable = false;
        }
      }
    });

    // Calculate final score
    const rawScore = baseScore * finalMultiplier;
    const matchScore = isApplicable ? Math.min(100, Math.max(0, rawScore)) : 0;

    return {
      ...strategy,
      matchScore,
      isApplicable
    };
  }).sort((a, b) => {
    // First sort by applicability (applicable strategies first)
    if (a.isApplicable !== b.isApplicable) return a.isApplicable ? -1 : 1;
    // Then sort by match score (higher scores first)
    return b.matchScore - a.matchScore;
  });
}
