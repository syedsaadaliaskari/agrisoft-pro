/** Local calendar day, plus `days`, as YYYY-MM-DD. Matches the desktop expiry watch. */
export function expirySoonCutoff(days = 30): string {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const y = limit.getFullYear();
  const m = String(limit.getMonth() + 1).padStart(2, "0");
  const d = String(limit.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function batchIsAlarming(expiryDate: string | null | undefined, cutoff = expirySoonCutoff()): boolean {
  return Boolean(expiryDate && expiryDate <= cutoff);
}
