export type Algorithm = "SHA-1" | "SHA-256" | "SHA-512";

export type Account = {
  id: string;
  name: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: 6 | 8;
  period: number;
};

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeSecret(input: string): string {
  const value = input.replace(/\s/g, "").toUpperCase();
  if (value.length > 4096 || !/^[A-Z2-7]+=*$/.test(value)) {
    throw new Error(
      "Enter a valid Base32 setup secret (letters A–Z and digits 2–7).",
    );
  }
  const raw = value.replace(/=+$/, "");
  const residue = raw.length % 8;
  const padding = value.length - raw.length;
  if (
    ![0, 2, 4, 5, 7].includes(residue) ||
    (padding > 0 && (value.length % 8 !== 0 || padding !== (8 - residue) % 8))
  ) {
    throw new Error(
      "The setup secret has an invalid Base32 length or padding.",
    );
  }
  const unusedBits = (raw.length * 5) % 8;
  if (
    unusedBits &&
    (alphabet.indexOf(raw.at(-1)!) & ((1 << unusedBits) - 1)) !== 0
  ) {
    throw new Error("The setup secret contains invalid trailing Base32 bits.");
  }
  return raw;
}

function decodeSecret(secret: string): Uint8Array<ArrayBuffer> {
  const raw = normalizeSecret(secret);
  const bytes = new Uint8Array(Math.floor((raw.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const character of raw) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >>> bits) & 255;
      buffer &= (1 << bits) - 1;
    }
  }
  return bytes;
}

export function parseSetup(input: string): Omit<Account, "id"> {
  const value = input.trim();
  const defaults = {
    name: "",
    label: "",
    algorithm: "SHA-1" as Algorithm,
    digits: 6 as const,
    period: 30,
  };
  if (!/^otpauth:/i.test(value))
    return { ...defaults, secret: normalizeSecret(value) };
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw new Error("Enter a valid otpauth://totp setup URI.");
  }
  if (
    uri.protocol !== "otpauth:" ||
    uri.hostname !== "totp" ||
    uri.port ||
    uri.username ||
    uri.password ||
    uri.hash
  ) {
    throw new Error(
      "Only otpauth://totp setup URIs are supported. HOTP is not supported.",
    );
  }
  for (const name of ["secret", "issuer", "algorithm", "digits", "period"]) {
    if (uri.searchParams.getAll(name).length > 1)
      throw new Error("The setup URI contains duplicate settings.");
  }
  const secret = normalizeSecret(uri.searchParams.get("secret") || "");
  const algorithmName = (
    uri.searchParams.get("algorithm") || "SHA1"
  ).toUpperCase();
  const algorithms: Record<string, Algorithm> = {
    SHA1: "SHA-1",
    SHA256: "SHA-256",
    SHA512: "SHA-512",
  };
  if (!(algorithmName in algorithms))
    throw new Error("Supported algorithms are SHA1, SHA256, and SHA512.");
  const digits = Number(uri.searchParams.get("digits") ?? 6);
  if (digits !== 6 && digits !== 8)
    throw new Error("Codes must have 6 or 8 digits.");
  const periodValue = uri.searchParams.get("period") ?? "30";
  const period = Number(periodValue);
  if (
    !/^\d+$/.test(periodValue) ||
    !Number.isInteger(period) ||
    period < 5 ||
    period > 300
  ) {
    throw new Error(
      "Refresh interval must be a whole number between 5 and 300 seconds.",
    );
  }
  let path: string;
  try {
    path = decodeURIComponent(uri.pathname.slice(1));
  } catch {
    throw new Error("The setup URI has an invalid account label.");
  }
  const colon = path.indexOf(":");
  const pathIssuer = colon < 0 ? "" : path.slice(0, colon).trim();
  const label = (colon < 0 ? path : path.slice(colon + 1)).trim();
  const issuer = (uri.searchParams.get("issuer") || "").trim();
  if (issuer && pathIssuer && issuer !== pathIssuer)
    throw new Error("The setup URI has conflicting service names.");
  const name = issuer || pathIssuer;
  if (name.length > 100 || label.length > 200)
    throw new Error("The service or account name is too long.");
  return {
    secret,
    name,
    label,
    algorithm: algorithms[algorithmName],
    digits: digits as 6 | 8,
    period,
  };
}

export async function generateTotp(
  account: Pick<Account, "secret" | "algorithm" | "digits" | "period">,
  timestampMs = Date.now(),
): Promise<string> {
  const counter = BigInt(Math.floor(timestampMs / 1000 / account.period));
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, counter);
  const key = await crypto.subtle.importKey(
    "raw",
    decodeSecret(account.secret),
    { name: "HMAC", hash: account.algorithm },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1] & 15;
  const truncated = new DataView(digest.buffer).getUint32(offset) & 0x7fffffff;
  return String(truncated % 10 ** account.digits).padStart(account.digits, "0");
}
