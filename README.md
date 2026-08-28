# Reflex

Delivery coordination for small Kenyan retailers — replaces WhatsApp/phone-call
coordination with a system that tracks who's assigned, current status, and
proof of delivery.

## Stack

- **Runtime:** Node.js + TypeScript
- **API:** Express (REST)
- **Database:** PostgreSQL via Drizzle ORM (`pg` driver — also works against
  a hosted Postgres such as Neon using the pooled connection string)
- **Auth:** JWT, role-based (`RETAILER`, `DISPATCHER`, `RIDER`)
- **Real-time:** Server-Sent Events (`GET /api/events`)
- **Testing:** Jest + Supertest (unit + integration), k6 (performance)

## Getting started

```bash
npm install
cp .env.example .env
# edit .env — set DATABASE_URL to a real Postgres instance, and JWT_SECRET
# to a long random string

npm run db:generate   # generate SQL migrations from src/db/schema.ts
npm run db:migrate    # apply them
npm run db:seed       # create demo accounts + sample deliveries

npm run dev           # starts the API on http://localhost:4000
```

### Demo accounts (created by `npm run db:seed`)

All use the password `Password123!`.

| Email                    | Role       |
|--------------------------|------------|
| retailer@reflex.demo     | RETAILER   |
| dispatcher@reflex.demo   | DISPATCHER |
| rider@reflex.demo        | RIDER      |
| rider2@reflex.demo       | RIDER      |

## Project structure

```
src/
  db/            Drizzle schema, connection, migration runner
  middleware/    auth (JWT + role checks), rate limiting, error handling
  utils/         password hashing, JWT, state machine, confirmation codes,
                 SSE event bus, input validation
  services/      business logic — validation, DB access, state-machine
                 transitions, event recording, event-bus publishing
  controllers/   thin HTTP layer — read the request, call a service,
                 shape the response
  routes/        Express routers (map HTTP verbs/paths to controllers)
  app.ts         Express app assembly (no listener — used directly by tests)
  index.ts       entry point (starts the HTTP listener)
  seed.ts        demo data
tests/
  unit/          state machine, JWT, confirmation code logic
  integration/   auth, delivery lifecycle, riders — run against a real DB
k6/              smoke / load / stress / spike / soak / breakpoint scripts
```

Request flow: `routes → controllers → services → db`. Controllers never
touch Drizzle directly — every query, validation rule, and state-machine
check lives in `src/services/*.service.ts`, so the HTTP layer stays a thin
pass-through and the business logic is testable and reusable independent
of Express.

## Delivery lifecycle

```
OPEN → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
  └──────────┴─────────┴───────────┘
                  ↓
              CANCELLED (from any non-terminal state)
```

Every transition is enforced server-side (`src/utils/stateMachine.ts`) and
every status change is written as an immutable `DeliveryEvent` row, so a
delivery's full history is always available (`GET /api/deliveries/:id`
returns the delivery plus its event timeline).

All state-changing updates use a `WHERE`-guarded atomic `UPDATE ... RETURNING`
rather than read-then-write, so two concurrent requests (e.g. two dispatchers
assigning the same delivery) can't both succeed — the loser gets a clean
`409 Conflict` instead of corrupting state. See
`tests/integration/deliveries.test.ts` for a test that fires two concurrent
assignment requests and asserts exactly one wins.

## API reference

All endpoints except `/api/auth/login` and `/health` require
`Authorization: Bearer <token>`.

### Auth
| Method | Path              | Role       | Notes                       |
|--------|-------------------|------------|------------------------------|
| POST   | `/api/auth/login` | —          | `{ email, password }` → `{ token, user }` |
| GET    | `/api/auth/me`    | any        | current user                |

### Deliveries
| Method | Path                              | Role                      | Notes |
|--------|-----------------------------------|---------------------------|-------|
| POST   | `/api/deliveries`                 | RETAILER                  | creates in `OPEN` status, generates a confirmation code |
| GET    | `/api/deliveries`                 | any                       | scoped by role: retailer → own, rider → assigned, dispatcher → all. Optional `?status=OPEN` |
| GET    | `/api/deliveries/:id`             | owner / assigned rider / dispatcher | includes full event history |
| PATCH  | `/api/deliveries/:id/assign`      | DISPATCHER                | `{ riderId }`, requires `OPEN` |
| PATCH  | `/api/deliveries/:id/status`      | RIDER (assigned only)     | `{ status: "PICKED_UP" \| "IN_TRANSIT", note? }` |
| PATCH  | `/api/deliveries/:id/cancel`      | RETAILER (own) / DISPATCHER (any) / RIDER (own assigned) | `{ note? }`, blocked once `DELIVERED` |
| POST   | `/api/deliveries/:id/confirm`     | RIDER (assigned only)     | `{ confirmationCode }`, requires `IN_TRANSIT` → sets `DELIVERED` |

### Riders
| Method | Path                          | Role                  |
|--------|-------------------------------|-----------------------|
| GET    | `/api/riders`                 | DISPATCHER            |
| GET    | `/api/riders/:id/deliveries`  | DISPATCHER, or the rider themself |

### Real-time
| Method | Path          | Notes |
|--------|---------------|-------|
| GET    | `/api/events` | SSE stream. Browsers can't set custom headers on `EventSource`, so this endpoint also accepts `?token=<jwt>`. Filtered server-side: dispatcher sees everything, retailer/rider see only their own deliveries. |

### QR / proof of delivery

Each delivery gets a unique confirmation code at creation
(`REF-DEL-XXXXXXXX-XXXX`) — this is the value a QR code would encode. The
code itself proves nothing on its own; the backend independently checks,
on every confirm attempt, that: the delivery exists, the rider confirming
is the one it's assigned to, the delivery is currently `IN_TRANSIT`, and
it hasn't already been confirmed. See `confirmDelivery` in
`src/controllers/deliveries.controller.ts`.

## Testing

```bash
npm run test:unit          # no DB required
npm run test:integration   # requires DATABASE_URL pointed at a disposable test DB, migrated first
npm test                   # everything
```

Integration tests truncate `users`, `deliveries`, and `delivery_events`
before each test (`tests/testUtils.ts`) — **never point `DATABASE_URL` at
production data when running tests.**

### Performance (k6)

```bash
npm run k6:smoke        # sanity check — run this first, every time
npm run k6:load         # expected day-to-day traffic
npm run k6:stress       # push well past expected load, watch degradation
npm run k6:spike        # sudden burst then sudden drop
npm run k6:soak         # sustained moderate load over a long duration
                         # (soak and "endurance" testing are the same
                         # technique; override duration: `k6 run -e DURATION=4h k6/soak.js`)
npm run k6:breakpoint    # continuously increasing load to find the ceiling
```

All scripts log in with the seeded demo accounts, so run `npm run db:seed`
against the target environment first — and never against production.

## Out of scope (by design)

Live GPS tracking, payments, a customer-facing app, route optimization, SMS/
WhatsApp gateways, analytics dashboards, microservices, and fleet management
are intentionally excluded to keep this a focused MVP.
