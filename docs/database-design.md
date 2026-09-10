# Reflex Database Design

## 1. Purpose and scope

Reflex is a delivery-coordination API for retailers, dispatchers, and riders. The database is designed to:

- identify authenticated users and their roles;
- store the current state of each delivery;
- associate deliveries with a retailer and, optionally, a rider;
- preserve an immutable status history for auditability and tracking; and
- support safe concurrent assignment and delivery confirmation.

The current design intentionally excludes payments, GPS positions, route planning, customer accounts, fleet assets, and messaging integrations.

## 2. Logical model

```mermaid
erDiagram
    USERS ||--o{ DELIVERIES : "creates / owns"
    USERS o|--o{ DELIVERIES : "is assigned"
    USERS o|--o{ DELIVERY_EVENTS : "performs"
    DELIVERIES ||--o{ DELIVERY_EVENTS : "has history"

    USERS {
        uuid id PK
        varchar name
        varchar email UK
        text password_hash
        user_role role
        varchar phone
        timestamptz created_at
    }

    DELIVERIES {
        uuid id PK
        uuid retailer_id FK
        uuid rider_id FK NULL
        varchar customer_name
        varchar customer_phone
        text address
        text item_description
        delivery_status status
        varchar confirmation_code UK
        timestamptz created_at
        timestamptz updated_at
        timestamptz delivered_at NULL
    }

    DELIVERY_EVENTS {
        uuid id PK
        uuid delivery_id FK
        uuid actor_id FK NULL
        delivery_status status
        text note NULL
        timestamptz timestamp
    }
```

### Cardinality

- One `users` row with role `RETAILER` can own many deliveries.
- One `users` row with role `RIDER` can be assigned many deliveries.
- A delivery must have exactly one retailer and may have zero or one assigned rider at a time.
- A delivery can have many delivery events. Creation records the first `OPEN` event.
- An event belongs to exactly one delivery. Its actor is nullable so the audit history can survive user deletion.

The database foreign keys establish row-level relationships. The service layer validates that `retailer_id` refers to a retailer and `rider_id` refers to a rider before creating or assigning a delivery.

## 3. Enumerated values

### `user_role`

| Value | Meaning |
|---|---|
| `RETAILER` | Creates and owns delivery requests. |
| `DISPATCHER` | Views all deliveries and assigns riders. |
| `RIDER` | Handles assigned deliveries and records progress or confirmation. |

### `delivery_status`

| Value | Meaning |
|---|---|
| `OPEN` | Created and waiting for assignment. |
| `ASSIGNED` | Assigned to a rider. |
| `PICKED_UP` | Rider has collected the package. |
| `IN_TRANSIT` | Delivery is on the way to the customer. |
| `DELIVERED` | Rider confirmed delivery using the confirmation code. Terminal state. |
| `CANCELLED` | Delivery was cancelled before completion. Terminal state. |

Allowed lifecycle:

```text
OPEN -> ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED
  |         |           |             |
  +---------+-----------+-------------+--> CANCELLED
```

The transition graph is currently enforced by service-layer predicates and atomic `UPDATE ... WHERE status ...` statements. `DELIVERED` and `CANCELLED` cannot transition further.

## 4. Physical schema

### `users`

Stores login credentials, contact information, and the role used for authorization.

| Column | Type | Nullability / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default random UUID | Stable user identifier. |
| `name` | `varchar(120)` | Not null | Display name. |
| `email` | `varchar(255)` | Not null, unique | Login identifier. The service should normalize case consistently. |
| `password_hash` | `text` | Not null | Stores a bcrypt hash, never a plaintext password. |
| `role` | `user_role` | Not null | Authorization role. |
| `phone` | `varchar(20)` | Nullable | Optional contact number. |
| `created_at` | `timestamptz` | Not null, default `now()` | Account creation time. |

Indexes:

- Unique index from `users.email`.
- `users_role_idx` on `role`, supporting rider and role-based lookups.

### `deliveries`

Stores the current representation of a delivery request and its proof-of-delivery code.

| Column | Type | Nullability / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default random UUID | Delivery identifier. |
| `retailer_id` | `uuid` | Not null, FK to `users.id`, `ON DELETE RESTRICT` | Owning retailer. |
| `rider_id` | `uuid` | Nullable, FK to `users.id`, `ON DELETE SET NULL` | Assigned rider; null while open. |
| `customer_name` | `varchar(120)` | Not null | Delivery recipient. |
| `customer_phone` | `varchar(20)` | Not null | Recipient phone number. |
| `address` | `text` | Not null | Destination address. Service validation limits it to 500 characters. |
| `item_description` | `text` | Not null | Package description. Service validation limits it to 500 characters. |
| `status` | `delivery_status` | Not null, default `OPEN` | Current lifecycle state. |
| `confirmation_code` | `varchar(64)` | Not null, unique | QR/proof-of-delivery code. |
| `created_at` | `timestamptz` | Not null, default `now()` | Creation time. |
| `updated_at` | `timestamptz` | Not null, default `now()` | Last state update time. Maintained by the service. |
| `delivered_at` | `timestamptz` | Nullable | Set only when status becomes `DELIVERED`. |

