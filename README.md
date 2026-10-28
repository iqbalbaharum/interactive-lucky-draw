# Duck Draw

An interactive Duck Hunt-style lucky draw. The canvas artwork is drawn locally in code; the scene uses pixel sprites inspired by the supplied references.

## Run

Requires Node.js 22+ and Docker Compose.

1. Copy `.env.example` to `.env` and replace both passwords with random values. The initial deployment already has a private `.env` generated.
2. `docker compose up -d --wait`
3. `npm install`
4. `npm run dev`
5. Open http://localhost:3020/draw

`/draw` is an edge-to-edge stage with sound and fullscreen controls. `/control` provides the two event actions: **Start** runs the dog sniff and keeps the eligible flock flying; **Hit** selects one winner and starts the shot, falling duck, retrieval, and winner reveal. The flock uses cached pixel sprites, varied deterministic flight paths, and direction-aware facing.

## Database

MySQL 8.4 runs as `duck-draw-mysql`, bound only to `127.0.0.1:3307`. The application user owns the `duck_draw` database; root credentials are separate. The `mysql_data` named volume persists across container recreation. Do not use `docker compose down -v` unless you intend to erase the database.

`npm run db:check` verifies application-user connectivity and writes a temporary verification record. After container recreation, `npm run db:check -- --read` verifies persistence; `npm run db:check -- --cleanup` removes the verification table. The preview does not query the database or store participant data.

## Checks

`node scripts/test-flocking.mjs` verifies smooth nearest-neighbor steering, spacing, edge wrapping, frame-rate independence, and final flight positions for the shot. `node scripts/check-flocking.mjs` checks a simulated 600-duck draw and mid-flight reload in Chromium without writing participant data. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if using an existing Chromium installation.

`npm run build` checks production compilation and TypeScript. With the development server running and Playwright Chromium installed, `node scripts/check-preview.mjs` checks the demo sequence, replay, and screen sizes. Screenshots are written to `/tmp/duck-draw-*.png`.

## Event application

In **Previous winners**, choose **Invalidate & return to draw** and confirm to make a completed winner eligible again. The participant count updates automatically. The old draw stays in history marked invalidated, and repeat requests cannot add the participant twice or clear a later win.

- `/register` is the public mobile registration page. It requires full name, a Malaysian mobile number, and a 12-digit Malaysian IC number. Duplicate phone numbers and IC numbers are rejected.
- `/admin` is the shared-password event room. It shows live counts, participants, winner history, links to the control screen, and opens the stage. **Set `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env` before opening it.**
- `/control` is the shared-password, phone-friendly controller. It has two large actions: Start and Hit.
- `/draw` is the full-screen stage. It polls live status each second and uses the participant snapshot made at Start for its flock size.

Run `npm run db:migrate` after starting MySQL to prepare the persistent schema. The first app request also runs the same safe, idempotent migration.

Start snapshots the eligible participant pool, so registrations received while ducks are flying go into the next draw. Hit cryptographically selects and reserves one participant from that snapshot. Closing the winner modal completes the draw and makes the participant ineligible for later draws.
