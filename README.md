# Dynamic Anchor

Dynamic Anchor is a React + Vite productivity scheduler. It lets users capture actionable tasks, estimate time, prioritize with the Eisenhower Matrix, and fit work into a weekly schedule around sleep and existing events.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase Auth and database
- Google sign-in through Supabase
- Guest mode with `localStorage`
- Vercel-ready static deployment

## Install Packages

```bash
npm install
```


##  Google Sign-In
Users can log in using Google

## Guest Flow

Visitors can continue without signing in. Guest data is saved in the current browser with `localStorage`. After a guest creates several tasks, the app shows a sign-in prompt so their schedule can be saved across devices.

Supabase also supports anonymous auth in newer projects, but this app keeps guest users local by default to avoid requiring extra provider setup.


## Project Structure

```text
src/
  App.tsx              Main app UI and flows
  styles.css           Tailwind layer and custom component styles
  types.ts             Shared TypeScript models
  lib/
    db.ts              Supabase table reads/writes
    schedule.ts        Weekly scheduling and Eisenhower logic
    storage.ts         Guest/local persistence
    supabase.ts        Supabase client from Vite env vars
```
