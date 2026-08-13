<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontend Development Rules

This is the frontend repository for Smart Paper. It has its own independent Git history. Run frontend Git commands from this directory:

```bash
cd smart-paper-front
```

## Stack

- Next.js 16.2.4 App Router
- React 19.2.4
- TypeScript
- Tailwind CSS 4 through `@tailwindcss/postcss`
- Capacitor Android
- `xlsx` for client-side Excel export in local mode

## Architecture

- `src/app/`: app routes.
  - `/`: `WeeklyPlanner`
  - `/finance`: `FinanceView`
  - `/export`: `ExportView`
  - `/summaries`: `WeekSummariesView`
- `src/components/`: client components for product screens and language toggle.
- `src/lib/api-client.ts`: backend API base resolution and fetch helpers.
- `src/lib/*-store.ts`: planner, finance, export/import adapters.
- `src/lib/local-store.ts`: browser localStorage implementation used by `NEXT_PUBLIC_DATA_MODE=local`.
- `src/lib/smart-paper-types.ts`: frontend API/data types.
- `src/lib/i18n.ts` and `src/lib/use-language.ts`: English/Persian translations and language state.

## API Conventions

- Use `src/lib/api-client.ts` for backend requests.
- Use the existing store adapter pattern so backend mode and local-storage mode stay aligned.
- Finance/export/import requests must include credentials in backend mode.
- Keep types in `src/lib/smart-paper-types.ts` aligned with Django JSON responses.
- Default backend API is port `8010`; `NEXT_PUBLIC_API_BASE_URL` may override it.

## Component And UX Conventions

- Existing screens are React client components with local React state.
- Keep frontend code easy for AI and humans to read.
- Prefer simple component structure, clear names, and small focused files.
- Avoid clever or overly abstract patterns when a straightforward approach works.
- Add short comments only when intent is not obvious from the code.
- Preserve English/Persian behavior and check RTL/LTR layout impacts.
- Include loading, error, empty, disabled, and locked states for user-facing workflows.
- Forms should keep labels, keyboard submission behavior, and accessible focus states.

## Commands

Install:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Start production server:

```bash
npm run start
```

Lint:

```bash
npm run lint
```

Type check:

```bash
npx tsc --noEmit
```

No frontend test script or test config was discovered.

Android local-data build:

```bash
NEXT_PUBLIC_DATA_MODE=local npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

Android stable-signed local-data release build:

```bash
scripts/build-android-release-docker.sh
```

Release signing uses the ignored local file `android/keystore.properties`; start from
`android/keystore.properties.example` and keep the real keystore private.

## Frontend Readability Rule
- Keep frontend code easy for AI and humans to read.
- Prefer simple component structure, clear names, and small focused files.
- Avoid clever or overly abstract patterns when a straightforward approach works.
- Add short comments only when intent is not obvious from the code.
