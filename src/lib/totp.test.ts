import { describe, expect, it } from "vitest";
import {
  generateTotp,
  normalizeSecret,
  parseSetup,
  type Algorithm,
} from "./totp";

function base32(text: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let buffer = 0,
    bits = 0,
    output = "";
  for (const byte of new TextEncoder().encode(text)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(buffer >>> bits) & 31];
    }
  }
  if (bits) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
const vectors: { algorithm: Algorithm; secret: string; codes: string[] }[] = [
  {
    algorithm: "SHA-1",
    secret: "12345678901234567890",
    codes: [
      "94287082",
      "07081804",
      "14050471",
      "89005924",
      "69279037",
      "65353130",
    ],
  },
  {
    algorithm: "SHA-256",
    secret: "12345678901234567890123456789012",
    codes: [
      "46119246",
      "68084774",
      "67062674",
      "91819424",
      "90698825",
      "77737706",
    ],
  },
  {
    algorithm: "SHA-512",
    secret: "1234567890123456789012345678901234567890123456789012345678901234",
    codes: [
      "90693936",
      "25091201",
      "99943326",
      "93441116",
      "38618901",
      "47863826",
    ],
  },
];

describe("RFC 6238", () => {
  for (const vector of vectors) {
    times.forEach((time, index) =>
      it(`${vector.algorithm} at ${time}`, async () => {
        expect(
          await generateTotp(
            {
              secret: base32(vector.secret),
              algorithm: vector.algorithm,
              digits: 8,
              period: 30,
            },
            time * 1000,
          ),
        ).toBe(vector.codes[index]);
      }),
    );
  }
  it("refreshes exactly at the boundary and preserves leading zeroes", async () => {
    const account = {
      secret: base32(vectors[0].secret),
      algorithm: "SHA-1" as const,
      digits: 6 as const,
      period: 30,
    };
    expect(await generateTotp(account, 59000)).toBe("287082");
    expect(await generateTotp(account, 59999)).toBe("287082");
    expect(await generateTotp(account, 60000)).not.toBe("287082");
    expect(await generateTotp(account, 1111111109000)).toBe("081804");
  });
});

describe("setup input", () => {
  it("accepts lowercase whitespace and valid Base32 padding", () => {
    expect(normalizeSecret(" jbsw y3dp ehpk 3pxp ")).toBe("JBSWY3DPEHPK3PXP");
    expect(normalizeSecret("MY======")).toBe("MY");
  });
  it.each([
    "",
    "123456",
    "ABC1",
    "A",
    "ABC",
    "MZ",
    "MY=",
    "MY=======",
    "========",
  ])("rejects malformed secret %s", (secret) => {
    expect(() => normalizeSecret(secret)).toThrow();
  });
  it("uses defaults with no names for a raw secret", () => {
    expect(parseSetup("JBSWY3DPEHPK3PXP")).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      name: "",
      label: "",
      algorithm: "SHA-1",
      digits: 6,
      period: 30,
    });
  });
  it("parses URI metadata and parameters", () => {
    expect(
      parseSetup(
        "otpauth://totp/GitHub%3Ayou%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA256&digits=8&period=60",
      ),
    ).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      name: "GitHub",
      label: "you@example.com",
      algorithm: "SHA-256",
      digits: 8,
      period: 60,
    });
  });
  it.each([
    "otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP",
    "otpauth://totp/Test",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&digits=7",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&algorithm=MD5",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&period=0",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&period=30.5",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&period=301",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&secret=MY",
    "otpauth://totp/A:user?secret=JBSWY3DPEHPK3PXP&issuer=B",
    "otpauth://totp/%ZZ?secret=JBSWY3DPEHPK3PXP",
  ])("rejects invalid URI settings", (uri) => {
    expect(() => parseSetup(uri)).toThrow();
  });
});
