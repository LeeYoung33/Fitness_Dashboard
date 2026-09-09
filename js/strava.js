const Strava = (() => {
  const TOKEN_URL = 'https://www.strava.com/oauth/token';
  const AUTH_URL = 'https://www.strava.com/oauth/authorize';
  const ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities';
  const KJ_TO_KCAL = 0.239006;

  function getAuth() {
    return Storage.get(Keys.STRAVA_AUTH, {});
  }
  function setAuth(patch) {
    const current = getAuth();
    Storage.set(Keys.STRAVA_AUTH, { ...current, ...patch });
  }
  function clearTokens() {
    const current = getAuth();
    Storage.set(Keys.STRAVA_AUTH, { clientId: current.clientId, clientSecret: current.clientSecret });
  }

  function redirectUri() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  function isConnected() {
    const a = getAuth();
    return !!(a.accessToken && a.refreshToken);
  }

  function buildAuthorizeUrl() {
    const a = getAuth();
    const params = new URLSearchParams({
      client_id: a.clientId || '',
      redirect_uri: redirectUri(),
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all'
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  function buildManualCurl(code) {
    const a = getAuth();
    return `curl -X POST ${TOKEN_URL} \\
  -d client_id=${a.clientId || '<CLIENT_ID>'} \\
  -d client_secret=${a.clientSecret || '<CLIENT_SECRET>'} \\
  -d code=${code || '<CODE_FROM_URL>'} \\
  -d grant_type=authorization_code`;
  }

  async function exchangeCodeForToken(code) {
    const a = getAuth();
    const body = new URLSearchParams({
      client_id: a.clientId,
      client_secret: a.clientSecret,
      code,
      grant_type: 'authorization_code'
    });
    const res = await fetch(TOKEN_URL, { method: 'POST', body });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    const data = await res.json();
    setAuth({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athlete: data.athlete
    });
    return data;
  }

  async function refreshAccessToken() {
    const a = getAuth();
    if (!a.refreshToken) throw new Error('No refresh token available');
    const body = new URLSearchParams({
      client_id: a.clientId,
      client_secret: a.clientSecret,
      refresh_token: a.refreshToken,
      grant_type: 'refresh_token'
    });
    const res = await fetch(TOKEN_URL, { method: 'POST', body });
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    const data = await res.json();
    setAuth({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at
    });
    return data.access_token;
  }

  async function getValidAccessToken() {
    const a = getAuth();
    if (!a.accessToken) throw new Error('Not connected to Strava');
    const now = Math.floor(Date.now() / 1000);
    if (a.expiresAt && a.expiresAt - now < 60) {
      return await refreshAccessToken();
    }
    return a.accessToken;
  }

  function activityCalories(act) {
    if (typeof act.calories === 'number') return Math.round(act.calories);
    if (typeof act.kilojoules === 'number') return Math.round(act.kilojoules * KJ_TO_KCAL);
    return 0;
  }

  async function syncActivities(perPage = 30) {
    const token = await getValidAccessToken();
    const res = await fetch(`${ACTIVITIES_URL}?per_page=${perPage}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Activity fetch failed: ${res.status}`);
    const activities = await res.json();
    const mapped = activities.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      date: (a.start_date_local || a.start_date || '').slice(0, 10),
      distanceMeters: a.distance,
      movingTimeSec: a.moving_time,
      calories: activityCalories(a)
    }));
    Storage.set(Keys.STRAVA_ACTIVITIES, mapped);
    return mapped;
  }

  function getCachedActivities() {
    return Storage.get(Keys.STRAVA_ACTIVITIES, []);
  }

  function getExerciseCaloriesForDate(iso) {
    return getCachedActivities()
      .filter(a => a.date === iso)
      .reduce((sum, a) => sum + (a.calories || 0), 0);
  }

  function disconnect() {
    clearTokens();
    Storage.set(Keys.STRAVA_ACTIVITIES, []);
  }

  async function handleRedirectIfPresent() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (error) {
      window.history.replaceState({}, '', redirectUri());
      return { error };
    }
    if (!code) return null;
    window.history.replaceState({}, '', redirectUri());
    try {
      await exchangeCodeForToken(code);
      return { success: true };
    } catch (e) {
      return { corsError: true, code };
    }
  }

  return {
    getAuth, setAuth, isConnected, buildAuthorizeUrl, buildManualCurl,
    exchangeCodeForToken, syncActivities, getCachedActivities,
    getExerciseCaloriesForDate, disconnect, handleRedirectIfPresent, redirectUri
  };
})();
