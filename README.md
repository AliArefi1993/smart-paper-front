This is the frontend for the Smart Paper weekly planner.

## Run Frontend

```bash
cd /home/aliarefi/Documents/programming/playground/smart-paper-front
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Backend Connection
By default, the app calls backend API on:
- `http://127.0.0.1:8010/api`

You can override it with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010/api npm run dev
```
