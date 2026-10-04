# AI tool disclosure — Hackathon submission

This submission was built with Claude (Anthropic) as an AI pair-programmer.

**AI-assisted:**
- Scaffolding of the backend (Express routes, schema, allocation engine) and frontend (React pages, styling) from a human-specified architecture and feature list.
- The seed script's generation logic for a realistic demo day, built on top of the real `outlets.csv` / `vehicles.csv` data.
- Drafting of this documentation (architecture, data model, README walkthrough).

**Human-directed / verified, not just generated:**
- The allocation engine's rules (brand+district per trip, temperature matching, van_only access, capacity, 2-trips/vehicle, Fresh vs Style+Tech time budgets) were specified directly from the challenge booklet's feasibility rules and trip-time formula, and were tested against the real dataset — the test run in this submission's history shows the engine correctly serving 103 of 109 Peliyagoda orders and deferring the rest only when reefer/van capacity was genuinely exhausted.
- The decision to reserve refrigerated vehicles for chilled orders first (rather than letting them absorb ambient demand) was identified and fixed after testing surfaced that the naive version wasted reefer capacity — this was a human-reviewed correction, not a first draft.
- The two degradation scenarios (capacity shortfall, offline delivery conflict) and their resolution rules were designed deliberately to match specific sentences in the brief, not generated generically.
- All code was read, run against a live Postgres database, and checked end-to-end (login, allocation, loading, delivery, offline sync with a real conflict, and receipt confirmation) before being included in this submission.

**Not AI-generated:**
- The underlying competition datasets (`outlets.csv`, `vehicles.csv`, `calendar.csv`, `district_travel.csv`, `service_allowance.csv`) are the organizers' own data, used as supplied and not modified.

No proprietary or third-party code was copied into this repository beyond the open-source npm packages declared in `package.json`.
