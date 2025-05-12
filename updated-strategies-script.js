Promise.all([
    fetch('strategies.json').then(res => res.json()),
    fetch('preferences.json').then(res => res.json())
  ]).then(([strategiesData, preferenceConfigs]) => {

    const ipRightsOptions = [
      { id: 'Patent', label: 'Patents', color: 'patent' },
      { id: 'Trade mark', label: 'Trade marks', color: 'trademark' },
      { id: 'Design', label: 'Design rights', color: 'design' },
      { id: 'PBR', label: 'Plant breeder\'s rights', color: 'pbr' },
      { id: 'Copyright', label: 'Copyright', color: 'copyright' },
      { id: 'Any', label: 'Any IP right', color: 'any' }
    ];

    const situationOptions = [
      { id: 'Accused', label: 'I\'ve been accused of infringing' },
      { id: 'Enforcement', label: 'I believe my IP has been infringed' },
      { id: 'Proactive', label: 'I\'m proactively protecting my IP' },
      { id: 'Professional', label: 'I\'m seeking support of an IP professional' }
    ];

    function IPStrategyFinder() {
      // Get only the primary filters from localStorage (rights and situations)
      const savedState = JSON.parse(localStorage.getItem('ipStrategyState')) || {};
      
      const state = {
        loading: true,
        strategies: strategiesData,
        filteredStrategies: [],
        accordions: savedState.accordions || { preferences: true, otherFactors: true },
        selectedRights: savedState.selectedRights || ['Trade mark'],
        selectedSituations: savedState.selectedSituations || ['Enforcement'],
        // Don't load preferences and otherFactors from localStorage - always start fresh
        preferences: {
          timeCommitment: 0,
          investment: 0,
          commercialAgreements: 0,
          thirdPartyServices: 0,
          legalAction: 0
        },
        otherFactors: {
          onlineMarkets: 'neutral',
          domainName: 'neutral',
          importingGoods: 'neutral',
          identifyParty: 'neutral'
        }
      };

      function init() {
        state.loading = false;
        filterAndRankStrategies();
        render();
      }

      function filterAndRankStrategies() {
        let filtered = state.strategies.slice();

        if (state.selectedRights.length > 0) {
          filtered = filtered.filter(strategy => {
            const strategyRights = strategy.right.split('; ');
            return state.selectedRights.some(right =>
              strategyRights.includes(right) ||
              strategyRights.includes('Any') ||
              strategyRights.includes('Any IP right')
            );
          });
        }

        if (state.selectedSituations.length > 0) {
          filtered = filtered.filter(strategy =>
            state.selectedSituations.some(situation =>
              strategy.responseType.includes(situation)
            )
          );
        }

        state.filteredStrategies = filtered.map(strategy => {
          let totalScore = 0;
          let totalWeight = 0;

          function calculateMatch(prefKey, userValue, strategyValue) {
            if (userValue === 0) return { score: 0, weight: 0 };
            const config = preferenceConfigs[prefKey];
            const max = Math.max(...config.options.map(opt => Math.abs(opt.value)));
            const weight = Math.abs(userValue) / max;
            const expected = (userValue > 0 ? userValue / max * 10 : 0);
            const score = userValue > 0 ? Math.max(0, 10 - Math.abs(expected - strategyValue)) : Math.max(0, 10 - strategyValue);
            return { score, weight };
          }

          ['timeCommitment', 'investment', 'commercialAgreements', 'thirdPartyServices', 'legalAction'].forEach(key => {
            const { score, weight } = calculateMatch(key, state.preferences[key], strategy.scores[key]);
            totalScore += score * weight;
            totalWeight += weight;
          });

          const matchScore = totalWeight > 0 ? (totalScore / (totalWeight * 10)) * 100 : 100;
          return { ...strategy, matchScore };
        }).sort((a, b) => b.matchScore - a.matchScore);
      }

      // Create a dynamic title based on selected situation and IP right
      function createDynamicTitle() {
        const situationMap = {
          'Enforcement': 'enforce',
          'Accused': 'respond to accusations about',
          'Proactive': 'proactively protect',
          'Professional': 'seek professional support for'
        };
        
        let action = 'manage'; // Default
        if (state.selectedSituations.length === 1) {
          action = situationMap[state.selectedSituations[0]];
        }
        
        let right = 'intellectual property';
        if (state.selectedRights.length === 1) {
          right = `a ${state.selectedRights[0].toLowerCase()}`;
        } else if (state.selectedRights.length > 1) {
          right = 'multiple IP rights';
        }
        
        return `Strategies to ${action} ${right}`;
      }

      function render() {
        // Only save primary filters to localStorage
        localStorage.setItem('ipStrategyState', JSON.stringify({
          accordions: state.accordions,
          selectedRights: state.selectedRights,
          selectedSituations: state.selectedSituations
          // Do not save preferences or otherFactors
        }));

        const app = document.getElementById('app');
        app.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'grid';

        const leftCol = document.createElement('div');
        leftCol.appendChild(renderTopFilters()); // Add top filters outside accordions
        leftCol.appendChild(renderPreferencesAccordion());
        leftCol.appendChild(renderOtherFactorsAccordion());
        container.appendChild(leftCol);

        const rightCol = document.createElement('div');
        rightCol.appendChild(renderActiveFilters()); // Contains title and clear button
        rightCol.appendChild(renderStrategyCards());
        container.appendChild(rightCol);

        app.appendChild(container);
      }

      // New top filters section outside of accordions
      function renderTopFilters() {
        const topFilters = document.createElement('div');
        topFilters.className = 'top-filters';
        topFilters.style.marginBottom = '20px';
        
        // Add filter title
        const title = document.createElement('div');
        title.className = 'filters-section-title';
        title.textContent = 'Quick Filters';
        topFilters.appendChild(title);
        
        // Create quick filter options
        const options = [
          { label: 'Low Cost', action: () => { state.preferences.investment = -2; } },
          { label: 'Quick Resolution', action: () => { state.preferences.timeCommitment = -2; } },
          { label: 'Avoid Legal Action', action: () => { state.preferences.legalAction = -2; } },
          { label: 'Self Managed', action: () => { state.preferences.thirdPartyServices = -2; } }
        ];
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'radio-group';
        buttonsContainer.style.marginBottom = '16px';
        
        options.forEach(option => {
          const button = document.createElement('button');
          button.className = 'radio-button';
          button.textContent = option.label;
          button.onclick = () => {
            option.action();
            filterAndRankStrategies();
            render();
          };
          buttonsContainer.appendChild(button);
        });
        
        topFilters.appendChild(buttonsContainer);
        return topFilters;
      }

      function renderActiveFilters() {
        const filtersWrapper = document.createElement('div');
        
        // Create dynamic title and clear button container
        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.justifyContent = 'space-between';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.marginBottom = '20px';
        
        // Create title based on selected rights and situation
        const titleElement = document.createElement('h2');
        titleElement.className = 'page-title';
        titleElement.textContent = createDynamicTitle();
        titleContainer.appendChild(titleElement);
        
        // Add Clear All Filters button
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Clear All Filters';
        resetBtn.className = 'reset-button';
        resetBtn.onclick = () => {
          // Reset all non-primary filters
          state.preferences = {
            timeCommitment: 0,
            investment: 0,
            commercialAgreements: 0,
            thirdPartyServices: 0,
            legalAction: 0
          };
          state.otherFactors = {
            onlineMarkets: 'neutral',
            domainName: 'neutral',
            importingGoods: 'neutral',
            identifyParty: 'neutral'
          };
          filterAndRankStrategies();
          render();
        };
        titleContainer.appendChild(resetBtn);
        
        filtersWrapper.appendChild(titleContainer);
        
        // Create secondary filters section (if any exist)
        const hasSecondaryFilters = Object.values(state.preferences).some(v => v !== 0) || 
                                  Object.values(state.otherFactors).some(v => v !== 'neutral');
        
        if (hasSecondaryFilters) {
          const secondaryFiltersTitle = document.createElement('div');
          secondaryFiltersTitle.className = 'filters-section-title';
          secondaryFiltersTitle.textContent = 'Active Filters';
          filtersWrapper.appendChild(secondaryFiltersTitle);
          
          const secondaryFiltersContainer = document.createElement('div');
          secondaryFiltersContainer.className = 'active-filters';
          
          // Add preference filters
          Object.entries(state.preferences).forEach(([key, value]) => {
            if (value !== 0) {
              const config = preferenceConfigs[key];
              const opt = config.options.find(o => o.value === value);
              const pill = document.createElement('div');
              pill.className = 'filter-pill';
              pill.textContent = `${config.label}: ${opt.label}`;
              const remove = document.createElement('span');
              remove.className = 'filter-remove';
              remove.textContent = '×';
              remove.onclick = () => {
                state.preferences[key] = 0;
                filterAndRankStrategies();
                render();
              };
              pill.appendChild(remove);
              secondaryFiltersContainer.appendChild(pill);
            }
          });
          
          // Add other factors filters
          Object.entries(state.otherFactors).forEach(([key, value]) => {
            if (value !== 'neutral') {
              const labelMap = {
                onlineMarkets: 'Online marketplaces',
                domainName: 'Domain name issues',
                importingGoods: 'Importing goods',
                identifyParty: 'Identify party'
              };
              const pill = document.createElement('div');
              pill.className = 'filter-pill';
              pill.textContent = `${labelMap[key]}: ${value}`;
              const remove = document.createElement('span');
              remove.className = 'filter-remove';
              remove.textContent = '×';
              remove.onclick = () => {
                state.otherFactors[key] = 'neutral';
                filterAndRankStrategies();
                render();
              };
              pill.appendChild(remove);
              secondaryFiltersContainer.appendChild(pill);
            }
          });
          
          filtersWrapper.appendChild(secondaryFiltersContainer);
        }
        
        return filtersWrapper;
      }

      function renderPreferencesAccordion() {
        const wrapper = document.createElement('div');

        const toggle = document.createElement('div');
        toggle.className = 'accordion-header';
        toggle.style.cursor = 'pointer';
        toggle.style.transition = 'all 0.3s ease';
        toggle.innerHTML = '<span class="accordion-arrow" style="display:inline-block; transition: transform 0.3s ease; transform: ' + (state.accordions.preferences ? 'rotate(90deg)' : 'rotate(0deg)') + ';">▶</span> Preferences';
        toggle.onclick = () => {
          state.accordions.preferences = !state.accordions.preferences;
          render();
        };
        wrapper.appendChild(toggle);

        if (!state.accordions.preferences) return wrapper;

        const accordion = document.createElement('div');
        accordion.className = 'accordion';

        Object.entries(preferenceConfigs).forEach(([key, config]) => {
          const group = document.createElement('div');
          group.className = 'preference-group';

          const label = document.createElement('label');
          label.className = 'preference-label';
          label.textContent = config.label;
          group.appendChild(label);

          const radioGroup = document.createElement('div');
          radioGroup.className = 'radio-group';
          config.options.forEach(opt => {
            const radio = document.createElement('label');
            radio.className = 'radio-button';
            if (state.preferences[key] === opt.value) {
              radio.classList.add('radio-selected');
            }
            radio.textContent = opt.label;
            radio.onclick = () => {
              state.preferences[key] = state.preferences[key] === opt.value ? 0 : opt.value;
              filterAndRankStrategies();
              render();
            };
            radioGroup.appendChild(radio);
          });
          group.appendChild(radioGroup);
          accordion.appendChild(group);
        });

        wrapper.appendChild(accordion);
        return wrapper;
      }

      function renderOtherFactorsAccordion() {
        const wrapper = document.createElement('div');

        const toggle = document.createElement('div');
        toggle.className = 'accordion-header';
        toggle.innerHTML = '<span class="accordion-arrow" style="display:inline-block; transition: transform 0.3s ease; transform: ' + (state.accordions.otherFactors ? 'rotate(90deg)' : 'rotate(0deg)') + ';">▶</span> Other Factors';
        toggle.onclick = () => {
          state.accordions.otherFactors = !state.accordions.otherFactors;
          render();
        };
        wrapper.appendChild(toggle);

        if (!state.accordions.otherFactors) return wrapper;

        const factors = [
          { key: 'onlineMarkets', label: 'Online marketplaces' },
          { key: 'domainName', label: 'Domain name issues' },
          { key: 'importingGoods', label: 'Importing goods' },
          { key: 'identifyParty', label: 'Identify party' }
        ];

        factors.forEach(({ key, label }) => {
          const group = document.createElement('div');
          group.className = 'preference-group';

          const groupLabel = document.createElement('label');
          groupLabel.className = 'preference-label';
          groupLabel.textContent = label;
          group.appendChild(groupLabel);

          const radioGroup = document.createElement('div');
          radioGroup.className = 'radio-group';

          ['yes', 'no', 'unsure'].forEach(option => {
            const radio = document.createElement('label');
            radio.className = 'radio-button';
            if (state.otherFactors[key] === option) {
              radio.classList.add('radio-selected');
            }
            radio.textContent = option.charAt(0).toUpperCase() + option.slice(1);
            radio.onclick = () => {
              state.otherFactors[key] = state.otherFactors[key] === option ? 'neutral' : option;
              filterAndRankStrategies();
              render();
            };
            radioGroup.appendChild(radio);
          });

          group.appendChild(radioGroup);
          wrapper.appendChild(group);
        });

        return wrapper;
      }

      function renderStrategyCards() {
        const list = document.createElement('div');
        list.className = 'card-grid';

        const activePrefs = Object.values(state.preferences).filter(v => v !== 0).length;
        const activeFactors = Object.values(state.otherFactors).filter(v => v !== 'neutral').length;
        const showUnknown = (activePrefs + activeFactors) < 2;

        state.filteredStrategies.forEach((strategy, index) => {
          const card = document.createElement('div');
          card.className = 'strategy-card';
          card.style.opacity = '0';
          card.style.transition = 'transform 0.6s ease, opacity 0.6s ease';
          setTimeout(() => { card.style.opacity = '1'; }, 50);

          // Change default relevancy from "Unknown" to "Possibly"
          let matchLabel = 'Possibly';
          let relevanceClass = 'medium'; // mid-green
          const score = strategy.matchScore;
          
          if (!showUnknown) {
            if (score >= 90) { matchLabel = 'Highly Likely'; relevanceClass = 'very-high'; }
            else if (score >= 75) { matchLabel = 'Likely'; relevanceClass = 'high'; }
            else if (score >= 50) { matchLabel = 'Possibly'; relevanceClass = 'medium'; }
            else if (score >= 25) { matchLabel = 'Unlikely'; relevanceClass = 'low'; }
            else { matchLabel = 'Probably Not-Applicable'; relevanceClass = 'very-low'; }
          }
          
          // Apply the relevancy border color
          card.classList.add(`border-${relevanceClass}`);

          // Include description but hide time and cost tags (still used for filtering)
          card.innerHTML = `
            <div class="relevancy">
              <span class="relevancy-label">Applicability:</span>
              <span class="relevancy-badge ${relevanceClass}">${matchLabel}</span>
            </div>
            <div class="strategy-overtitle">${strategy.overtitle}</div>
            <h3 class="strategy-title">${strategy.title}</h3>
            <p class="strategy-description">${strategy.description}</p>
            <div class="strategy-metadata">
              <div class="metadata-row">
                <span>IP Type:</span>
                <div>
                  ${strategy.right.split('; ').map(right => {
                    const rightClass = right.toLowerCase().replace(/\s/g, '');
                    return `<span class="tag tag-${rightClass}">${right}</span>`;
                  }).join(' ')}
                </div>
              </div>
            </div>
          `;
          list.appendChild(card);
        });

        return list;
      }

      return { init };
    }

    const app = IPStrategyFinder();
    app.init();

    // Add "Change IP Rights" link
    const changeIPRightsLink = document.createElement('a');
    changeIPRightsLink.href = 'index.html';
    changeIPRightsLink.textContent = 'Start Over with Different IP Rights';
    changeIPRightsLink.style.color = 'var(--text-secondary)';
    changeIPRightsLink.style.textDecoration = 'none';
    changeIPRightsLink.style.fontSize = '14px';
    changeIPRightsLink.style.display = 'inline-block';
    changeIPRightsLink.style.marginTop = '20px';
    changeIPRightsLink.style.marginBottom = '20px';

    // Add to page above the app
    document.getElementById('app').before(changeIPRightsLink);
    
  }).catch(err => {
    console.error('Error loading data:', err);
    document.getElementById('app').textContent = 'Failed to load data.';
  });
