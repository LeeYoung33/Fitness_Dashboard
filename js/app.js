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

function refreshStravaHeader() {
  const connected = Strava.isConnected();
  document.getElementById('stravaHeaderDot').className = `dot ${connected ? 'dot-on' : 'dot-off'}`;
  document.getElementById('stravaHeaderLabel').textContent = connected ? 'Strava Connected' : 'Connect Strava';
}

function refreshModalState() {
  const auth = Strava.getAuth();
  document.getElementById('stravaClientId').value = auth.clientId || '';
  document.getElementById('stravaClientSecret').value = auth.clientSecret || '';
  document.getElementById('callbackDomainHint').textContent = window.location.hostname || 'localhost';

  const connected = Strava.isConnected();
  const statusLine = document.getElementById('stravaStatusLine');
  document.getElementById('stravaConnectBtn').hidden = connected;
  document.getElementById('stravaDisconnectBtn').hidden = !connected;

  if (connected) {
    statusLine.textContent = auth.athlete
      ? `Connected as ${auth.athlete.firstname || ''} ${auth.athlete.lastname || ''}`.trim()
      : 'Connected.';
    statusLine.className = 'status-line connected';
  } else if (auth.clientId && auth.clientSecret) {
    statusLine.textContent = 'Credentials saved. Click Connect to authorize.';
    statusLine.className = 'status-line';
  } else {
    statusLine.textContent = 'Add your Client ID and Secret, then connect.';
    statusLine.className = 'status-line';
  }
}

function initStravaModal() {
  const modal = document.getElementById('stravaModal');
  document.getElementById('stravaHeaderBtn').addEventListener('click', () => {
    modal.hidden = false;
    refreshModalState();
  });
  document.getElementById('closeStravaModal').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  document.getElementById('stravaCredForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Strava.setAuth({
      clientId: document.getElementById('stravaClientId').value.trim(),
      clientSecret: document.getElementById('stravaClientSecret').value.trim()
    });
    refreshModalState();
  });

  document.getElementById('stravaConnectBtn').addEventListener('click', () => {
    const auth = Strava.getAuth();
    if (!auth.clientId || !auth.clientSecret) {
      alert('Save your Client ID and Client Secret first.');
      return;
    }
    window.location.href = Strava.buildAuthorizeUrl();
  });

  document.getElementById('stravaDisconnectBtn').addEventListener('click', () => {
    Strava.disconnect();
    refreshModalState();
    refreshStravaHeader();
    Gym.renderStravaActivities();
    Calories.renderSummary();
    Calories.renderHistory();
  });

  document.getElementById('manualTokenForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Strava.setAuth({
      accessToken: document.getElementById('manualAccessToken').value.trim(),
      refreshToken: document.getElementById('manualRefreshToken').value.trim(),
      expiresAt: Number(document.getElementById('manualExpiresAt').value.trim())
    });
    document.getElementById('stravaManualFallback').hidden = true;
    refreshModalState();
    refreshStravaHeader();
  });
}

async function handleStravaRedirect() {
  const result = await Strava.handleRedirectIfPresent();
  if (!result) return;
  document.getElementById('stravaModal').hidden = false;
  if (result.success) {
    refreshModalState();
    refreshStravaHeader();
    Gym.refreshAll();
    Calories.renderSummary();
    Calories.renderHistory();
  } else if (result.corsError) {
    document.getElementById('stravaManualFallback').hidden = false;
    document.getElementById('curlCommand').textContent = Strava.buildManualCurl(result.code);
    document.getElementById('stravaStatusLine').textContent =
      'Browser blocked the direct token exchange (CORS). Use the manual method below.';
    document.getElementById('stravaStatusLine').className = 'status-line error';
  } else if (result.error) {
    document.getElementById('stravaStatusLine').textContent = `Strava authorization error: ${result.error}`;
    document.getElementById('stravaStatusLine').className = 'status-line error';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initStravaModal();
  refreshStravaHeader();

  Calories.init();
  Gym.init();

  await handleStravaRedirect();
});
