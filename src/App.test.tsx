// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { webcrypto } from "node:crypto";
import App from "./App";
import { STORAGE_KEY, readAccounts } from "./lib/accounts";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function add(secret = "JBSWY3DPEHPK3PXP", name = "") {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Add account" }),
  );
  fireEvent.change(screen.getByLabelText(/2FA secret/), {
    target: { value: secret },
  });
  if (name)
    fireEvent.change(screen.getByLabelText(/Service name/), {
      target: { value: name },
    });
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Add account",
    }),
  );
}

describe("account interface", () => {
  it("adds and removes accounts when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      subtle: webcrypto.subtle,
    });
    const user = userEvent.setup();
    render(<App />);
    await add();
    await add();
    const saved = readAccounts(localStorage);
    expect(saved).toHaveLength(2);
    expect(saved[0].id).toMatch(/^[a-f0-9]{32}$/);
    expect(saved[0].id).not.toBe(saved[1].id);
    await waitFor(() =>
      expect(screen.getByLabelText("Code for Account 1").textContent).toMatch(
        /^\d{3} \d{3}$/,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Delete Account 1" }));
    await user.click(screen.getByRole("button", { name: "Remove account" }));
    expect(readAccounts(localStorage)).toEqual([saved[1]]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("requires only the secret, generates codes, stores multiple accounts and survives reload", async () => {
    const view = render(<App />);
    await add();
    expect(
      screen.getByRole("heading", { name: "Account 1" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Code for Account 1").textContent).toMatch(
        /^\d{3} \d{3}$/,
      ),
    );
    await add(
      "otpauth://totp/GitHub%3Atest%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=8&algorithm=SHA256",
    );
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Code for GitHub").textContent).toMatch(
        /^\d{4} \d{4}$/,
      ),
    );
    expect(readAccounts(localStorage)).toHaveLength(2);
    view.unmount();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Account 1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
  });
  it("confirms deletion and allows cancellation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await add();
    await user.click(screen.getByRole("button", { name: "Delete Account 1" }));
    await user.click(screen.getByRole("button", { name: "Keep account" }));
    expect(readAccounts(localStorage)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Delete Account 1" }));
    await user.click(
      screen.getByRole("button", { name: "Remove account" }),
    );
    expect(readAccounts(localStorage)).toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: "A little more peace of mind." }),
    ).toBeInTheDocument();
  });
  it("rejects invalid input without saving", async () => {
    render(<App />);
    await add("123456");
    expect(screen.getByRole("alert")).toHaveTextContent("valid Base32");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("preserves damaged saved data and blocks adding", () => {
    localStorage.setItem(STORAGE_KEY, "damaged");
    render(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Existing data has not been changed",
    );
    expect(
      screen.getByRole("button", { name: "Add account" }),
    ).toBeDisabled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("damaged");
  });
  it("reports write failures without displaying an unsaved account", async () => {
    render(<App />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Full");
    });
    await add();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not save your changes",
    );
    expect(
      screen.queryByRole("heading", { name: "Account 1" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("copies without spaces", async () => {
    const user = userEvent.setup();
    render(<App />);
    await add();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copy code for Account 1" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy code for Account 1" }),
    );
    expect(copy).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/));
    expect(screen.getByText("Code for Account 1 copied.")).toBeInTheDocument();
  });
  it("synchronizes external storage changes", async () => {
    render(<App />);
    await add();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, accounts: [] }),
    );
    fireEvent(window, new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(
      screen.queryByRole("heading", { name: "Account 1" }),
    ).not.toBeInTheDocument();
  });
});
