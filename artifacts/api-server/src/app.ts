import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Sessions (Postgres-backed, cookie signed with SESSION_SECRET) ──────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required.");
}
const PgSession = connectPgSimple(session);
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

// Create the session table if missing — connect-pg-simple's own
// createTableIfMissing reads table.sql from its package directory, which
// doesn't exist inside the esbuild bundle. The table is also part of the
// Drizzle schema (created by the migrate step); this is a safety net.
// Awaited in index.ts before the server starts listening.
export async function ensureSessionTable(): Promise<void> {
  await sessionPool.query(
    `CREATE TABLE IF NOT EXISTS "session" (
       "sid" varchar NOT NULL COLLATE "default",
       "sess" json NOT NULL,
       "expire" timestamp(6) NOT NULL,
       CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
     );
     CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`,
  );
}

// Behind nginx (Docker) / the dev proxy — needed for secure cookies
app.set("trust proxy", 1);

app.use(
  session({
    store: new PgSession({ pool: sessionPool }),
    name: "tbnai.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  }),
);

app.use("/api", router);

export default app;
