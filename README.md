# Dynamic Anchor

Dynamic Anchor is a React + Vite productivity scheduler that helps users turn messy to-do lists into a structured weekly plan. Users can capture actionable tasks, estimate time required, prioritize work using the Eisenhower Matrix, and automatically fit tasks around sleep, routines, and existing events.

The project was built as a portfolio-ready full-stack application focused on product thinking, user onboarding, authentication, persistence, and deployment.

## Live Demo

[link after deployed]

## Why I Built This

A common problem with productivity apps is that they capture tasks but do not help users realistically plan when those tasks should happen. Dynamic Anchor solves this by combining task intake, priority scoring, time estimates, and schedule generation into one workflow.

This project was designed to demonstrate the type of work required in client-facing technical roles: translating an ambiguous user problem into product requirements, designing a usable workflow, integrating backend services, and deploying a working application.

## Core Features

- Task capture with estimated duration and priority
- Weekly schedule generation based on wake time, sleep time, and existing events
- Eisenhower Matrix view for urgency and importance
- Google sign-in through Supabase Auth
- Guest mode using localStorage for users who do not want to sign in immediately
- Cloud persistence for authenticated users
- Completion tracking for scheduled tasks
- Vercel-ready deployment

## Tech Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase database
- Google OAuth
- localStorage for guest persistence
- Vercel for deployment

## Product and Technical Decisions

### Guest Mode Before Sign-In

The app allows users to try the product without creating an account. Guest data is stored locally in the browser, reducing onboarding friction while still giving users a reason to sign in later for cross-device persistence.

### Supabase Authentication

Supabase Auth handles Google sign-in and session management. This keeps authentication secure while allowing the frontend to focus on user experience and application logic.

### User-Owned Data Model

Authenticated user data is tied to the user’s Supabase auth ID. Row-level security policies ensure users can only access their own profile and app data.

### Scheduling Logic

The scheduling system considers user routines, available time windows, task duration, and priority to generate a practical weekly plan instead of only storing a static task list.

## Development Workflow

I used OpenAI Codex as an AI-assisted development partner for scaffolding, refactoring, debugging, and documentation. I owned the product requirements, architecture decisions, Supabase integration, authentication setup, deployment configuration, and final QA.

This workflow reflects how modern technical teams can use AI tools to move faster while still requiring human judgment around product design, system architecture, security, and user experience.

## Project Structure

```text
src/
  App.tsx              Main app UI and user flows
  styles.css           Tailwind layers and custom styles
  types.ts             Shared TypeScript models
  lib/
    db.ts              Supabase reads and writes
    schedule.ts        Weekly scheduling and Eisenhower logic
    storage.ts         Guest/local persistence
    supabase.ts        Supabase client configuration