Indexes:

- Unique index from `confirmation_code`.
- `deliveries_status_idx` for status filtering and assignment queues.
- `deliveries_retailer_idx` for retailer-scoped lists.
- `deliveries_rider_idx` for rider-scoped lists.

### `delivery_events`

Append-only status history for audit and timeline views.

| Column | Type | Nullability / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default random UUID | Event identifier. |
| `delivery_id` | `uuid` | Not null, FK to `deliveries.id`, `ON DELETE CASCADE` | Delivery whose history changed. |
| `actor_id` | `uuid` | Nullable, FK to `users.id`, `ON DELETE SET NULL` | User who caused the change. |
| `status` | `delivery_status` | Not null | Status reached by the event. |
| `note` | `text` | Nullable | Optional operational note; service input is limited to 500 characters. |
| `timestamp` | `timestamptz` | Not null, default `now()` | Event occurrence time. |

Indexes:

- `delivery_events_delivery_idx` on `delivery_id`, supporting delivery timelines.
- A future high-volume deployment may add `(delivery_id, timestamp)` for ordered history queries.

## 5. Integrity and ownership rules

### Enforced by PostgreSQL

- Primary keys uniquely identify every row.
- Unique constraints prevent duplicate user emails and confirmation codes.
- Not-null constraints prevent incomplete core records.
- Foreign keys prevent orphaned deliveries and events.
- Deleting a retailer is restricted while their deliveries exist.
- Deleting a rider nulls historical/current rider references rather than deleting delivery records.
- Deleting a delivery cascades its events because events have no meaning without their delivery.
- Enum types constrain roles and delivery statuses to known values.

### Enforced by the service layer

- A delivery owner must have role `RETAILER`.
- An assigned user must have role `RIDER`.
- The delivery transition graph and role permissions are validated before writes.
- Kenyan phone-number format and input length rules are validated.
- Confirmation requires the assigned rider, the matching code, and current status `IN_TRANSIT`.
- `delivered_at` is set when confirming delivery.
- `delivery_events` rows are written for every status transition.
- `updated_at` is refreshed for state-changing updates.

## 6. Transaction and concurrency design

A state change is protected by the prior status in the `UPDATE` predicate. For example, assignment only updates a row whose current status is `OPEN`, and confirmation only updates a row whose current status is `IN_TRANSIT`. PostgreSQL row locking makes competing requests serialize; exactly one request receives a returned row and the other receives a conflict.

The state update and its corresponding `delivery_events` insert should ideally run in one database transaction. That keeps the current status and audit history consistent if a process fails between the two writes. The event-bus publication should occur after the transaction commits so consumers do not receive an event for a rolled-back change.

## 7. Recommended integrity improvements

These are compatible hardening options for a later migration:

1. Add database `CHECK` constraints for `address`, `item_description`, and `note` lengths if the database must enforce the same limits independently of the API.
2. Add a check that `delivered_at IS NOT NULL` only when `status = 'DELIVERED'`, and consider the inverse requirement for delivered rows.
3. Add a unique, case-insensitive email strategy, such as storing normalized lowercase emails or using a functional unique index on `lower(email)`.
4. Add a composite index on `(status, created_at)` if the dispatcher queue commonly filters by status and sorts by newest first.
5. Add `(rider_id, created_at)` and `(retailer_id, created_at)` if scoped list traffic grows enough that the existing single-column indexes are insufficient.
6. Consider a database trigger or a transaction wrapper to guarantee that every current-state change has a matching event. The current application contract already requires this, but the database does not independently enforce it.

## 8. Operational considerations

- Use migrations generated from `src/db/schema.ts`; do not edit production tables manually.
- Run integration tests only against a disposable database because tests truncate all three tables.
- Back up `deliveries` and `delivery_events` together. The events table is the audit source and should be retained longer than operational delivery rows if retention policy permits.
- Monitor index usage and query plans as delivery volume grows. The current indexes target the API's retailer, rider, dispatcher, status, and timeline access patterns.
- Store only password hashes and protect `confirmation_code` as operationally sensitive delivery data.
