# Inventory System (React + Nest + Postgres)

## Overview
Offline-first inventory + POS + reports for a small shop. Designed for multi-device sync and barcode scanning.

## Structure
- `apps/web`: React client (offline-first, IndexedDB, service worker)
- `apps/api`: NestJS API (REST) + Postgres

## Quick Start (Local)
1. Start Postgres and create a database.
2. In `apps/api`, set `DATABASE_URL` in `.env`.
3. Install deps and run migrations.
4. Start API server.
5. In `apps/web`, set `VITE_API_BASE` (default `http://localhost:3001`).
6. Start web app.

## Notes
- Service workers and camera scanning require HTTPS or localhost.
- Offline writes are queued and synced when online.

## Scripts
### API
- `npm install`
- `npx prisma migrate dev`
- `npm run start:dev`

### Web
- `npm install`
- `npm run dev`

## Environment
API `.env` example:
```
DATABASE_URL="postgresql://user:pass@localhost:5432/inventory"
PORT=3001
```

Web `.env` example:
```
VITE_API_BASE=http://localhost:3001
```
