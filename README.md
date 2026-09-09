# Fitness Dashboard

A single-page fitness dashboard with two tabs:

- **Calorie Tracker** — set your weight, height, calorie limit, and macro targets; log food throughout the day; see a running daily summary (calories, macros, deficit/surplus), a 14-day trend chart, and history.
- **Gym Progress** — paste raw workout notes (e.g. copied from Apple Notes), review/edit the parsed sets, and track progress per exercise with a line chart of max weight and estimated 1RM over time, plus personal bests. Toggle weights between lb/kg. Each logged session estimates calories burned (by duration + intensity + your body weight) and feeds that back into the Calorie Tracker's daily budget.

It's a static site (HTML/CSS/JS) plus one small serverless function for the login gate, built to run on [Vercel](https://vercel.com)'s free tier. Data (profile, food log, gym log) lives in your browser's `localStorage` only — private to whichever device/browser you use it on.

## Deploying it (free, on Vercel)

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Go to [vercel.com](https://vercel.com), sign up (Continue with GitHub is easiest), and click **Add New → Project**.
3. Import `Fitness_Dashboard`. Leave the framework preset as **Other** — no build command needed.
4. Before or right after the first deploy, go to **Settings → Environment Variables** and add:
   - `AUTH_NAME` — the name you'll log in with
   - `AUTH_PIN` — the PIN you'll log in with
5. Deploy (or **Redeploy** if you added the env vars after the first deploy). Vercel gives you a URL like `fitness-dashboard-yourname.vercel.app` — open that on your phone and add it to your home screen.

From then on, every `git push` to `main` auto-deploys.

### The login gate

`login.html` is the entry point people hit first; it posts your name + PIN to `/api/login.js`, which checks them against `AUTH_NAME`/`AUTH_PIN` server-side and returns a 180-day session. `index.html` redirects to the login page if that session is missing or expired. This is a lightweight gate to keep random visitors out — not bank-grade security, since the dashboard's static files are still technically reachable by a determined visitor. Good enough for keeping a personal dashboard off the beaten path.

## Running it locally

```bash
npx vercel dev
```

This serves the static files and the `/api/login` function together the same way Vercel does in production. Add a `.env.local` file (gitignored) with `AUTH_NAME=...` and `AUTH_PIN=...` for local testing.

## Calorie Tracker

1. Fill in your weight, height, daily calorie limit, and protein/carb/fat targets under **Profile & Targets**, then Save.
2. Add foods as you eat them via the **Food Log** form (name, calories, and macros).
3. The **Today's Summary** card tallies your totals live and shows remaining calories (limit + estimated gym-session calories − consumed).
4. **Trend** and **History** show your last 14–30 days.

## Gym Progress

1. Paste raw text from Apple Notes (or anywhere) into the **Paste Workout Notes** box. The parser looks for:
   - A date line, e.g. `9/9/2026`
   - An exercise name on its own line, e.g. `Bench Press`
   - Set lines like `135x10, 155x8, 175x5` or `135 lbs x 10 reps`
2. Click **Parse Notes**, review the results in the editable preview table (fix anything the parser got wrong), then **Save to Log**.
3. Pick an exercise from the dropdown to see a line chart of max weight and estimated 1RM (Epley formula) over time, plus personal bests. Toggle **lb/kg** to change display units — this doesn't change how sets are stored, just how they're shown.
4. The **Session Length & Calories Burned** card lists each workout day with an editable duration (minutes) and intensity (Light/Moderate/Vigorous). It estimates calories burned using a standard MET formula (`MET × 3.5 × body weight kg / 200 × minutes`) and feeds that into the Calorie Tracker's daily budget. New sessions default to 45 minutes at Moderate intensity — adjust as needed. Set your weight in the Calorie tab for an accurate estimate (a 75 kg default is used otherwise).

The notes parser is best-effort, not a strict format — always check the preview before saving.

## Why no Strava integration

Strava eliminated its free API tier, so this dashboard estimates exercise calories from your logged gym sessions instead (see above) rather than depending on a paid third-party API.

## Data & privacy

Profile, food log, and gym log all live in `localStorage` in your browser only — nothing is sent to a server except your name/PIN at login. Clearing your browser data / site data will erase it. There is no database; the only server-side code is the login check.
