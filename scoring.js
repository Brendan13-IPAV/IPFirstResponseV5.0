export function calculateStrategyScores(strategies, state, scoringMatrix) {
  const idIndexMap = scoringMatrix.ID_Index_Map;

  // First, pre-filter strategies by selected IP rights
  const filteredByRightType = strategies.filter(strategy => {
    // If the strategy is for "Any" IP right, include it
    if (strategy.right === "Any") {
      return true;
    }
    
    // If the strategy has ipTypeTags
    if (strategy.ipTypeTags && strategy.ipTypeTags.length > 0) {
      // Include if any of the tags is "Any dispute" or "Any IP right" or "Any"
      if (strategy.ipTypeTags.some(tag => ["Any dispute", "Any IP right", "Any"].includes(tag))) {
        return true;
      }
      
      // Include if any of the strategy's ipTypeTags match any of the selected rights
      return strategy.ipTypeTags.some(tag => state.selectedRights.includes(tag));
    }
    
    // If it has a right property, check against selected rights
    if (strategy.right) {
      return state.selectedRights.includes(strategy.right);
    }
    
    // If we have no way to determine, include it (fail open)
    return true;
  });
  
  console.log(`Pre-filtered from ${strategies.length} to ${filteredByRightType.length} strategies based on IP right types`);

  // Now apply scoring to the pre-filtered strategies
  return filteredByRightType.map(strategy => {
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
          const preferenceConfig = window.preferenceConfigs?.filters?.[key];
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
          const factorConfig = window.preferenceConfigs?.otherFactors?.[key];
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
            const situationConfig = window.preferenceConfigs?.situationSpecific?.[situation]?.[key];
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
            const ipTypeConfig = window.preferenceConfigs?.ipTypeSpecific?.[ipType]?.[key];
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

    // For debugging
    if (activeFilterKeys.length > 0) {
      console.log(`Active filters for strategy ${strategy.id}:`, activeFilterKeys);
    }

    // Apply filter multipliers
    activeFilterKeys.forEach(key => {
      const filterObj = scoringMatrix.Filters.find(f => f.FilterKey === key);
      if (filterObj && index < filterObj.Values.length) {
        const multiplier = filterObj.Values[index];
        if (multiplier !== undefined) {
          finalMultiplier *= multiplier;
          
          // If multiplier is 0, mark strategy as not applicable
          if (multiplier === 0) {
            isApplicable = false;
          }
        }
      } else {
        console.warn(`Filter key "${key}" not found in scoring matrix or index out of bounds for strategy ${strategy.id}`);
      }
    });

    // Calculate final score
    const rawScore = baseScore * finalMultiplier;
    const matchScore = isApplicable ? Math.min(100, Math.max(0, rawScore)) : 0;

    // For debugging
    if (finalMultiplier !== 1.0) {
      console.log(`Strategy ${strategy.id}: final multiplier = ${finalMultiplier}, match score = ${matchScore}`);
    }

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
