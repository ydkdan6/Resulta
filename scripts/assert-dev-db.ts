// scripts/assert-dev-db.ts
// Guard: aborts if DATABASE_URL is not a dev/test DB.
// Loads .env automatically so it works both standalone and via npm scripts.
import dotenv from "dotenv";
dotenv.config();

function die(msg: string): never {
  console.error(`\x1b[31m[DB GUARD] ${msg}\x1b[0m`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) die("DATABASE_URL is not set.");

if (process.env.ALLOW_DB_WRITE === "true") {
  // Explicit opt-out – allowed, but print a warning.
  console.warn("\x1b[33m[DB GUARD] ALLOW_DB_WRITE=true – skipping guard.\x1b[0m");
  process.exit(0);
}

const url = dbUrl.toLowerCase();
if (url.includes("dev") || url.includes("test")) {
  process.exit(0); // safe
}

die(
  "DATABASE_URL does not appear to be a dev/test database. " +
  "Set ALLOW_DB_WRITE=true to override (use with caution).",
);
