/** Plain labels for shop users — no account/party codes in the UI. */
export function accountLabel(a: { name: string; code?: string }): string {
  return a.name;
}

export function partyLabel(p: { name: string; code?: string }): string {
  return p.name;
}
