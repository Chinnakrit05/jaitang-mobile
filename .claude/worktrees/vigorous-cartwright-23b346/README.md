# Jaitang Mobile

Native iOS + Android client for [Jaitang](https://github.com/Chinnakrit05/jaitang) — shares the same Supabase backend as the web app.

> **Status:** scaffolding only. Folder structure, providers, navigation skeleton, and config are in. UI screens are placeholders pending a new design.

## Stack

- **Expo (managed)** + expo-router (file-based routing, typed routes)
- **React Native 0.81** + React 19
- **TypeScript**
- **Supabase JS** (DB + Auth, shared with the web app)
- **NativeWind** (Tailwind for RN)
- **TanStack Query** for server state
- **react-i18next** + **expo-localization** — re-uses the web app's `messages/*.json` catalogs
- **react-native-svg** for the JtIcon sprite (real renderer pending)

## Layout

```
~/Desktop/jaitang-mobile/
├── app/                       # expo-router routes
│   ├── _layout.tsx            # providers + Stack root
│   ├── index.tsx              # redirect to (app) or (auth)
│   ├── (auth)/login.tsx       # placeholder login
│   └── (app)/                 # tab navigator + 4 placeholder screens
│       ├── dashboard.tsx
│       ├── quick.tsx
│       ├── transactions.tsx
│       └── ledgers.tsx
├── assets/icons/              # 5 SVG sprites copied from the web app
├── components/icons/          # JtIcon (placeholder render) + icon-names.ts
├── lib/
│   ├── supabase/client.ts     # Supabase client with AsyncStorage session
│   └── i18n/index.ts          # i18next setup (TH/EN/JA/ZH)
├── messages/                  # JSON catalogs (mirrored from web app)
├── providers/
│   ├── AuthProvider.tsx       # session + onAuthStateChange
│   └── QueryProvider.tsx
├── global.css                 # NativeWind entry
├── tailwind.config.js
├── babel.config.js
├── metro.config.js
└── app.json                   # Expo config
```

## Setup

1. Copy env: `cp .env.example .env` → fill in Supabase URL + anon key (same project as the web app).
2. `npm install` (already done if you cloned with deps).
3. `npx expo start` — scan the QR with Expo Go (iOS / Android) or `i` / `a` to launch a simulator.

Real Google OAuth + sprite renderer come in the next commits.

## What's intentionally NOT done yet

- **UI design** — every screen is a TODO box pending the new design.
- **Auth flow** — `AuthProvider` reads session state; the actual Google sign-in button still needs to wire in expo-auth-session + Supabase OAuth.
- **JtIcon visuals** — sprite files are in `assets/icons/` but the component renders the icon name as a label box. The real path will load the sprite via `expo-asset` + render with `react-native-svg`.
- **Business logic** — `lib/` is empty besides Supabase + i18n. Most helpers will port over from the web app's `src/lib/`.

## Roadmap

- **Phase 1 (scaffolding)** — this commit.
- **Phase 2** — Google sign-in, real JtIcon renderer, dashboard with today/month summary, transactions list (read-only).
- **Phase 3** — Quick add (the most-important mobile feature) + active trip banner.
- **Phase 4** — Trips, multi-currency logging, category + account pickers.
- **Defer** — Insights, splits, recurring rules, AI OCR, backup, settings, push.
