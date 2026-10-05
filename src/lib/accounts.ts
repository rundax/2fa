import { normalizeSecret, type Account } from "./totp";

export const STORAGE_KEY = "rundax.2fa.accounts.v1";

function validateAccounts(value: unknown): Account[] {
  if (!Array.isArray(value)) throw new Error("Saved account data is invalid.");
  const ids = new Set<string>();
  return value.map((record: unknown) => {
    if (!record || typeof record !== "object")
      throw new Error("Saved account data is invalid.");
    const account = record as Record<string, unknown>;
    if (
      typeof account.id !== "string" ||
      !account.id ||
      account.id.length > 100 ||
      ids.has(account.id) ||
      typeof account.name !== "string" ||
      !account.name.trim() ||
      account.name.length > 100 ||
      typeof account.label !== "string" ||
      account.label.length > 200 ||
      typeof account.secret !== "string" ||
      !["SHA-1", "SHA-256", "SHA-512"].includes(String(account.algorithm)) ||
      (account.digits !== 6 && account.digits !== 8) ||
      typeof account.period !== "number" ||
      !Number.isInteger(account.period) ||
      account.period < 5 ||
      account.period > 300
    ) {
      throw new Error("Saved account data is invalid.");
    }
    const secret = normalizeSecret(account.secret);
    ids.add(account.id);
    return {
      id: account.id,
      name: account.name,
      label: account.label,
      secret,
      algorithm: account.algorithm as Account["algorithm"],
      digits: account.digits,
      period: account.period,
    };
  });
}

export function readAccounts(storage: Pick<Storage, "getItem">): Account[] {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    throw new Error(
      "Local storage is unavailable. Allow browser storage to save your accounts.",
    );
  }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("accounts" in parsed)
    ) {
      throw new Error("Invalid format");
    }
    return validateAccounts(parsed.accounts);
  } catch {
    throw new Error(
      "Saved data is damaged or uses an unsupported format. Recover it before making changes.",
    );
  }
}

export function writeAccounts(
  storage: Pick<Storage, "setItem">,
  accounts: Account[],
): void {
  const validated = validateAccounts(accounts);
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, accounts: validated }),
    );
  } catch {
    throw new Error(
      "Could not save your changes. Browser storage may be blocked or full. Your saved accounts have not been changed.",
    );
  }
}
