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
