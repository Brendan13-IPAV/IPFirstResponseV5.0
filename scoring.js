export function calculateStrategyScores(strategies, state) {
  // First, filter out strategies with "Not Assigned" IDs
const assignedStrategies = strategies.filter(strategy => 
  strategy.id !== "Not Assigned"
);
  // Then, pre-filter strategies by selected IP rights and situations
const filteredByRightType = assignedStrategies.filter(strategy => {

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

  // Now calculate scores for pre-filtered strategies
  const scoredStrategies = filteredByRightType.map(strategy => {
    // Strategy IDs are 1-based, but arrays are 0-indexed
    const strategyIndex = parseInt(strategy.id, 10) - 1;
    if (strategyIndex < 0) {
      return { ...strategy, rawScore: 0, isApplicable: false, matchScore: 0 };
    }

    let finalMultiplier = 1.0;
    let isApplicable = true;
    const baseScore = strategy.baseScore || 100;
    
    // Get active filters from state.filterSelections
    if (state.filterSelections) {
      Object.entries(state.filterSelections).forEach(([filterKey, selectedIndex]) => {
        // Get the filter config from preferences
        const filterConfig = window.preferenceConfigs?.filters?.[filterKey];
        
        if (filterConfig && filterConfig.options && filterConfig.options[selectedIndex]) {
          const selectedOption = filterConfig.options[selectedIndex];
          
          // Get the scoring values for this option
          if (selectedOption.scoringValues && Array.isArray(selectedOption.scoringValues)) {
            let multiplier = 1; // Default
            
            // If strategy index is within the scoring array bounds
            if (strategyIndex < selectedOption.scoringValues.length) {
              const arrayValue = selectedOption.scoringValues[strategyIndex];
              // Use the array value if it's not undefined/null, otherwise default to 1
              multiplier = (arrayValue !== undefined && arrayValue !== null) ? arrayValue : 1;
            }
            // If strategy index is out of bounds, multiplier stays 1
            
            finalMultiplier *= multiplier;
            
            // If any multiplier is 0, mark strategy as not applicable
            if (multiplier === 0) {
              isApplicable = false;
            }
          }
        }
      });
    }

    // Calculate raw score
    const rawScore = baseScore * finalMultiplier;
    
    return {
      ...strategy,
      rawScore,
      isApplicable,
      hasFilters: Object.keys(state.filterSelections || {}).length > 0
    };
  });

  // Split into applicable and non-applicable
  const applicableStrategies = scoredStrategies.filter(s => s.isApplicable);
  const nonApplicableStrategies = scoredStrategies.filter(s => !s.isApplicable);
  
  // Check if we have any filters applied
  const hasFilters = Object.keys(state.filterSelections || {}).length > 0;
  
  let finalStrategies = [];
  
  if (hasFilters && applicableStrategies.length > 0) {
    // Sort applicable strategies by raw score (descending)
    const sortedApplicable = [...applicableStrategies].sort((a, b) => b.rawScore - a.rawScore);
    
    const totalApplicable = sortedApplicable.length;
    
    // Adaptive thresholds based on total number of strategies
    const veryHighThreshold = Math.max(1, Math.ceil(totalApplicable * 0.15)); // ~15% in very high
    const highThreshold = Math.max(2, Math.ceil(totalApplicable * 0.30));     // ~30% in high
    const mediumThreshold = Math.max(3, Math.ceil(totalApplicable * 0.50));   // ~50% in medium
    
    const scoredApplicable = sortedApplicable.map((strategy, index) => {
      let matchScore;
      
      // Assign scores based on relative position
      if (index < veryHighThreshold) {
        // Very high category (90-100)
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
        matchScore = Math.max(25, matchScore); // Ensure no applicable strategy gets below 25
      }
      
      return { ...strategy, matchScore };
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

  // Sort by match score (descending)
  return finalStrategies.sort((a, b) => b.matchScore - a.matchScore);
}
