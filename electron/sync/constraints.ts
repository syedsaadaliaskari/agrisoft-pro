export function isSqliteConstraint(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed|FOREIGN KEY constraint failed/i.test(message);
}

/** Keep shop sync moving when a row is still referenced or already exists. */
export function trySyncWrite(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (err) {
    if (isSqliteConstraint(err)) return false;
    throw err;
  }
}
