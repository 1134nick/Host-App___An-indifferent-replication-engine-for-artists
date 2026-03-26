import app from "./app";
import { logger } from "./lib/logger";
import { db, messagesTable } from "@workspace/db";
import { lt, sql } from "drizzle-orm";

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

const MESSAGE_TTL_MINUTES = 30;

async function purgeExpiredMessages() {
  try {
    const cutoff = sql`now() - interval '${sql.raw(String(MESSAGE_TTL_MINUTES))} minutes'`;
    const deleted = await db.delete(messagesTable)
      .where(lt(messagesTable.createdAt, cutoff))
      .returning({ id: messagesTable.id });
    if (deleted.length > 0) {
      logger.info({ count: deleted.length }, "Purged expired messages");
    }
  } catch (err) {
    logger.error({ err }, "Error purging expired messages");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  purgeExpiredMessages();
  setInterval(purgeExpiredMessages, 60_000);
});
