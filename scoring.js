export function calculateStrategyScores(strategies, state, scoringMatrix) {
  const idIndexMap = scoringMatrix.ID_Index_Map;

  console.log("Selected IP rights:", state.selectedRights);

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
  
  console.log(`Pre-filtered from ${strategies.length} to ${filteredByRightType.length} strategies based on IP rights and situation`);

  // Calculate raw scores for all strategies
  const scoredStrategies = filteredByRightType.map(strategy => {
    const index = idIndexMap.indexOf(parseInt(strategy.id, 10));
    if (index === -1) {
      console.error(`Strategy ID ${strategy.id} not found in scoring matrix`);
      return { ...strategy, rawScore: 0, isApplicable: false };
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

    // Calculate raw score - but preserve the base score if no filters are applied
    const rawScore = activeFilterKeys.length > 0 ? baseScore * finalMultiplier : baseScore;

    return {
      ...strategy,
      rawScore: isApplicable ? rawScore : 0,
      isApplicable,
      // Store count of filters for adaptive categorization
      filterCount: activeFilterKeys.length
    };
  });

  // Separate applicable and non-applicable strategies
  const applicableStrategies = scoredStrategies.filter(s => s.isApplicable);
  const nonApplicableStrategies = scoredStrategies.filter(s => !s.isApplicable);
  
  // Determine if we need normalization - only normalize if filters are applied
  const hasActiveFilters = applicableStrategies.some(s => s.filterCount > 0);
  
  // Calculate final scores based on whether normalization is needed
  let finalStrategies = [];
  
  if (hasActiveFilters && applicableStrategies.length > 1) {
    // Find min and max scores for normalization (only for applicable strategies)
    let minScore = Math.min(...applicableStrategies.map(s => s.rawScore));
    let maxScore = Math.max(...applicableStrategies.map(s => s.rawScore));
    
    // Avoid division by zero
    const scoreRange = maxScore - minScore;
    const hasRange = scoreRange > 0;
    
    console.log(`Score normalization: min=${minScore}, max=${maxScore}, range=${scoreRange}`);
    
    // Normalize applicable strategies
    const normalizedApplicable = applicableStrategies.map(strategy => {
      let matchScore = 0;
      
      if (hasRange) {
        // Map the raw score to 0-100 range
        matchScore = Math.round(((strategy.rawScore - minScore) / scoreRange) * 100);
      } else {
        // If all applicable strategies have the same score, give them 75
        // This creates a middle tier when all strategies are equally matched
        matchScore = 75;
      }
      
      return {
        ...strategy,
        matchScore
      };
    });
    
    // Add non-applicable strategies with score 0
    finalStrategies = [
      ...normalizedApplicable,
      ...nonApplicableStrategies.map(strategy => ({ ...strategy, matchScore: 0 }))
    ];
  } else {
    // Without active filters or with only one applicable strategy,
    // use a different categorization approach
    finalStrategies = scoredStrategies.map(strategy => {
      // If applicable, assign a fixed high score (but not 100)
      // This prevents everything showing as "Highly Likely" when no filters are applied
      return {
        ...strategy,
        matchScore: strategy.isApplicable ? 75 : 0
      };
    });
  }
  
  // Sort the final strategies
  return finalStrategies.sort((a, b) => {
    // First sort by applicability (applicable strategies first)
    if (a.isApplicable !== b.isApplicable) return a.isApplicable ? -1 : 1;
    // Then sort by match score (higher scores first)
    return b.matchScore - a.matchScore;
  });
}
