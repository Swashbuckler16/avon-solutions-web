import { copyDatabase } from "../lib/backup.ts";
const [command, ...args] = process.argv.slice(2);
try {
  if (command === "backup" && args.length === 1) {
    console.log(
      "Verified backup:",
      await copyDatabase(
        process.env.AVON_DB_PATH || ".local/avon.sqlite",
        args[0],
      ),
    );
  } else if (command === "restore" && args.length === 2) {
    console.log(
      "Verified restored copy:",
      await copyDatabase(args[0], args[1], true),
    );
    console.log(
      "Sessions cleared and schedules paused. Stop the app, set AVON_DB_PATH to this file, then restart and sign in.",
    );
  } else
    throw new Error(
      "Usage: npm run db:backup -- <new-backup-file> OR npm run db:restore -- <backup-file> <new-database-file>",
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Database copy failed.",
  );
  process.exitCode = 1;
}
