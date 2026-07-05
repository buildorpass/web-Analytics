import { randomBytes } from "crypto";
import { getDb } from "./db";

/** UTC date string YYYY-MM-DD for daily salt rotation. */
export function getUtcDateString(timestampMs: number = Date.now()): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

/**
 * Returns the daily salt for the given UTC date, generating and persisting
 * one lazily on first use.
 *
 * Privacy guarantee: salts rotate at UTC midnight. Visitor hashes from
 * different days use different salts, so they cannot be linked across days.
 */
export function getDailySalt(date: string): string {
  const db = getDb();

  const existing = db
    .prepare("SELECT salt FROM salts WHERE date = ?")
    .get(date) as { salt: string } | undefined;

  if (existing) {
    return existing.salt;
  }

  const salt = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO salts (date, salt) VALUES (?, ?)").run(date, salt);
  return salt;
}
