import { describe, expect, it, vi } from "vitest";
import { readAccounts, writeAccounts, STORAGE_KEY } from "./accounts";
import type { Account } from "./totp";

const account: Account = {
  id: "test",
  name: "Test",
  label: "",
  secret: "JBSWY3DPEHPK3PXP",
  algorithm: "SHA-1",
  digits: 6,
  period: 30,
};

describe("local storage", () => {
  it("loads empty storage", () => {
    expect(readAccounts({ getItem: () => null })).toEqual([]);
  });
  it("round-trips multiple accounts in a versioned format", () => {
    let saved = "";
    writeAccounts(
      {
        setItem: (key, value) => {
          expect(key).toBe(STORAGE_KEY);
          saved = value;
        },
      },
      [account, { ...account, id: "another", name: "Another" }],
    );
    expect(JSON.parse(saved).version).toBe(1);
    expect(readAccounts({ getItem: () => saved })).toEqual([
      account,
      { ...account, id: "another", name: "Another" },
    ]);
  });
  it.each([
    "not-json",
    "{}",
    '{"version":2,"accounts":[]}',
    '{"version":1,"accounts":null}',
    JSON.stringify({
      version: 1,
      accounts: [{ ...account, secret: "invalid!" }],
    }),
    JSON.stringify({ version: 1, accounts: [account, account] }),
    JSON.stringify({ version: 1, accounts: [{ ...account, period: 0 }] }),
  ])("rejects damaged data without writing", (raw) => {
    const setItem = vi.fn();
    const storage = { getItem: () => raw, setItem };
    expect(() => readAccounts(storage)).toThrow("Saved data is damaged");
    expect(setItem).not.toHaveBeenCalled();
  });
  it("handles blocked reads and full writes without leaking secrets", () => {
    expect(() =>
      readAccounts({
        getItem: () => {
          throw new Error(account.secret);
        },
      }),
    ).toThrow("Local storage is unavailable");
    expect(() =>
      writeAccounts(
        {
          setItem: () => {
            throw new Error(account.secret);
          },
        },
        [account],
      ),
    ).toThrow("Could not save your changes");
  });
  it("does not write invalid records", () => {
    const setItem = vi.fn();
    expect(() =>
      writeAccounts({ setItem }, [
        { ...account, digits: 7 } as unknown as Account,
      ]),
    ).toThrow();
    expect(setItem).not.toHaveBeenCalled();
  });
});
