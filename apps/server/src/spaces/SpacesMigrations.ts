import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

// Fork-owned tables keep their own history, so upstream's numbered migrations never collide with them.
export const FORK_MIGRATIONS_TABLE = "fork_sql_migrations";

const run = Migrator.make({});

const createSpaces = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS fork_spaces (
      space_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
  // Named thread_id so migrate-dev-db prunes memberships with the threads it drops.
  yield* sql`
    CREATE TABLE IF NOT EXISTS fork_space_threads (
      thread_id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      position INTEGER NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS fork_space_threads_by_space
    ON fork_space_threads (space_id, position)
  `;
});

export const runSpacesMigrations = Effect.fn("runSpacesMigrations")(function* () {
  yield* run({
    loader: Migrator.fromRecord({ "1_Spaces": createSpaces }),
    table: FORK_MIGRATIONS_TABLE,
  });
});
