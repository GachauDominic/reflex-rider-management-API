/**
 * Manual Jest mock for ../index.ts (the real Drizzle/pg connection).
 *
 * Activated per test file with:
 *   jest.mock("../../src/db");
 *
 * Because this is a *manual* mock (this file), Jest substitutes it
 * without ever loading or executing the real src/db/index.ts — so the
 * real `new Pool(...)` is never constructed and DATABASE_URL never needs
 * to be set for these tests to run.
 *
 * Nothing in the mocked-controller integration tests should actually
 * reach this — controllers are mocked too, so execution never falls
 * through to the real service layer that calls Drizzle. This file
 * exists as an explicit, defensive guarantee: even if that ever
 * changes, no test using it can silently open a real database
 * connection. Each method returns a chainable stub so that if it *is*
 * ever hit, a query call like db.select().from(x).where(y) doesn't
 * crash with "x is not a function" — it just returns the same stub at
 * every step.
 */

function chainable(): any {
  const stub: any = {};
  const chainedMethods = ["from", "where", "orderBy", "limit", "returning", "values", "set"];
  for (const method of chainedMethods) {
    stub[method] = jest.fn(() => stub);
  }
  return stub;
}

export const db = {
  select: jest.fn(() => chainable()),
  insert: jest.fn(() => chainable()),
  update: jest.fn(() => chainable()),
  delete: jest.fn(() => chainable()),
};

export const pool = {
  end: jest.fn().mockResolvedValue(undefined),
};
