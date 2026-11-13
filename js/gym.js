const Gym = (() => {
  let previewRows = [];
  let exerciseChart = null;
  let displayUnit = Storage.get('fd_gym_unit', 'lb');

  const MET = { light: 3.5, moderate: 5.0, vigorous: 6.0 };
  const DEFAULT_WEIGHT_KG = 75;
  const DEFAULT_SESSION = { minutes: 45, intensity: 'moderate' };

  function getLog() {
    return Storage.get(Keys.GYM_LOG, []);
  }
  function saveLog(entries) {
    Storage.set(Keys.GYM_LOG, entries);
  }
  function getSessions() {
    return Storage.get(Keys.GYM_SESSIONS, {});
  }
  function saveSessions(sessions) {
    Storage.set(Keys.GYM_SESSIONS, sessions);
  }

  // ---------- Parsing ----------

  const SLASH_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
  // e.g. "Sept 9", "Sep 9, 2026", "Monday, September 9th"
  const MONTH_DATE_RE = /^(?:([A-Za-z]+),?\s+)?([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/;
  const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  // "bw" / "bodyweight" count as weight 0 (pull-ups, dips, etc.)
  const SET_RE = /\b(\d+(?:\.\d+)?|bw|bodyweight)\s*(kgs?|kilos?|lbs?|pounds?)?\s*x\s*(\d+)\s*(?:reps?)?/gi;

  // Accepts full names or abbreviations of at least 3 letters ("Sep", "Sept", "September").
  function matchName(word, names) {
    const w = word.toLowerCase();
    if (w.length < 3) return -1;
    return names.findIndex(n => n.startsWith(w));
  }

  // Returns ISO date, or null if the parts don't form a real calendar date (e.g. 2/31).
  function buildDate(y, monthIdx, d) {
    const dt = new Date(y, monthIdx, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== monthIdx || dt.getDate() !== d) return null;
    return dateToISO(dt);
  }

  function tryParseDateLine(line) {
    const m = line.match(SLASH_DATE_RE);
    if (m) {
      let [, mo, d, y] = m;
      y = y.length === 2 ? '20' + y : y;
      return buildDate(Number(y), Number(mo) - 1, Number(d));
    }
    const mm = line.match(MONTH_DATE_RE);
    if (mm) {
      const [, weekday, monthWord, d, y] = mm;
      if (weekday && matchName(weekday, WEEKDAY_NAMES) === -1) return null;
      const monthIdx = matchName(monthWord, MONTH_NAMES);
      if (monthIdx === -1) return null;
      return buildDate(y ? Number(y) : new Date().getFullYear(), monthIdx, Number(d));
    }
    return null;
  }

  function extractSets(line) {
    const sets = [];
    let match;
    SET_RE.lastIndex = 0;
    while ((match = SET_RE.exec(line)) !== null) {
      const weight = /^b/i.test(match[1]) ? 0 : parseFloat(match[1]);
      const unitRaw = (match[2] || '').toLowerCase();
      const unit = unitRaw.startsWith('k') ? 'kg' : 'lb';
      const reps = parseInt(match[3], 10);
      sets.push({ weight, unit, reps });
    }
    return sets;
  }

  function parseNotes(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const rows = [];
    let currentDate = todayISO();
    let currentExercise = null;

    lines.forEach(line => {
      const dateFound = tryParseDateLine(line);
      if (dateFound) {
        currentDate = dateFound;
        return;
      }
      const sets = extractSets(line);
      if (sets.length > 0 && currentExercise) {
        sets.forEach(s => {
          rows.push({
            id: uid(),
            date: currentDate,
            exercise: currentExercise,
            weight: s.weight,
            unit: s.unit,
            reps: s.reps
          });
        });
        return;
      }
      // Otherwise treat as an exercise name line
      currentExercise = line.replace(/:$/, '');
    });

    return rows;
  }

  // ---------- Preview ----------

  function handleParseClick() {
    const text = document.getElementById('gymPasteBox').value;
    if (!text.trim()) return;
    previewRows = parseNotes(text);
    renderPreviewTable();
    document.getElementById('gymPreviewCard').hidden = previewRows.length === 0;
  }

  function renderPreviewTable() {
    const body = document.getElementById('gymPreviewBody');
    body.innerHTML = '';
    previewRows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="date" value="${row.date}" data-field="date" data-idx="${idx}"></td>
        <td><input type="text" value="${escapeHtml(row.exercise)}" data-field="exercise" data-idx="${idx}"></td>
        <td><input type="number" step="0.5" value="${row.weight}" data-field="weight" data-idx="${idx}"></td>
        <td>
          <select data-field="unit" data-idx="${idx}">
            <option value="lb" ${row.unit === 'lb' ? 'selected' : ''}>lb</option>
            <option value="kg" ${row.unit === 'kg' ? 'selected' : ''}>kg</option>
          </select>
        </td>
        <td><input type="number" value="${row.reps}" data-field="reps" data-idx="${idx}"></td>
        <td><button class="btn-danger" data-remove="${idx}">&times;</button></td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        const field = e.target.dataset.field;
        let value = e.target.value;
        if (field === 'weight' || field === 'reps') value = Number(value);
        previewRows[idx][field] = value;
      });
    });
    body.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        previewRows.splice(Number(btn.dataset.remove), 1);
        renderPreviewTable();
      });
    });
  }

  function addPreviewRow() {
    previewRows.push({ id: uid(), date: todayISO(), exercise: '', weight: 0, unit: 'lb', reps: 0 });
    renderPreviewTable();
  }

  function saveGymLog() {
    const existing = getLog();
    const cleaned = previewRows.filter(r => r.date && r.exercise && r.weight >= 0 && r.reps > 0);

    // Guard against pasting the same notes twice.
    const existingKeys = new Set(existing.map(e => `${e.date}__${e.exercise}`));
    const dupes = Array.from(new Set(cleaned
      .filter(r => existingKeys.has(`${r.date}__${r.exercise}`))
      .map(r => `${r.exercise} on ${formatDateLabel(r.date)}`)));
    if (dupes.length > 0) {
      const list = dupes.slice(0, 5).join('\n') + (dupes.length > 5 ? `\n…and ${dupes.length - 5} more` : '');
      if (!confirm(`Already in your log:\n${list}\n\nSave anyway? These sets will be added alongside the existing ones.`)) return;
    }

    saveLog(existing.concat(cleaned));

    // Ensure every new session date has a default duration/intensity so it
    // immediately contributes to that day's calorie budget.
    const sessions = getSessions();
    const newDates = new Set(cleaned.map(r => r.date));
    newDates.forEach(date => {
      if (!sessions[date]) sessions[date] = { ...DEFAULT_SESSION };
    });
    saveSessions(sessions);

    previewRows = [];
    document.getElementById('gymPreviewCard').hidden = true;
    document.getElementById('gymPasteBox').value = '';
    refreshAll();
  }

  function cancelPreview() {
    previewRows = [];
    document.getElementById('gymPreviewCard').hidden = true;
  }

  // ---------- Unit display toggle ----------

  function toLb(weight, unit) {
    return unit === 'kg' ? weight * 2.20462 : weight;
  }
  function toKg(weight, unit) {
    return unit === 'lb' ? weight * 0.453592 : weight;
  }
  function convertToDisplay(weight, unit) {
    return displayUnit === 'kg' ? toKg(weight, unit) : toLb(weight, unit);
  }

  function initUnitToggle() {
    const wrap = document.getElementById('gymUnitToggle');
    wrap.querySelectorAll('.unit-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.unit === displayUnit);
      btn.addEventListener('click', () => {
        displayUnit = btn.dataset.unit;
        Storage.set('fd_gym_unit', displayUnit);
        wrap.querySelectorAll('.unit-btn').forEach(b => b.classList.toggle('active', b.dataset.unit === displayUnit));
        renderExerciseChart();
        renderLogTable();
      });
    });
  }

  // ---------- Exercise progress ----------

  function uniqueExercises() {
    const names = new Set(getLog().map(e => e.exercise));
    return Array.from(names).sort();
  }

  function epley1RM(weight, reps) {
    return weight * (1 + reps / 30);
  }

  function populateExerciseSelect() {
    const select = document.getElementById('exerciseSelect');
    const names = uniqueExercises();
    const prev = select.value;
    select.innerHTML = '';
    names.forEach(n => select.add(new Option(n, n)));
    if (names.includes(prev)) select.value = prev;
  }

  function renderExerciseChart() {
    const select = document.getElementById('exerciseSelect');
    const exercise = select.value;
    const entries = getLog().filter(e => e.exercise === exercise);
    const byDate = {};
    entries.forEach(e => {
      const w = convertToDisplay(e.weight, e.unit);
      if (!byDate[e.date]) byDate[e.date] = { maxWeight: 0, best1rm: 0 };
      byDate[e.date].maxWeight = Math.max(byDate[e.date].maxWeight, w);
      byDate[e.date].best1rm = Math.max(byDate[e.date].best1rm, epley1RM(w, e.reps));
    });
    const dates = Object.keys(byDate).sort();

    renderStats(entries);

    const ctx = document.getElementById('exerciseChart');
    if (exerciseChart) { exerciseChart.destroy(); exerciseChart = null; }
    if (dates.length === 0 || typeof Chart === 'undefined') return;
    exerciseChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map(formatDateLabel),
        datasets: [
          { label: `Max Weight (${displayUnit})`, data: dates.map(d => Math.round(byDate[d].maxWeight)), borderColor: '#2563eb', backgroundColor: 'transparent', tension: 0.25 },
          { label: `Est. 1RM (${displayUnit})`, data: dates.map(d => Math.round(byDate[d].best1rm)), borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.25 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function renderStats(entries) {
    const el = document.getElementById('exerciseStats');
    if (entries.length === 0) {
      el.innerHTML = '<p class="muted small">No data yet for this exercise.</p>';
      return;
    }
    let maxWeight = 0, maxWeightReps = 0, maxReps = 0, best1rm = 0;
    entries.forEach(e => {
      const w = convertToDisplay(e.weight, e.unit);
      if (w > maxWeight) { maxWeight = w; maxWeightReps = e.reps; }
      if (e.reps > maxReps) maxReps = e.reps;
      best1rm = Math.max(best1rm, epley1RM(w, e.reps));
    });
    el.innerHTML = `
      <div class="stat"><span class="stat-label">Max Weight</span><span class="stat-value">${Math.round(maxWeight)} ${displayUnit}</span></div>
      <div class="stat"><span class="stat-label">At Reps</span><span class="stat-value">${maxWeightReps}</span></div>
      <div class="stat"><span class="stat-label">Max Reps (any set)</span><span class="stat-value">${maxReps}</span></div>
      <div class="stat"><span class="stat-label">Est. 1RM</span><span class="stat-value">${Math.round(best1rm)} ${displayUnit}</span></div>
    `;
  }

  // ---------- Full log table ----------

  function renderLogTable() {
    const entries = getLog();
    const groups = {};
    entries.forEach(e => {
      const key = `${e.date}__${e.exercise}`;
      if (!groups[key]) groups[key] = { date: e.date, exercise: e.exercise, sets: [] };
      groups[key].sets.push(e);
    });
    const rows = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
    const body = document.getElementById('gymLogTableBody');
    body.innerHTML = '';
    rows.forEach(g => {
      const setsStr = g.sets.map(s => s.weight === 0
        ? `BWx${s.reps}`
        : `${Math.round(convertToDisplay(s.weight, s.unit) * 10) / 10}${displayUnit}x${s.reps}`).join(', ');
      const best = g.sets.reduce((m, s) => Math.max(m, convertToDisplay(s.weight, s.unit)), 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDateLabel(g.date)}</td>
        <td>${escapeHtml(g.exercise)}</td>
        <td>${escapeHtml(setsStr)}</td>
        <td>${best > 0 ? `${Math.round(best)} ${displayUnit}` : 'BW'}</td>
        <td><button class="btn-danger">&times;</button></td>
      `;
      tr.querySelector('.btn-danger').addEventListener('click', () => deleteGroup(g.date, g.exercise));
      body.appendChild(tr);
    });
  }

  function deleteGroup(date, exercise) {
    const remaining = getLog().filter(e => !(e.date === date && e.exercise === exercise));
    saveLog(remaining);
    // Drop the session too once nothing is left on that date, so its
    // calories stop counting toward the budget.
    if (!remaining.some(e => e.date === date)) {
      const sessions = getSessions();
      delete sessions[date];
      saveSessions(sessions);
    }
    refreshAll();
    refreshCalories();
  }

  function refreshCalories() {
    Calories.renderSummary();
    Calories.renderHistory();
    Calories.renderTrend();
  }

  // Older data may have workout dates with no session (shown with defaults
  // but not counted) or sessions whose workouts were deleted (counted but
  // hidden). Make the stored sessions match the log.
  function syncSessionsWithLog() {
    const logDates = new Set(getLog().map(e => e.date));
    const sessions = getSessions();
    let changed = false;
    logDates.forEach(date => {
      if (!sessions[date]) { sessions[date] = { ...DEFAULT_SESSION }; changed = true; }
    });
    Object.keys(sessions).forEach(date => {
      if (!logDates.has(date)) { delete sessions[date]; changed = true; }
    });
    if (changed) saveSessions(sessions);
  }

  // ---------- Session length & calories burned ----------

  function caloriesForSession(minutes, intensity) {
    const weightKg = (typeof Calories !== 'undefined' ? Calories.getWeightKg() : null) || DEFAULT_WEIGHT_KG;
    const met = MET[intensity] || MET.moderate;
    return (met * 3.5 * weightKg / 200) * minutes;
  }

  function getCaloriesBurnedForDate(iso) {
    const sessions = getSessions();
    const s = sessions[iso];
    if (!s) return 0;
    return caloriesForSession(s.minutes, s.intensity);
  }

  function renderSessionTable() {
    const dates = Array.from(new Set(getLog().map(e => e.date))).sort().reverse();
    const sessions = getSessions();
    const body = document.getElementById('gymSessionTableBody');
    body.innerHTML = '';
    dates.forEach(date => {
      const s = sessions[date] || DEFAULT_SESSION;
      const kcal = Math.round(caloriesForSession(s.minutes, s.intensity));
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDateLabel(date)}</td>
        <td><input type="number" min="0" step="5" value="${s.minutes}" data-date="${date}" data-field="minutes" style="width:80px"></td>
        <td>
          <select data-date="${date}" data-field="intensity">
            <option value="light" ${s.intensity === 'light' ? 'selected' : ''}>Light</option>
            <option value="moderate" ${s.intensity === 'moderate' ? 'selected' : ''}>Moderate</option>
            <option value="vigorous" ${s.intensity === 'vigorous' ? 'selected' : ''}>Vigorous</option>
          </select>
        </td>
        <td>${kcal} kcal</td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', (e) => {
        const date = e.target.dataset.date;
        const field = e.target.dataset.field;
        const sessions = getSessions();
        if (!sessions[date]) sessions[date] = { ...DEFAULT_SESSION };
        sessions[date][field] = field === 'minutes' ? Number(e.target.value) : e.target.value;
        saveSessions(sessions);
        renderSessionTable();
        refreshCalories();
      });
    });
    document.getElementById('gymSessionEmptyMsg').hidden = dates.length > 0;
  }

  function refreshAll() {
    populateExerciseSelect();
    renderExerciseChart();
    renderLogTable();
    renderSessionTable();
  }

  function init() {
    document.getElementById('parseNotesBtn').addEventListener('click', handleParseClick);
    document.getElementById('clearPasteBtn').addEventListener('click', () => {
      document.getElementById('gymPasteBox').value = '';
    });
    document.getElementById('addPreviewRowBtn').addEventListener('click', addPreviewRow);
    document.getElementById('saveGymBtn').addEventListener('click', saveGymLog);
    document.getElementById('cancelGymBtn').addEventListener('click', cancelPreview);
    document.getElementById('exerciseSelect').addEventListener('change', renderExerciseChart);
    initUnitToggle();

    refreshAll();
  }

  return { init, refreshAll, getCaloriesBurnedForDate, syncSessionsWithLog };
})();
