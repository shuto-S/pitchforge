import { migratePostgres } from "@/lib/server/db/postgres-db";

await migratePostgres();
console.log("PostgreSQL schema is ready.");
