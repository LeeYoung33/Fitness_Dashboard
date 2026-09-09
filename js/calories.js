const Calories = (() => {
  let selectedDate = todayISO();
  let trendChart = null;

  function getProfile() {
    return Storage.get(Keys.PROFILE, {
      weight: null, weightUnit: 'kg',
      height: null, heightUnit: 'cm',
      calorieLimit: 2000, protein: 150, carbs: 200, fat: 65
    });
  }

  function getFoodLog() {
    return Storage.get(Keys.FOOD_LOG, {});
  }

  function getEntriesForDate(iso) {
    const log = getFoodLog();
    return log[iso] || [];
  }

  function addFoodEntry(entry) {
    const log = getFoodLog();
    if (!log[selectedDate]) log[selectedDate] = [];
    log[selectedDate].push(entry);
    Storage.set(Keys.FOOD_LOG, log);
  }

  function deleteFoodEntry(iso, id) {
    const log = getFoodLog();
    log[iso] = (log[iso] || []).filter(e => e.id !== id);
    Storage.set(Keys.FOOD_LOG, log);
  }

  function totalsForDate(iso) {
    const entries = getEntriesForDate(iso);
    return entries.reduce((t, e) => {
      t.calories += Number(e.calories) || 0;
      t.protein += Number(e.protein) || 0;
      t.carbs += Number(e.carbs) || 0;
      t.fat += Number(e.fat) || 0;
      return t;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }

  function calcBMI(profile) {
    if (!profile.weight || !profile.height) return null;
    let kg = profile.weight;
    let m = profile.height / 100;
    if (profile.weightUnit === 'lb') kg = profile.weight * 0.453592;
    if (profile.heightUnit === 'in') m = (profile.height * 2.54) / 100;
    if (!m) return null;
    return kg / (m * m);
  }

  function fillProfileForm() {
    const p = getProfile();
    document.getElementById('profWeight').value = p.weight ?? '';
    document.getElementById('profWeightUnit').value = p.weightUnit || 'kg';
    document.getElementById('profHeight').value = p.height ?? '';
    document.getElementById('profHeightUnit').value = p.heightUnit || 'cm';
    document.getElementById('profCalLimit').value = p.calorieLimit ?? '';
    document.getElementById('profProtein').value = p.protein ?? '';
    document.getElementById('profCarbs').value = p.carbs ?? '';
    document.getElementById('profFat').value = p.fat ?? '';
  }

  function saveProfileForm(e) {
    e.preventDefault();
    const profile = {
      weight: parseFloat(document.getElementById('profWeight').value) || null,
      weightUnit: document.getElementById('profWeightUnit').value,
      height: parseFloat(document.getElementById('profHeight').value) || null,
      heightUnit: document.getElementById('profHeightUnit').value,
      calorieLimit: parseFloat(document.getElementById('profCalLimit').value) || 0,
      protein: parseFloat(document.getElementById('profProtein').value) || 0,
      carbs: parseFloat(document.getElementById('profCarbs').value) || 0,
      fat: parseFloat(document.getElementById('profFat').value) || 0
    };
    Storage.set(Keys.PROFILE, profile);
    renderBmi();
    renderSummary();
    renderHistory();
    renderTrend();
    if (typeof Gym !== 'undefined') Gym.refreshAll();
  }

  function renderBmi() {
    const profile = getProfile();
    const bmi = calcBMI(profile);
    const el = document.getElementById('bmiLine');
    el.textContent = bmi ? `BMI: ${bmi.toFixed(1)}` : '';
  }

  function addFoodFormHandler(e) {
    e.preventDefault();
    const entry = {
      id: uid(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      name: document.getElementById('foodName').value.trim(),
      calories: parseFloat(document.getElementById('foodCalories').value) || 0,
      protein: parseFloat(document.getElementById('foodProtein').value) || 0,
      carbs: parseFloat(document.getElementById('foodCarbs').value) || 0,
      fat: parseFloat(document.getElementById('foodFat').value) || 0
    };
    if (!entry.name) return;
    addFoodEntry(entry);
    e.target.reset();
    document.getElementById('foodProtein').value = 0;
    document.getElementById('foodCarbs').value = 0;
    document.getElementById('foodFat').value = 0;
    renderFoodTable();
    renderSummary();
    renderHistory();
    renderTrend();
  }

  function renderFoodTable() {
    const entries = getEntriesForDate(selectedDate);
    const body = document.getElementById('foodTableBody');
    body.innerHTML = '';
    entries.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.time || ''}</td>
        <td>${escapeHtml(e.name)}</td>
        <td>${e.calories}</td>
        <td>${e.protein}</td>
        <td>${e.carbs}</td>
        <td>${e.fat}</td>
        <td><button class="btn-danger" data-id="${e.id}">&times;</button></td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll('.btn-danger').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteFoodEntry(selectedDate, btn.dataset.id);
        renderFoodTable();
        renderSummary();
        renderHistory();
        renderTrend();
      });
    });
    document.getElementById('foodEmptyMsg').hidden = entries.length > 0;
  }

  function renderSummary() {
    const profile = getProfile();
    const totals = totalsForDate(selectedDate);
    const exerciseCal = (typeof Gym !== 'undefined') ? Gym.getCaloriesBurnedForDate(selectedDate) : 0;

    document.getElementById('summaryDateLabel').textContent = `(${formatDateLabel(selectedDate)})`;
    document.getElementById('sumConsumed').textContent = Math.round(totals.calories);
    document.getElementById('sumExercise').textContent = Math.round(exerciseCal);

    const remaining = (profile.calorieLimit || 0) + exerciseCal - totals.calories;
    const remainingEl = document.getElementById('sumRemaining');
    remainingEl.textContent = Math.round(remaining);
    remainingEl.style.color = remaining < 0 ? 'var(--danger)' : 'var(--success)';

    const deficit = (profile.calorieLimit || 0) + exerciseCal - totals.calories;
    const deficitLabelEl = document.getElementById('sumDeficitLabel');
    const deficitEl = document.getElementById('sumDeficit');
    deficitLabelEl.textContent = deficit >= 0 ? 'Deficit' : 'Surplus';
    deficitEl.textContent = Math.abs(Math.round(deficit));
    deficitEl.style.color = deficit >= 0 ? 'var(--success)' : 'var(--danger)';

    setMacroBar('protein', totals.protein, profile.protein);
    setMacroBar('carbs', totals.carbs, profile.carbs);
    setMacroBar('fat', totals.fat, profile.fat);
  }

  function setMacroBar(key, value, target) {
    const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
    document.getElementById(`macro${cap(key)}Bar`).style.width = `${pct}%`;
    document.getElementById(`macro${cap(key)}Text`).textContent = `${Math.round(value)} / ${Math.round(target || 0)} g`;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function renderHistory() {
    const log = getFoodLog();
    const profile = getProfile();
    const dates = Object.keys(log).sort().reverse().slice(0, 30);
    const body = document.getElementById('historyTableBody');
    body.innerHTML = '';
    dates.forEach(iso => {
      const totals = totalsForDate(iso);
      const exerciseCal = (typeof Gym !== 'undefined') ? Gym.getCaloriesBurnedForDate(iso) : 0;
      const net = (profile.calorieLimit || 0) + exerciseCal - totals.calories;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDateLabel(iso)}</td>
        <td>${Math.round(totals.calories)}</td>
        <td>${Math.round(exerciseCal)}</td>
        <td>${profile.calorieLimit || 0}</td>
        <td style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${net >= 0 ? '-' : '+'}${Math.abs(Math.round(net))}</td>
      `;
      body.appendChild(tr);
    });
  }

  function renderTrend() {
    const log = getFoodLog();
    const profile = getProfile();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(dateToISO(d));
    }
    const consumed = days.map(iso => totalsForDate(iso).calories);
    const limitLine = days.map(() => profile.calorieLimit || 0);

    const ctx = document.getElementById('calorieTrendChart');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days.map(formatDateLabel),
        datasets: [
          { label: 'Consumed', data: consumed, borderColor: '#2563eb', backgroundColor: 'transparent', tension: 0.25 },
          { label: 'Limit', data: limitLine, borderColor: '#9ca3af', borderDash: [5, 5], backgroundColor: 'transparent', pointRadius: 0 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function setSelectedDate(iso) {
    selectedDate = iso;
    renderFoodTable();
    renderSummary();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getWeightKg() {
    const p = getProfile();
    if (!p.weight) return null;
    return p.weightUnit === 'lb' ? p.weight * 0.453592 : p.weight;
  }

  function init() {
    document.getElementById('foodDatePicker').value = selectedDate;
    document.getElementById('foodDatePicker').addEventListener('change', (e) => setSelectedDate(e.target.value));
    document.getElementById('profileForm').addEventListener('submit', saveProfileForm);
    document.getElementById('foodForm').addEventListener('submit', addFoodFormHandler);

    fillProfileForm();
    renderBmi();
    renderFoodTable();
    renderSummary();
    renderHistory();
    renderTrend();
  }

  return { init, renderSummary, renderHistory, renderTrend, getWeightKg };
})();
