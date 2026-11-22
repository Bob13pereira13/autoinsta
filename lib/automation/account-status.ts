/**
 * Whether an Instagram account's automations can answer: an account turned off
 * in Accounts answers nothing, and neither does one whose connection expired
 * or was revoked (it has to be reconnected). Shared by the editor, the
 * automations list and the Accounts tab.
 */
export interface AccountState {
  automationsEnabled?: boolean | null;
  tokenInvalidAt?: string | Date | null;
  tokenExpiresAt?: string | Date | null;
}

export function accountNeedsReconnect(account: AccountState, now: Date = new Date()): boolean {
  if (account.tokenInvalidAt) return true;
  if (!account.tokenExpiresAt) return false;
  return new Date(account.tokenExpiresAt).getTime() <= now.getTime();
}

/** "reconnect" wins over "off": reconnecting is needed either way. */
export function accountProblem(account: AccountState | null | undefined, now: Date = new Date()): "reconnect" | "off" | null {
  if (!account) return null;
  if (accountNeedsReconnect(account, now)) return "reconnect";
  if (account.automationsEnabled === false) return "off";
  return null;
}
