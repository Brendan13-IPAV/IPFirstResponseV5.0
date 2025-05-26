export function calculateStrategyScores(strategies, state) {
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
    // Strategy IDs are 1-based, but arrays are 0-indexed
    const index = parseInt(strategy.id, 10) - 1;
    if (index < 0) {
      return { ...strategy, rawScore: 0, isApplicable: false };
    }

    let finalMultiplier = 1.0;
    let isApplicable = true;
    const baseScore = strategy.baseScore || 100;
    const activeFilters = [];
    
    // Helper function to collect filters from config sections
    const collectFilters = (stateSection, configPath) => {
      if (!stateSection) return;
      
      Object.entries(stateSection).forEach(([key, value]) => {
        // Check if this filter has a non-default value
        const hasValue = (configPath.includes('preferences') && value !== 0) ||
                        (configPath.includes('otherFactors') && value !== 'neutral') ||
                        (!configPath.includes('preferences') && !configPath.includes('otherFactors') && value);
        
        if (hasValue) {
          // Navigate to the config section
          let config = window.preferenceConfigs;
          for (const pathSegment of configPath) {
            config = config?.[pathSegment];
          }
          config = config?.[key];
          
          if (config) {
            const option = config.options.find(opt => opt.value === value);
            if (option) {
              activeFilters.push({
                scoringValues: option.scoringValues,
                label: option.pillLabel || option.label || `${key}-${value}`
              });
            }
          }
        }
      });
    };
    
    // Collect filters from all sections
    collectFilters(state.preferences, ['filters']);
    collectFilters(state.otherFactors, ['otherFactors']);
    
    // For situation-specific filters, we need to check each selected situation
    if (state.situationSpecificFilters) {
      Object.entries(state.situationSpecificFilters).forEach(([key, value]) => {
        if (value) {
          for (const situation of state.selectedSituations || []) {
            const situationConfig = window.preferenceConfigs?.situationSpecific?.[situation]?.[key];
            if (situationConfig) {
              const option = situationConfig.options.find(opt => opt.value === value);
              if (option) {
                activeFilters.push({
                  scoringValues: option.scoringValues,
                  label: option.pillLabel || option.label || `${situation}-${key}-${value}`
                });
                break; // Found config for this situation, don't check others
              }
            }
          }
        }
      });
    }
    
    // For IP-type specific filters, we need to check each selected IP type
    if (state.ipTypeSpecificFilters) {
      Object.entries(state.ipTypeSpecificFilters).forEach(([key, value]) => {
        if (value) {
          for (const ipType of state.selectedRights || []) {
            const ipTypeConfig = window.preferenceConfigs?.ipTypeSpecific?.[ipType]?.[key];
            if (ipTypeConfig) {
              const option = ipTypeConfig.options.find(opt => opt.value === value);
              if (option) {
                activeFilters.push({
                  scoringValues: option.scoringValues,
                  label: option.pillLabel || option.label || `${ipType}-${key}-${value}`
                });
                break; // Found config for this IP type, don't check others
              }
            }
          }
        }
      });
    }

    // Apply filter multipliers
    activeFilters.forEach(filter => {
      let multiplier = 1; // Default multiplier
      
      if (filter.scoringValues && Array.isArray(filter.scoringValues)) {
        // If index is within bounds, use the actual value
        if (index >= 0 && index < filter.scoringValues.length) {
          const arrayValue = filter.scoringValues[index];
          // Use the array value if it's not undefined/null, otherwise default to 1
          multiplier = (arrayValue !== undefined && arrayValue !== null) ? arrayValue : 1;
        }
        // If index is out of bounds, multiplier stays 1 (default)
      }
      // If no scoringValues array, multiplier stays 1 (default)
      
      finalMultiplier *= multiplier;
      
      // If multiplier is 0, mark strategy as not applicable
      if (multiplier === 0) {
        isApplicable = false;
      }
    });

    // Calculate raw score
    const rawScore = baseScore * finalMultiplier;
    return {
      ...strategy,
      rawScore,
      isApplicable,
      hasFilters: activeFilters.length > 0
    };
  });

  // Split into applicable and non-applicable
  const applicableStrategies = scoredStrategies.filter(s => s.isApplicable);
  const nonApplicableStrategies = scoredStrategies.filter(s => !s.isApplicable);
  
  // Check if we have any filters applied
  const hasFilters = applicableStrategies.some(s => s.hasFilters);
  
  let finalStrategies = [];
  
  if (hasFilters && applicableStrategies.length > 0) {
    // Sort applicable strategies by raw score (descending)
    const sortedApplicable = [...applicableStrategies].sort((a, b) => b.rawScore - a.rawScore);
    
    // We'll use a relative ranking approach for a more balanced distribution
    // This gives a better spread regardless of how many strategies we have
    
    const totalApplicable = sortedApplicable.length;
    
    // Adaptive thresholds based on total number of strategies
    // This ensures we have reasonable numbers in each category
    const veryHighThreshold = Math.max(1, Math.ceil(totalApplicable * 0.15)); // ~15% in very high
    const highThreshold = Math.max(2, Math.ceil(totalApplicable * 0.30));     // ~30% in high
    const mediumThreshold = Math.max(3, Math.ceil(totalApplicable * 0.50));   // ~50% in medium
    // Remainder will be in low category
    
    const scoredApplicable = sortedApplicable.map((strategy, index) => {
      let matchScore;
      
      // Assign scores based on relative position
      if (index < veryHighThreshold) {
        // Very high category (90-100)
        // Spread evenly within this category
        const position = index / veryHighThreshold;
        matchScore = Math.round(100 - (position * 10));
      } else if (index < highThreshold) {
        // High category (75-89)
        const positionInCategory = (index - veryHighThreshold) / (highThreshold - veryHighThreshold);
        matchScore = Math.round(89 - (positionInCategory * 14));
      } else if (index < mediumThreshold) {
        // Medium category (50-74)
        const positionInCategory = (index - highThreshold) / (mediumThreshold - highThreshold);
        matchScore = Math.round(74 - (positionInCategory * 24));
      } else {
        // Low category (25-49)
        const positionInCategory = (index - mediumThreshold) / (totalApplicable - mediumThreshold);
        matchScore = Math.round(49 - (positionInCategory * 24));
        // Ensure no applicable strategy gets below 25
        matchScore = Math.max(25, matchScore);
      }
      
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
    
    finalStrategies = [...scoredApplicable, ...scoredNonApplicable];
  } else {
    // If no filters are applied, give all applicable strategies a default medium score
    finalStrategies = scoredStrategies.map(strategy => ({
      ...strategy,
      matchScore: strategy.isApplicable ? 65 : 0
    }));
  }

  // Sort the strategies - first by match score since we've already done our ranking
  return finalStrategies.sort((a, b) => b.matchScore - a.matchScore);
}
