export function calculateStrategyScores(strategies, state, scoringMatrix) {
  const idIndexMap = scoringMatrix.ID_Index_Map;

  // First, pre-filter strategies by selected IP rights and situations
  const filteredByRightType = strategies.filter(strategy => {
    // Check if strategy matches any of the selected IP rights
    let matchesSelectedRights = false;
    
    // If strategy has ipTypeTags array, use that for precise matching
    if (strategy.ipTypeTags && strategy.ipTypeTags.length > 0) {
      // Strategy includes "Any dispute" or similar generic tag
      if (strategy.ipTypeTags.some(tag => 
          tag === "Any dispute" || tag === "Any IP right" || tag === "Any")) {
        matchesSelectedRights = true;
      } 
      // Strategy's specific IP types match any selected rights
      else if (strategy.ipTypeTags.some(tag => 
          state.selectedRights.includes(tag))) {
        matchesSelectedRights = true;
      }
    }
    // Fallback to the right property if no ipTypeTags or no match found
    else if (strategy.right) {
      if (strategy.right === "Any" || state.selectedRights.includes(strategy.right)) {
        matchesSelectedRights = true;
      }
    }
    
    // Check for response type matching with selected situations
    let matchesSelectedSituations = false;
    
    if (strategy.responseType && strategy.responseType.length > 0) {
      if (strategy.responseType.some(type => state.selectedSituations.includes(type))) {
        matchesSelectedSituations = true;
      }
    }
    
    // Include the strategy only if it matches both IP rights and situations
    return matchesSelectedRights && matchesSelectedSituations;
  });

  // Now calculate raw scores for pre-filtered strategies
  const scoredStrategies = filteredByRightType.map(strategy => {
    const index = idIndexMap.indexOf(parseInt(strategy.id, 10));
    if (index === -1) {
      return { ...strategy, rawScore: 0, isApplicable: false };
    }

    let finalMultiplier = 1.0;
    let isApplicable = true;
    const baseScore = strategy.baseScore || 100;
    const activeFilterKeys = [];
    
    // Get preference filters
    if (state.preferences) {
      Object.entries(state.preferences).forEach(([key, value]) => {
        if (value !== 0) {
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
      }
    });

    // Calculate raw score
    const rawScore = baseScore * finalMultiplier;
    return {
      ...strategy,
      rawScore,
      isApplicable,
      hasFilters: activeFilterKeys.length > 0
    };
  });

  // Split into applicable and non-applicable for separate processing
  const applicableStrategies = scoredStrategies.filter(s => s.isApplicable);
  const nonApplicableStrategies = scoredStrategies.filter(s => !s.isApplicable);
  
  // Basic check - do we have any filters applied?
  const hasFilters = applicableStrategies.some(s => s.hasFilters);
  
  let finalStrategies = [];
  
  if (hasFilters && applicableStrategies.length > 0) {
    // We have filters and applicable strategies - do proper ranking
    
    // Find min and max for scaling (but ensure a reasonable range)
    let minScore = Math.min(...applicableStrategies.map(s => s.rawScore));
    let maxScore = Math.max(...applicableStrategies.map(s => s.rawScore));
    
    // Avoid identical min/max
    if (minScore === maxScore) {
      // If only one score, put it in the middle (75)
      minScore = maxScore * 0.5;
    }
    
    // Apply scaling to maintain ranking order
    const scaledApplicable = applicableStrategies.map(strategy => {
      let normalizedScore;
      
      if (maxScore === minScore) {
        normalizedScore = 75; // Middle of scale if all are equal
      } else {
        // Scale to 25-95 range to maintain significant differences
        // but avoid too many at the extreme high end
        normalizedScore = 25 + ((strategy.rawScore - minScore) / (maxScore - minScore)) * 70;
      }
      
      // Round to whole number
      const matchScore = Math.round(normalizedScore);
      
      return {
        ...strategy,
        matchScore
      };
    });
    
    // Non-applicable always get 0
    const scoredNonApplicable = nonApplicableStrategies.map(strategy => ({
      ...strategy,
      matchScore: 0
    }));
    
    finalStrategies = [...scaledApplicable, ...scoredNonApplicable];
  } else {
    // If no filters are applied, give all applicable strategies a default score
    finalStrategies = scoredStrategies.map(strategy => ({
      ...strategy,
      matchScore: strategy.isApplicable ? 65 : 0
    }));
  }

  // Sort the strategies
  return finalStrategies.sort((a, b) => {
    // First sort by applicability
    if (a.isApplicable !== b.isApplicable) return a.isApplicable ? -1 : 1;
    // Then by match score
    return b.matchScore - a.matchScore;
  });
}
