# Fitness Dashboard

A single-page fitness dashboard with two tabs:

- **Calorie Tracker** — set your weight, height, calorie limit, and macro targets; log food throughout the day; see a running daily summary (calories, macros, deficit/surplus), a 14-day trend chart, and history.
- **Gym Progress** — paste raw workout notes (e.g. copied from Apple Notes), review/edit the parsed sets, and track progress per exercise with a line chart of max weight and estimated 1RM over time, plus personal bests.

Strava integration lets you connect your account so recent activities sync in, and exercise calories automatically add to your calorie budget for the day.

No build step — it's plain HTML/CSS/JS. Data is stored in your browser's `localStorage`, so it's private to whichever browser you use it in.

## Running it

Just open [index.html](index.html) in a browser, or serve the folder locally:

```bash
npx serve .
```

To host it for free, push to GitHub and enable **GitHub Pages** (Settings → Pages → deploy from `main` branch, root folder).

## Calorie Tracker

1. Fill in your weight, height, daily calorie limit, and protein/carb/fat targets under **Profile & Targets**, then Save.
2. Add foods as you eat them via the **Food Log** form (name, calories, and macros).
3. The **Today's Summary** card tallies your totals live and shows remaining calories (limit + any synced exercise calories − consumed).
4. **Trend** and **History** show your last 14–30 days.

## Gym Progress

1. Paste raw text from Apple Notes (or anywhere) into the **Paste Workout Notes** box. The parser looks for:
   - A date line, e.g. `9/9/2026`
   - An exercise name on its own line, e.g. `Bench Press`
   - Set lines like `135x10, 155x8, 175x5` or `135 lbs x 10 reps`
2. Click **Parse Notes**, review the results in the editable preview table (fix anything the parser got wrong), then **Save to Log**.
3. Pick an exercise from the dropdown to see a line chart of max weight and estimated 1RM (Epley formula) over time, plus personal bests.

The parser is a best-effort text parser, not a strict format — always check the preview before saving.

## Strava Integration (free)

Strava's API is free for personal use (rate-limited to 200 requests/15 min, 2,000/day — plenty for personal use). Strava Premium/Summit is a separate consumer subscription and is **not** required.

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an API application.
   - Authorization Callback Domain: `localhost` if running locally, or your GitHub Pages domain (e.g. `yourname.github.io`) if hosted there.
2. Click **Connect Strava** (top right of the dashboard), paste in your **Client ID** and **Client Secret**, and save.
3. Click **Connect to Strava** — you'll be redirected to Strava to authorize, then back to the dashboard.

Credentials and tokens are stored only in your browser's `localStorage` — never committed to this repo.

### If "Connect" fails with a CORS error

Strava's token-exchange endpoint doesn't allow direct requests from browser JavaScript on most domains. If you hit this, the dashboard will show a ready-made `curl` command — run it once in a terminal after authorizing, and paste the resulting `access_token`, `refresh_token`, and `expires_at` into the manual form that appears. Reads of your activity list generally work fine directly from the browser once you have a token.

### Once connected

- **Sync Now** (Gym tab) pulls your recent activities and lists them with distance, duration, and calories.
- Any day with synced activities automatically adds those calories to that day's budget in the Calorie Tracker summary and history.

## Data & privacy

Everything (profile, food log, gym log, Strava tokens, cached activities) lives in `localStorage` in your browser only. Clearing your browser data / site data will erase it. There is no backend or server component.
