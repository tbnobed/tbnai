import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Login session storage for connect-pg-simple (express-session).
 * Column names/types must match what connect-pg-simple expects.
 */
export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (t) => [index("IDX_session_expire").on(t.expire)],
);
