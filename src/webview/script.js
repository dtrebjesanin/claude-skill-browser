(function () {
  const vscode = acquireVsCodeApi();
  const container = document.getElementById('skills-container');
  const searchInput = document.getElementById('search');
  const previewPane = document.getElementById('preview-pane');
  const contextMenuEl = document.getElementById('context-menu');

  let allSkills = [];
  let toastTimeout = null;
  let state = { pinnedSkills: [], recentSkills: [], collapsedSections: [], categoryColors: {} };
  let selectedPreviewSkill = null;
  let hasRendered = false;

  // --- Category colors ---

  const AUTO_COLORS = [
    '#6c5ce7', '#0984e3', '#00b894', '#e17055',
    '#d63031', '#e84393', '#00cec9', '#fdcb6e',
    '#636e72', '#a29bfe', '#74b9ff', '#55efc4',
  ];

  const COLOR_PALETTE = [
    '#6c5ce7', '#a29bfe', '#dcd6f7',
    '#8e44ad', '#be2edd', '#e056a0',
    '#0984e3', '#74b9ff', '#a9d4f5',
    '#0652dd', '#1289a7', '#48dbfb',
    '#00b894', '#55efc4', '#b8e994',
    '#009432', '#6ab04c', '#badc58',
    '#00cec9', '#81ecec', '#7efff5',
    '#22a6b3', '#38ada9', '#a3cb38',
    '#e17055', '#fab1a0', '#ffeaa7',
    '#f39c12', '#fdcb6e', '#ffc048',
    '#d63031', '#ff7675', '#ffb8b8',
    '#e84393', '#fd79a8', '#f8a5c2',
    '#2d3436', '#636e72', '#b2bec3',
    '#dfe6e9', '#95afc0', '#778ca3',
    null,
  ];

  const autoColorAssignments = {};
  let autoColorIndex = 0;

  function assignAutoColors(categories) {
    autoColorIndex = 0;
    for (const key of Object.keys(autoColorAssignments)) {
      if (!categories.includes(key)) delete autoColorAssignments[key];
    }
    for (const cat of categories) {
      if (cat === 'Starred' || cat === 'Recently Used') continue;
      if (state.categoryColors[cat]) continue;
      if (!autoColorAssignments[cat]) {
        autoColorAssignments[cat] = AUTO_COLORS[autoColorIndex % AUTO_COLORS.length];
        autoColorIndex++;
      }
    }
  }

  function getCategoryColor(category) {
    if (category === 'Starred' || category === 'Recently Used') return null;
    return state.categoryColors[category] || autoColorAssignments[category] || null;
  }

  // --- Color picker popover ---

  let colorPickerEl = null;

  function showColorPicker(anchorEl, category) {
    hideColorPicker();

    colorPickerEl = document.createElement('div');
    colorPickerEl.className = 'color-picker';

    const currentColor = getCategoryColor(category);

    for (const color of COLOR_PALETTE) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch' + (color === currentColor ? ' active' : '');
      if (color) {
        swatch.style.background = color;
      } else {
        swatch.classList.add('color-swatch-none');
        swatch.textContent = '\u00D7';
      }
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'setCategoryColor', category, color });
        hideColorPicker();
      });
      colorPickerEl.appendChild(swatch);
    }

    const rect = anchorEl.getBoundingClientRect();
    colorPickerEl.style.left = rect.left + 'px';
    // Position above if it would overflow the viewport
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 200) {
      colorPickerEl.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
      colorPickerEl.style.top = (rect.bottom + 4) + 'px';
    }
    document.body.appendChild(colorPickerEl);
  }

  function hideColorPicker() {
    if (colorPickerEl) {
      colorPickerEl.remove();
      colorPickerEl = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (colorPickerEl && !e.target.closest('.color-picker') && !e.target.closest('.category-color-bar')) {
      hideColorPicker();
    }
  });

  // --- Message handling ---

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'skills') {
      allSkills = message.data.sort((a, b) => a.name.localeCompare(b.name));
      render();
    }
    if (message.type === 'state') {
      const prevState = state;
      state = { ...state, ...message.data };

      // First state after webview (re)creation: full render needed
      if (!hasRendered) {
        if (allSkills.length > 0) render();
        return;
      }

      // Color change: CSS-only update
      if (JSON.stringify(prevState.categoryColors) !== JSON.stringify(state.categoryColors)) {
        updateCategoryColors();
      }

      // Pin/unpin: targeted section updates
      if (JSON.stringify(prevState.pinnedSkills) !== JSON.stringify(state.pinnedSkills)) {
        refreshPinnedSection();
      }

      // Recent change: targeted section update
      if (JSON.stringify(prevState.recentSkills) !== JSON.stringify(state.recentSkills)) {
        refreshRecentSection();
      }

      renderPreview();
    }
  });

  // --- Search ---

  searchInput.addEventListener('input', render);

  function getFilteredSkills() {
    const query = searchInput.value.toLowerCase();
    if (!query) return allSkills;
    return allSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query)
    );
  }

  // --- Click handling (delegation) ---

  container.addEventListener('click', (event) => {
    const infoIcon = event.target.closest('.info-icon');
    if (infoIcon) {
      event.stopPropagation();
      const tag = infoIcon.closest('.skill-tag');
      if (tag) {
        const skill = findSkillByName(tag.dataset.name);
        if (skill) {
          selectedPreviewSkill = skill;
          renderPreview();
        }
      }
      return;
    }

    const tag = event.target.closest('.skill-tag');
    if (tag) {
      copySkill(tag.dataset.name, tag.dataset.command);
      tag.classList.add('copied');
      setTimeout(() => tag.classList.remove('copied'), 600);
      return;
    }

    const header = event.target.closest('.collapsible-header');
    if (header) {
      const sectionId = header.dataset.sectionId;
      const section = header.closest('.collapsible-section');
      if (section) section.classList.toggle('collapsed');
      const idx = state.collapsedSections.indexOf(sectionId);
      if (idx >= 0) {
        state.collapsedSections.splice(idx, 1);
      } else {
        state.collapsedSections.push(sectionId);
      }
      vscode.postMessage({ type: 'toggleCollapse', sectionId });
      return;
    }
  });

  // --- Context menu ---

  container.addEventListener('contextmenu', (event) => {
    const tag = event.target.closest('.skill-tag');
    if (!tag) return;
    event.preventDefault();
    const skillName = tag.dataset.name;
    const isPinned = state.pinnedSkills.includes(skillName);

    contextMenuEl.innerHTML = '';

    const copyItem = document.createElement('div');
    copyItem.className = 'context-menu-item';
    copyItem.textContent = 'Copy';
    copyItem.addEventListener('click', () => {
      copySkill(tag.dataset.name, tag.dataset.command);
      hideContextMenu();
    });
    contextMenuEl.appendChild(copyItem);

    const pinItem = document.createElement('div');
    pinItem.className = 'context-menu-item';
    pinItem.textContent = isPinned ? 'Unstar' : 'Star';
    pinItem.addEventListener('click', () => {
      vscode.postMessage({ type: isPinned ? 'unpin' : 'pin', skillName });
      togglePin(skillName, isPinned);
      refreshPinnedSection();
      refreshRecentSection();
      renderPreview();
      hideContextMenu();
    });
    contextMenuEl.appendChild(pinItem);

    contextMenuEl.style.left = event.clientX + 'px';
    contextMenuEl.style.top = event.clientY + 'px';
    contextMenuEl.style.display = 'block';
  });

  document.addEventListener('click', hideContextMenu);
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('.skill-tag')) hideContextMenu();
  });

  function hideContextMenu() {
    contextMenuEl.style.display = 'none';
  }

  // --- Preview pane ---

  previewPane.addEventListener('click', (event) => {
    const btn = event.target.closest('.preview-btn-copy');
    if (btn && selectedPreviewSkill) {
      copySkill(selectedPreviewSkill.name, selectedPreviewSkill.slashCommand);
      return;
    }

    const starBtn = event.target.closest('.preview-btn-star');
    if (starBtn && selectedPreviewSkill) {
      const skillName = selectedPreviewSkill.name;
      const isPinned = state.pinnedSkills.includes(skillName);
      vscode.postMessage({ type: isPinned ? 'unpin' : 'pin', skillName });
      togglePin(skillName, isPinned);
      refreshPinnedSection();
      refreshRecentSection();
      renderPreview();
      return;
    }

    const closeBtn = event.target.closest('.preview-close');
    if (closeBtn) {
      selectedPreviewSkill = null;
      renderPreview();
      return;
    }
  });

  function renderPreview() {
    if (!selectedPreviewSkill) {
      previewPane.style.display = 'none';
      return;
    }

    previewPane.style.display = '';
    const skill = selectedPreviewSkill;
    const isPinned = state.pinnedSkills.includes(skill.name);

    previewPane.innerHTML =
      '<div class="preview-content">' +
      '<button class="preview-close">\u00D7</button>' +
      '<div class="preview-name">' + escapeHtml(skill.slashCommand) + '</div>' +
      '<div class="preview-description">' + escapeHtml(skill.description) + '</div>' +
      '<div class="preview-source">' + escapeHtml(skill.source) + '</div>' +
      '<div class="preview-actions">' +
      '<button class="preview-btn preview-btn-copy">Copy to Clipboard</button>' +
      '<button class="preview-btn preview-btn-star">' + (isPinned ? '\u2605 Unstar' : '\u2606 Star') + '</button>' +
      '</div>' +
      '</div>';
  }

  // --- State helpers ---

  function togglePin(skillName, wasPinned) {
    if (wasPinned) {
      state.pinnedSkills = state.pinnedSkills.filter((s) => s !== skillName);
    } else {
      if (!state.pinnedSkills.includes(skillName)) {
        state.pinnedSkills.push(skillName);
      }
    }
  }

  function copySkill(skillName, slashCommand) {
    vscode.postMessage({ type: 'copy', slashCommand, skillName });
    state.recentSkills = [
      skillName,
      ...state.recentSkills.filter((s) => s !== skillName),
    ].slice(0, 8);
    showToast(slashCommand);
    refreshRecentSection();
  }

  // --- Targeted section updates ---

  function refreshRecentSection() {
    const filteredNames = new Set(getFilteredSkills().map((s) => s.name));
    const recentNames = state.recentSkills;
    const recentSkills = resolveSkillNames(recentNames, filteredNames);

    if (recentSkills.length > 0) {
      const section = buildCollapsibleSection('recent', 'Recently Used', recentSkills, 0, undefined, false);
      updateSection('recent', section);
    } else {
      removeSection('recent');
    }
  }

  function refreshPinnedSection() {
    const filteredNames = new Set(getFilteredSkills().map((s) => s.name));
    const pinnedSkills = resolveSkillNames(state.pinnedSkills, filteredNames);

    if (pinnedSkills.length > 0) {
      const section = buildCollapsibleSection('pinned', 'Starred', pinnedSkills, 0, undefined, false);
      updateSection('pinned', section);
    } else {
      removeSection('pinned');
    }
  }

  function updateCategoryColors() {
    const catSections = container.querySelectorAll('[data-section-id^="cat:"]');
    for (const section of catSections) {
      const id = section.dataset.sectionId;
      const category = id.slice(4);
      const color = getCategoryColor(category);
      const colorBar = section.querySelector('.category-color-bar');
      if (colorBar) {
        colorBar.style.background = color || '';
      }
      const header = section.querySelector('.collapsible-header');
      if (header) {
        header.style.setProperty('--category-color', color || '');
      }
      const tags = section.querySelectorAll('.skill-tag');
      for (const tag of tags) {
        tag.style.borderColor = color || '';
      }
    }
  }

  function updateSection(id, newSection) {
    const existing = container.querySelector('[data-section-id="' + id + '"]');
    if (existing) {
      existing.replaceWith(newSection);
    } else {
      insertSectionInOrder(id, newSection);
    }
  }

  function removeSection(id) {
    const existing = container.querySelector('[data-section-id="' + id + '"]');
    if (existing) existing.remove();
  }

  function insertSectionInOrder(id, section) {
    // Order: pinned → recent → skill-count → categories
    const order = ['pinned', 'recent'];
    const myIdx = order.indexOf(id);

    if (myIdx >= 0) {
      // Find the first element that should come after this one
      for (let i = myIdx + 1; i < order.length; i++) {
        const after = container.querySelector('[data-section-id="' + order[i] + '"]');
        if (after) {
          container.insertBefore(section, after);
          return;
        }
      }
      // Insert before skill-count
      const skillCount = container.querySelector('.skill-count');
      if (skillCount) {
        container.insertBefore(section, skillCount);
        return;
      }
    }

    // Fallback: append before first category or at end
    const firstCat = container.querySelector('[data-section-id^="cat:"]');
    if (firstCat) {
      container.insertBefore(section, firstCat);
    } else {
      container.appendChild(section);
    }
  }

  // --- Full render (initial load, search, refresh) ---

  function render() {
    container.innerHTML = '';
    const animate = !hasRendered;
    const filtered = getFilteredSkills();
    const filteredNames = new Set(filtered.map((s) => s.name));

    if (filtered.length === 0 && state.pinnedSkills.length === 0 && state.recentSkills.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-icon">/</div>' +
        '<div class="empty-text">No skills found</div>' +
        '</div>';
      return;
    }

    // Pinned section
    const pinnedSkills = resolveSkillNames(state.pinnedSkills, filteredNames);

    if (pinnedSkills.length > 0) {
      const section = buildCollapsibleSection('pinned', 'Starred', pinnedSkills, 0, undefined, animate);
      container.appendChild(section);
    }

    // Recently Used section
    const recentNames = state.recentSkills;
    const recentSkills = resolveSkillNames(recentNames, filteredNames);

    if (recentSkills.length > 0) {
      const section = buildCollapsibleSection('recent', 'Recently Used', recentSkills, 1, undefined, animate);
      container.appendChild(section);
    }

    // Skill count
    const countEl = document.createElement('div');
    countEl.className = 'skill-count';
    countEl.textContent = filtered.length + ' skill' + (filtered.length !== 1 ? 's' : '');
    container.appendChild(countEl);

    // Category grid
    const groups = {};
    for (const skill of filtered) {
      if (!groups[skill.category]) groups[skill.category] = [];
      groups[skill.category].push(skill);
    }

    const sortedCategories = Object.keys(groups).sort();
    assignAutoColors(sortedCategories);
    const offset = (pinnedSkills.length > 0 ? 1 : 0) + (recentSkills.length > 0 ? 1 : 0);

    for (let i = 0; i < sortedCategories.length; i++) {
      const category = sortedCategories[i];
      const color = getCategoryColor(category);
      const sectionId = 'cat:' + category;
      const section = buildCollapsibleSection(sectionId, category, groups[category], i + offset, color, animate);
      container.appendChild(section);
    }

    hasRendered = true;
  }

  // --- Build helpers ---

  function buildCollapsibleSection(id, label, skills, animIdx, color, animate) {
    const section = document.createElement('div');
    section.className = 'collapsible-section';
    section.dataset.sectionId = id;
    if (state.collapsedSections.includes(id)) section.classList.add('collapsed');
    if (animate) {
      section.style.animationDelay = (animIdx * 0.04) + 's';
    } else {
      section.style.animation = 'none';
    }

    const header = document.createElement('div');
    header.className = 'collapsible-header';
    header.dataset.sectionId = id;
    if (color) header.style.setProperty('--category-color', color);

    if (color !== undefined) {
      const colorBar = document.createElement('span');
      colorBar.className = 'category-color-bar';
      colorBar.title = 'Change color';
      colorBar.addEventListener('click', (e) => {
        e.stopPropagation();
        showColorPicker(colorBar, label);
      });
      header.appendChild(colorBar);
    }

    const arrow = document.createElement('span');
    arrow.className = 'collapsible-arrow';
    arrow.textContent = '\u25BE';
    header.appendChild(arrow);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    header.appendChild(labelSpan);

    const countSpan = document.createElement('span');
    countSpan.className = 'category-count';
    countSpan.textContent = String(skills.length);
    header.appendChild(countSpan);

    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'tag-grid';

    for (const skill of skills) {
      grid.appendChild(buildTag(skill, color));
    }

    section.appendChild(grid);
    return section;
  }

  function buildTag(skill, categoryColor) {
    const tag = document.createElement('button');
    tag.className = 'skill-tag' + (skill.stale ? ' stale' : '');
    tag.dataset.name = skill.name;
    tag.dataset.command = skill.slashCommand;
    if (categoryColor) tag.style.borderColor = categoryColor;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = skill.name;
    tag.appendChild(nameSpan);

    const infoIcon = document.createElement('i');
    infoIcon.className = 'info-icon';
    infoIcon.textContent = '?';
    infoIcon.title = 'Show details';
    tag.appendChild(infoIcon);

    return tag;
  }

  // --- Toast ---

  function showToast(command) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<span class="toast-check">\u2713</span> ' + escapeHtml(command);
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  // --- Utilities ---

  function findSkillByName(name) {
    return allSkills.find((s) => s.name === name) || null;
  }

  function resolveSkillNames(names, filteredNames) {
    const staleSkill = (name) => ({
      name, description: '(not found)', category: '', source: '',
      slashCommand: '/' + name, filePath: '', stale: true,
    });
    return names
      .map((name) => findSkillByName(name) || staleSkill(name))
      .filter((s) => filteredNames.has(s.name) || s.stale || !searchInput.value);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
