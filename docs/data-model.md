# Data model — Waypoint Ops

Full DDL is in `backend/src/schema.sql`. Reference tables are loaded directly from
the competition's `outlets.csv`, `vehicles.csv`, `calendar.csv`, `district_travel.csv`
and `service_allowance.csv`. Everything else is live operational data this system owns.

```mermaid
erDiagram
  OUTLETS ||--o{ ORDERS : "receives"
  VEHICLES ||--o{ TRIPS : "runs"
  TRIPS ||--o{ TRIP_STOPS : "contains"
  ORDERS ||--o| TRIP_STOPS : "allocated as"
  ORDERS ||--o{ EVENTS : "has history"
  USERS }o--o| OUTLETS : "store manager tied to"
  USERS }o--o| VEHICLES : "driver tied to"

  OUTLETS {
    text outlet_id PK
    text brand
    text district
    text depot
    text dock_type
    text parking_constraint
    text window_open_time
    text window_close_time
  }
  VEHICLES {
    text vehicle_id PK
    text type
    text temp
    numeric weight_cap_kg
    numeric volume_cap_m3
    text depot
    text status
  }
  ORDERS {
    text order_id PK
    text outlet_id FK
    text brand
    text temp_requirement
    numeric order_weight_kg
    numeric order_volume_m3
    date order_date
    text dispatch_status
    text defer_reason
    int times_deferred
    text receipt_status
  }
  TRIPS {
    text trip_key PK
    text vehicle_id FK
    int trip_no
    date date
    text brand
    text district
    numeric planned_minutes
  }
  TRIP_STOPS {
    int id PK
    text trip_key FK
    text order_id FK
    int seq
    text load_status
    text delivery_status
    bool recorded_offline
  }
  EVENTS {
    int id PK
    text event_type
    text order_id FK
    text actor_role
    jsonb payload
  }
  USERS {
    int id PK
    text username
    text role
    text outlet_id FK
    text vehicle_id FK
  }
```

## Why a few fields are shaped the way they are

- **`orders.times_deferred`** is incremented every time an order is deferred rather than served, and is the field the Capacity Shortfall screen sorts on. An order with `times_deferred > 0` is shown as "do not defer again" and is force-fit onto capacity before any first-time order is considered — this is how the system answers the brief's "deferrals… leave the same outlet unserved on consecutive runs" problem with an actual rule instead of a dispatcher's memory.
- **`trip_stops.seq`** is delivery order (ascending). The loader's checklist queries the same rows ordered **descending**, because goods must be loaded in reverse of the order they're delivered in — this is enforced by the query, not duplicated as separate data.
- **`trip_stops.recorded_offline`** and the **`events`** table together are the audit trail for the offline-conflict degradation scenario: a reconciled record still shows it was captured offline, and the `events` row shows which human decision resolved the conflict and when.
- **`events` is append-only and separate from current-state columns** on purpose. `orders.dispatch_status` always reflects the current decision; `events` is the full history of how it got there. A dispatcher asking "why was OUT058 deferred on Tuesday" is answered by `events`, not by overwriting a single status field.
