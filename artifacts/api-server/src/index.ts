import app, { ensureSessionTable } from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/auth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Ensure the session table and admin account exist before accepting
// requests. A DB failure here means nobody can log in — fail fast.
ensureSessionTable()
  .then(() => bootstrapAdmin())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to bootstrap admin account — exiting");
    process.exit(1);
  });
