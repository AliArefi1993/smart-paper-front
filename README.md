This is the frontend for the Smart Paper weekly planner.

## Run Frontend

```bash
cd /home/aliarefi/Documents/programming/playground/smart-paper-front
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Use Frontend (Lighter, no dev mode)

When you are just using the app (not developing), run it in production mode:

```bash
cd /home/aliarefi/Documents/programming/playground/smart-paper-front
npm install
npm run build
npm run start
```

## Backend Connection
By default, the app calls backend API on:
- `http://127.0.0.1:8010/api`

You can override it with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010/api npm run dev
```

## Build Android APK

Use local data mode for Android so the app stores data on the phone instead of calling the Django backend:

```bash
cd /home/aliarefi/Documents/programming/playground/smart-paper-front

NEXT_PUBLIC_DATA_MODE=local npm run build
npx cap sync android

cd android
./gradlew assembleDebug
```

The APK is created at:

```text
/home/aliarefi/Documents/programming/playground/smart-paper-front/android/app/build/outputs/apk/debug/app-debug.apk
```

Optional: copy it to an easier filename:

```bash
cd /home/aliarefi/Documents/programming/playground/smart-paper-front
cp android/app/build/outputs/apk/debug/app-debug.apk SmartPaper-local-debug.apk
```

## Export Data

Open the app and go to `Export`.

Available files:
- `smart-paper-export.xlsx` is the human-readable Excel file with separate sheets for overview, weeks, day sections, and income.
- `smart-paper-ai-review.md` is a clean text file you can paste into an AI to ask for feedback or questions.
- `smart-paper-export.json` is the full backup format.
- `smart-paper-export.csv` is a simple spreadsheet import format.

In the backend web app, unlock Finance before exporting. In the Android app, unlock Finance first as well; Android exports from phone storage.

## Import Data

Open `Export`, unlock Finance, then use `Choose JSON Backup`.

- `Merge / upsert` keeps existing data and updates matching weeks or income entries from the backup.
- `Delete old data first` clears planner and finance data before importing the backup.

Import uses `smart-paper-export.json`. Excel, CSV, and AI Markdown are export-only formats.
