const allow = new Set(
  (process.env.ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** True if the email is on the ALLOWLIST_EMAILS list. Personal-use gate. */
export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false;
  return allow.has(email.toLowerCase());
}
