# Dynamic Anchor

Dynamic Anchor is a React + Vite productivity scheduler. It lets users capture actionable tasks, estimate time, prioritize with the Eisenhower Matrix, and fit work into a weekly schedule around sleep and existing events.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase Auth and database
- Google sign-in through Supabase
- Guest mode with `localStorage`
- Vercel-ready static deployment

## 1. Install Packages

```bash
npm install
```

## 2. Create A Supabase Project

1. Go to [Supabase](https://supabase.com/).
2. Create a new project.
3. Open **Project Settings > API**.
4. Copy your project URL and anon public key.
5. Do not use a service-role key in this frontend app.

## 3. Add Environment Variables

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

These same variables should be added in Vercel under **Project Settings > Environment Variables**.

## 4. Enable Google Sign-In

1. In Supabase, open **Authentication > Providers**.
2. Enable **Google**.
3. Add the Google OAuth client ID and secret from Google Cloud Console.
4. Add local and production redirect URLs in Supabase.
5. Restart the Vite dev server after creating or changing `.env.local`.

Recommended Supabase redirect URLs:

```text
http://localhost:5173
http://localhost:5174
https://your-vercel-app.vercel.app
```

In Google Cloud Console, add authorized redirect URIs using the Supabase callback URL shown in the Google provider settings. It usually looks like:

```text
https://your-project-ref.supabase.co/auth/v1/callback
```

If Google sign-in does not open, check:

- `.env.local` exists and contains real `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values.
- The dev server was restarted after adding env vars.
- Supabase has Google enabled under **Authentication > Providers**.
- Supabase allowed redirect URLs include the exact local origin Vite is using, such as `http://localhost:5173`, `http://127.0.0.1:5173`, or the alternate port Vite prints.
- Your Google OAuth client has the Supabase callback URL authorized.

## 5. Guest Flow

Visitors can continue without signing in. Guest data is saved in the current browser with `localStorage`. After a guest creates several tasks, the app shows a sign-in prompt so their schedule can be saved across devices.

Supabase also supports anonymous auth in newer projects, but this app keeps guest users local by default to avoid requiring extra provider setup.

## 6. Create Database Tables And RLS Policies

Open **Supabase SQL Editor** and run:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  first_name text,
  nickname_asked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  routine jsonb not null default '{"wakeTime":"07:00","sleepTime":"23:00"}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_data enable row level security;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Users can insert their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read their own app data"
on public.app_data for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own app data"
on public.app_data for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own app data"
on public.app_data for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Optional updated timestamp trigger:

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_app_data_updated_at on public.app_data;
create trigger set_app_data_updated_at
before update on public.app_data
for each row execute function public.set_updated_at();
```

## 7. Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

The app also runs in guest mode if Supabase variables are missing, but Google sign-in and cloud sync require the `.env.local` values.

## 8. Deploy To Vercel

1. Push this project to GitHub.
2. Create a new Vercel project from the repo.
3. Framework preset: **Vite**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel environment variables.
7. Deploy.

## 9. Connect To A Portfolio Website

After Vercel deploys the app:

1. Copy the production URL.
2. Add it as a project link on your portfolio.
3. In Supabase Auth URL settings, add that production URL to the allowed redirect URLs.
4. In Google Cloud Console, confirm the Supabase auth callback URL is authorized.

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
