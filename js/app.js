function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    localStorage.removeItem('fd_auth');
    window.location.replace('login.html');
  });
}

// Everything except the login session, which belongs to the device.
const BACKUP_KEYS = [...Object.values(Keys), 'fd_gym_unit'];

function initBackup() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const data = {};
    BACKUP_KEYS.forEach(k => {
      const v = Storage.get(k, undefined);
      if (v !== undefined) data[k] = v;
    });
    const backup = { app: 'fitness-dashboard', version: 1, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fitness-dashboard-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const fileInput = document.getElementById('importFile');
  document.getElementById('importBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch (e) {
      alert('That file is not valid JSON.');
      return;
    }
    if (!backup || backup.app !== 'fitness-dashboard' || typeof backup.data !== 'object' || backup.data === null) {
      alert('That file is not a Fitness Dashboard backup.');
      return;
    }
    if (!confirm('Replace all data on this device with the backup? Anything not in the backup will be lost.')) return;
    for (const k of BACKUP_KEYS) {
      if (!(k in backup.data)) {
        localStorage.removeItem(k);
      } else if (!Storage.set(k, backup.data[k])) {
        return;
      }
    }
    window.location.reload();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initLogout();
  initBackup();
  Gym.syncSessionsWithLog();
  Calories.init();
  FoodPhoto.init();
  Gym.init();
});
