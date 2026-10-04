# Waypoint Ops — TechPulse

A delivery planning system for Waypoint Group, built for the Tech-Triathlon 2026 Hackathon.
This is the working implementation of the design submitted on Day 5 (see `docs/architecture.md`
for the one deliberate departure from that design, found while building the real allocation engine).

## What this is

A responsive web app covering all four roles in the delivery workflow — **Dispatcher**,
**Loader**, **Driver**, and **Store Manager** — backed by a real planning/allocation engine
and a Postgres database seeded from the competition's own `outlets.csv` and `vehicles.csv`.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

This starts three things in order: Postgres, a one-off seed step (loads the real outlets/vehicles/
calendar data and generates one realistic demo delivery day, **16 Feb 2026**, for both depots),
and the app itself. Once it's up:

- App: **http://localhost:4000**
- Postgres: localhost:5432 (user/password from `.env`)

### Seeded accounts (one per role, as required)

| Role | Username | Password | Tied to |
|---|---|---|---|
| Dispatcher | `dispatcher` | `dispatcher123` | Peliyagoda depot |
| Loader | `loader` | `loader123` | Peliyagoda / Kandy dock |
| Driver | `driver` | `driver123` | **VEH037** (ambient van) |
| Store Manager | `storemanager` | `store123` | **OUT001** (Colombo, Fresh, van_only) |

## Judge walkthrough

This walks through the full workflow on a fresh `docker compose up`, in order.

1. **Sign in as `dispatcher`.** You land on the **Planning Board** for 16 Feb 2026 at Peliyagoda.
   You'll see ~109 confirmed orders and a banner to run the allocation engine.
2. Click **Run allocation →**. The engine assigns orders to vehicles and trips, respecting
   temperature, van-only access, home depot, capacity, and the Fresh/Style-Tech time budgets
   (see `backend/src/lib/allocate.js` and `docs/data-model.md`). A handful of chilled orders
   will be deferred because three reefer trucks are seeded `in_workshop`, recreating the
   brief's "festival ramp, several vehicles in the workshop" scenario.
3. Click the **⚠ Capacity Shortfall (degradation)** tab. Orders already deferred once are
   flagged "do not defer again" and ranked first; use **Force-fit** or **Keep deferred** —
   every decision is logged with a reason.
4. **Sign out, sign in as `loader`.** Pick **VEH037 · Trip 1** from the trip list — this is the
   van carrying OUT001's dry (ambient) order. Stops are shown in **reverse delivery order**
   (load the last stop first). Tap a checkbox to mark an item loaded, or **Flag** to report a
   shortfall — this immediately writes an event the dispatcher can see.
5. **Sign out, sign in as `driver`.** You're on **Active Stop**, showing OUT001 first (VEH037's
   first stop). Tap **I've arrived**, then **Mark delivered**.
6. Click the **⚠ Offline Delivery Queue (degradation)** tab, then go back to **Active Stop** and
   tap **Toggle (demo)** in the status bar to switch to offline mode. Deliver another stop —
   it's queued locally instead of hitting the server. Switch back to the queue tab and tap
   **Sync now**. If the dispatcher deferred that same order while you were "offline" (try it:
   sign in as dispatcher in another tab and defer it before syncing), the sync will show a
   **conflict** instead of silently overwriting either side — resolve it from the same screen.
7. **Sign out, sign in as `storemanager`.** You're on OUT001's order timeline: the dry order
   now shows **delivered**, with a timestamp. Use the **Confirm receipt** panel to mark it
   Received, Short, or Damaged.

## Repository layout

```
backend/     Express API, allocation engine, Postgres schema, seed script
frontend/    React app (Vite) — one page per role
docs/        architecture.md, data-model.md, ai-disclosure.md
docker-compose.yml, Dockerfile, .env.example
```

## Local development (without Docker)

```bash
# Postgres running locally on 5432 with a `waypoint` db/user
cd backend && npm install && DATABASE_URL=postgres://waypoint:waypoint@localhost:5432/waypoint npm run seed
DATABASE_URL=postgres://waypoint:waypoint@localhost:5432/waypoint npm start   # :4000

cd ../frontend && npm install && npm run dev   # :5173, proxies /api to :4000
```

## Significant departures from the Day 5 Designathon submission

- The Designathon prototype illustratively showed OUT001's chilled order on a reefer **truck**.
  The real allocation engine correctly requires a reefer **van** for any outlet that is both
  `van_only` and `chilled` — this surfaced naturally once real constraint-checking code existed,
  and is the kind of thing the Hackathon phase is meant to catch. See `docs/architecture.md`.
- The "offline" driver experience uses a manual toggle in addition to real `navigator.onLine`
  detection, so the degradation path can be demonstrated reliably during judging without
  physically cutting network access.

## AI tool disclosure

See `docs/ai-disclosure.md`.
