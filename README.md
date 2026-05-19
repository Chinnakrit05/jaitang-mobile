# Jaitang Mobile

Native iOS + Android client for [Jaitang](https://github.com/Chinnakrit05/jaitang). The app shares the same Supabase backend as the web app, but keeps a local SQLite mirror so the core money-tracking flow can work offline and sync later.

> **Status:** active mobile build. This is no longer just scaffolding: auth, local persistence, sync, dashboard, quick add, ledgers, accounts, budgets, categories, recurring transactions, trips, settings, and Thai-first UI flows are in progress.

## Stack

- **Expo SDK 54** managed app with `expo-router` typed routes
- **React Native 0.81** + **React 19.1**
- **TypeScript**
- **Supabase JS** for auth and shared backend data
- **expo-sqlite** for the offline local mirror
- **TanStack Query** for cached local/server state
- **NativeWind** for utility styling
- **react-i18next** + **expo-localization** using `messages/*.json`
- **react-native-svg** for charts, icons, and mascot artwork
- **react-native-reanimated** for small dashboard animations

Before changing Expo code or packages, read the versioned SDK docs for this project:

```txt
https://docs.expo.dev/versions/v54.0.0/
```

Use `npx expo install <package>` for Expo SDK packages so versions stay compatible with SDK 54.

## What Works

- Supabase session bootstrap with persisted auth state.
- Google OAuth via Supabase and `expo-auth-session`.
- Dev email/password sign-in using `EXPO_PUBLIC_DEV_EMAIL` and `EXPO_PUBLIC_DEV_PASSWORD`.
- Signed-in tab navigator: dashboard, transactions, quick add, insights, and more.
- Hidden routed screens for settings, accounts, budgets, categories, recurring rules, trips, ledgers, onboarding, and transaction editing.
- Smooth route transitions: stack pushes slide in, auth screens fade up, and tab changes use a subtle shift animation.
- Local SQLite schema for transactions, ledgers, categories, accounts, budgets, recurring transactions, and trips.
- Offline-first transaction creation: quick add writes locally with `_sync_state='pending_create'`.
- Sync loop that runs on sign-in, every 30 seconds, and when the device returns online.
- Pull mirrors for ledgers, categories, accounts, budgets, recurring transactions, and trips.
- Push/pull sync for transactions.
- Active ledger persistence in AsyncStorage.
- Active trip persistence per ledger, with new quick-add transactions auto-tagged to the active trip.
- Dashboard totals, animated category breakdown, real budget mood, recent transactions, active trip card, sync badge, and theme-aware UI.
- Budgets screen supports monthly parent-category budgets with progress states and category spend rollups.
- Quick add has a sticky save bar above the tab footer so transactions can be saved without scrolling to the bottom.
- Insights includes animated donut, payment-method progress bars, weekday bars, top category detail, budget highlights, and localized labels.
- Settings has the newer card-based layout with theme, language, ledger, icon-style, and sign-out controls.
- Dark mode is wired through login, sync badge, dashboard hero chips, preview screens, and QR share surfaces.
- Four message catalogs: Thai, English, Japanese, and Chinese.

## Recent UI Updates

- **Language switching:** several primary screens now read from `react-i18next` catalogs instead of hardcoded Thai, including dashboard, quick add, transactions, categories, more, settings, insights, onboarding, and tab labels.
- **Settings refresh:** settings was redesigned to match the rest of the app with a header, account hero, grouped sections, pill/grid controls, and theme-aware surfaces.
- **Budgets:** added monthly parent-category budgets, local SQLite mirror/sync hooks, Supabase RPCs, dashboard budget mood, and insights budget highlights.
- **Chart polish:** the shared donut chart animates its slices with Reanimated. Dashboard legends now show percentage, amount, and animated share bars. Insights adds top category detail, animated payment-method bars, and weekday spending amounts.
- **Quick add ergonomics:** the save action is now sticky above the bottom tab bar and shows validation errors directly above the button.
- **Navigation motion:** root stack, auth stack, and tab navigation now have smoother transitions instead of abrupt screen swaps.
- **Dark mode cleanup:** removed bright hardcoded surfaces from login, sync status, dashboard summary chips, dashboard preview, and ledger share QR modal.

## Project Layout

```txt
app/
  _layout.tsx              Root providers and stack
  index.tsx                Auth-aware redirect
  (auth)/                  Login flow
  (app)/                   Signed-in tabs and hidden app screens
components/
  AppTabBar.tsx            Custom bottom navigation
  Donut.tsx                Dashboard chart
  ShibaMascot.tsx          Mascot artwork
  SyncStatusBadge.tsx      Sync state indicator
  icons/                   Icon renderer and sprite helpers
lib/
  auth.ts                  Sign-in/sign-out helpers
  db/                      SQLite schema and local table access
  queries/                 TanStack Query hooks
  sync/                    Supabase <-> SQLite sync routines
  supabase/client.ts       Supabase client with AsyncStorage session
  i18n/index.ts            i18next setup
  theme/colors.ts          App color palettes
messages/
  en.json ja.json th.json zh.json
providers/
  AuthProvider.tsx         Supabase session state
  ActiveLedgerProvider.tsx Active ledger selection
  ActiveTripProvider.tsx   Active trip selection
  QueryProvider.tsx        React Query client
  SyncProvider.tsx         Offline sync loop
  ThemeProvider.tsx        Theme state
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment values:

   ```bash
   cp .env.example .env
   ```

3. Fill in the Supabase URL and anon key for the shared Jaitang project.

4. For Google OAuth, Supabase Auth must allow the app scheme redirect:

   ```txt
   jaitang://auth-callback
   ```

5. Start Expo:

   ```bash
   npm run start
   ```

6. Launch with Expo Go or a simulator:

   ```bash
   npm run ios
   npm run android
   npm run web
   ```

## Data And Sync

The local database lives in SQLite and mirrors server tables with sync metadata:

- `updated_at` drives incremental pulls where the server supports it.
- `deleted_at` preserves soft deletes for tables that support tombstones.
- `_sync_state` tracks local pending rows: `clean`, `pending_create`, `pending_update`, or `pending_delete`.

The sync order is intentional:

1. Pull ledgers first.
2. Read local ledger ids.
3. Pull categories, accounts, recurring rules, and trips sequentially.
4. Sync transactions last, including pending local writes.

Do not parallelize the SQLite write transactions casually. `expo-sqlite` serializes transactions on one connection, and the current sync code avoids transaction collisions by running table pulls sequentially.

## Common Commands

```bash
npm run start
npm run ios
npm run android
npm run web
npm run lint
```

## Current Caveats

- README may lag behind fast UI iteration; check the actual files under `app/`, `providers/`, `lib/db/`, `lib/queries/`, and `lib/sync/` when in doubt.
- The mobile app assumes the Supabase schema and RPCs used by the web app are present.
- Some screens are still evolving visually and functionally, especially insights and deeper settings flows.
- Default category seeding is idempotent but depends on the server RPC exposed by the backend.
- Recurring transactions and trips are currently mirrored with replace-all pull semantics because the server tables do not expose soft-delete tombstones.
