import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Copy,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  generateTotp,
  parseSetup,
  type Account,
  type Algorithm,
} from "./lib/totp";
import { readAccounts, writeAccounts, STORAGE_KEY } from "./lib/accounts";

function loadAccounts() {
  try {
    return { accounts: readAccounts(window.localStorage), error: "" };
  } catch (error) {
    return {
      accounts: [],
      error:
        error instanceof Error
          ? error.message
          : "Your browser storage is unavailable.",
    };
  }
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="modal-title"
      onClick={(event) => {
        if (event.target === ref.current) {
          const bounds = ref.current.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function AddAccount({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (account: Omit<Account, "id">) => void;
}) {
  const [error, setError] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const setup = parseSetup(String(data.get("secret") || ""));
      const algorithm = String(
        data.get("algorithm") || setup.algorithm,
      ) as Algorithm;
      const digits = Number(data.get("digits") || setup.digits) as 6 | 8;
      const period = Number(data.get("period") || setup.period);
      if (!Number.isInteger(period) || period < 5 || period > 300)
        throw new Error(
          "Refresh interval must be a whole number between 5 and 300 seconds.",
        );
      onAdd({
        ...setup,
        algorithm,
        digits,
        period,
        name: String(data.get("name") || "").trim() || setup.name,
        label: String(data.get("label") || "").trim() || setup.label,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to add this account. Please try again.",
      );
    }
  };
  return (
    <Modal title="Add an account" onClose={onClose}>
      <p className="modal-description">
        Paste the setup key from your service. Everything stays on this device.
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="secret">
            2FA secret <span className="required-label">Required</span>
          </label>
          <input
            id="secret"
            name="secret"
            type={showSecret ? "text" : "password"}
            required
            maxLength={4096}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Secret key or otpauth:// URI"
            autoFocus
            aria-describedby="secret-help"
          />
          <div className="field-help">
            <span id="secret-help">
              Use the setup secret, not a temporary 6-digit code.
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="name">
            Service name <span>Optional</span>
          </label>
          <input
            id="name"
            name="name"
            maxLength={100}
            placeholder="e.g. Google, GitHub"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="label">
            Account name <span>Optional</span>
          </label>
          <input
            id="label"
            name="label"
            maxLength={200}
            placeholder="e.g. you@example.com"
            autoComplete="off"
          />
        </div>
        <details className="advanced">
          <summary>
            Advanced settings <span>Optional</span>
          </summary>
          <p>
            Leave blank to use the setup URI settings or SHA-1, 6 digits, 30
            seconds.
          </p>
          <div className="advanced-grid">
            <div className="field">
              <label htmlFor="algorithm">Algorithm</label>
              <select id="algorithm" name="algorithm" defaultValue="">
                <option value="">Automatic</option>
                <option value="SHA-1">SHA-1</option>
                <option value="SHA-256">SHA-256</option>
                <option value="SHA-512">SHA-512</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="digits">Digits</label>
              <select id="digits" name="digits" defaultValue="">
                <option value="">Automatic</option>
                <option value="6">6 digits</option>
                <option value="8">8 digits</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="period">Interval (sec)</label>
              <input
                id="period"
                name="period"
                type="number"
                min="5"
                max="300"
                step="1"
                placeholder="Automatic"
              />
            </div>
          </div>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            <Plus size={17} /> Add account
          </button>
        </div>
        <p className="form-note">
          <LockKeyhole size={13} /> Saved only in your browser’s local storage.
        </p>
      </form>
    </Modal>
  );
}

function AccountCard({
  account,
  now,
  onDelete,
}: {
  account: Account;
  now: number;
  onDelete: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const counter = Math.floor(now / (account.period * 1000));
  const remaining = account.period - (Math.floor(now / 1000) % account.period);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    let active = true;
    setCode("");
    generateTotp(account, counter * account.period * 1000)
      .then((value) => {
        if (active) {
          setCode(value);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Unable to generate a code. Use a browser with Web Crypto support over HTTPS.",
          );
      });
    return () => {
      active = false;
    };
  }, [account, counter]);
  useEffect(() => () => clearTimeout(copyTimeout.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyError("");
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Clipboard unavailable. Select and copy the code manually.");
    }
  };
  const grouped = code
    ? `${code.slice(0, code.length / 2)} ${code.slice(code.length / 2)}`
    : account.digits === 8
      ? "•••• ••••"
      : "••• •••";
  return (
    <article className="account-card">
      <div className="account-heading">
        <div className="account-avatar" aria-hidden="true">
          {account.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="account-identity">
          <h3>{account.name}</h3>
          {account.label && <p>{account.label}</p>}
        </div>
        <button
          className="icon-button delete-button"
          aria-label={`Delete ${account.name}`}
          onClick={onDelete}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="code-row">
        <span className={`totp-code ${account.digits === 8 ? "eight-digits" : ""}`} aria-label={`Code for ${account.name}`}>
          {grouped}
        </span>
        <button
          className={`icon-button copy-button ${copied ? "is-copied" : ""}`}
          disabled={!code}
          aria-label={`Copy code for ${account.name}`}
          onClick={copy}
        >
          {copied ? <Check size={20} /> : <Copy size={20} />}
        </button>
      </div>
      <div className="account-bottom">
        <span className="refresh-label">
          <span className="status-dot" /> Refreshes in{" "}
          <strong>{remaining}s</strong>
        </span>
        <span className="account-type">TOTP · {account.digits} digits</span>
      </div>
      <span className="sr-only" role="status">
        {copied ? `Code for ${account.name} copied.` : ""}
      </span>
      {(error || copyError) && (
        <p className="card-error" role="alert">
          {error || copyError}
        </p>
      )}
    </article>
  );
}

export default function App() {
  const [initial] = useState(loadAccounts);
  const [accounts, setAccounts] = useState<Account[]>(initial.accounts);
  const [storageError, setStorageError] = useState(initial.error);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const loaded = loadAccounts();
        if (!loaded.error) setAccounts(loaded.accounts);
        setStorageError(loaded.error);
      }
    };
    window.addEventListener("storage", sync);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);
  const updateAccounts = (transform: (current: Account[]) => Account[]) => {
    const next = transform(readAccounts(window.localStorage));
    writeAccounts(window.localStorage, next);
    setAccounts(next);
    setStorageError("");
  };
  const addAccount = (draft: Omit<Account, "id">) => {
    updateAccounts((current) => {
      let index = 1;
      while (current.some((account) => account.name === `Account ${index}`))
        index++;
      const account: Account = {
        ...draft,
        id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
        name: draft.name || `Account ${index}`,
      };
      return [...current, account];
    });
    setAdding(false);
    setNotice("Account added. Saved on this device.");
  };
  const deleteAccount = () => {
    if (!deleting) return;
    try {
      updateAccounts((current) =>
        current.filter((account) => account.id !== deleting.id),
      );
      setDeleting(null);
      setNotice("Account removed from this browser.");
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Unable to remove this account.",
      );
    }
  };
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="https://rundax.com"
            aria-label="Rundax home"
          >
            rundax
          </a>
          <span className="header-divider" />
          <a href="/" className="product-name">
            2FA Authenticator
          </a>
          <span className="local-badge">
            <span className="status-dot" /> <span>Local by design</span>
          </span>
        </div>
      </header>
      <main className="main-shell">
        <section className="hero">
          <div className="eyebrow">
            <span className="eyebrow-line" /> A SMALL TOOL. A SAFER DAY.
          </div>
          <div className="hero-row">
            <div>
              <h1>
                Your codes.
                <br />
                <span>Your control.</span>
              </h1>
              <p className="hero-description">
                Two-factor authentication, without the extra baggage.
                <br className="desktop-break" /> No account. No cloud sync. Just
                you and your browser.
              </p>
            </div>
            <div className="hero-mark" aria-hidden="true">
              <div className="hero-mark-inner">
                <Fingerprint strokeWidth={1} />
                <span>PRIVATE BY DEFAULT</span>
              </div>
            </div>
          </div>
        </section>
        <div className="workspace">
          <section
            className="accounts-section"
            aria-labelledby="accounts-title"
          >
            <div className="section-heading">
              <div className="section-label">
                <h2 id="accounts-title">Your accounts</h2>
                <span className="count-badge">
                  {accounts.length.toString().padStart(2, "0")}
                </span>
              </div>
              <button
                className="button primary"
                onClick={() => setAdding(true)}
                disabled={Boolean(storageError)}
              >
                <Plus size={18} /> Add account
              </button>
            </div>
            {storageError && (
              <div className="storage-error" role="alert">
                <h3>Your saved accounts could not be loaded.</h3>
                <p>{storageError} Existing data has not been changed.</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    const loaded = loadAccounts();
                    if (!loaded.error) setAccounts(loaded.accounts);
                    setStorageError(loaded.error);
                  }}
                >
                  Try again
                </button>
              </div>
            )}
            {accounts.length ? (
              <div className="account-grid">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    now={now}
                    onDelete={() => {
                      setDeleteError("");
                      setDeleting(account);
                    }}
                  />
                ))}
              </div>
            ) : (
              !storageError && (
                <div className="empty-state">
                  <div className="empty-symbol" aria-hidden="true">
                    <KeyRound size={30} strokeWidth={1.3} />
                    <span className="empty-symbol-badge">
                      <Plus size={13} />
                    </span>
                  </div>
                  <h3>A little more peace of mind.</h3>
                  <p>
                    Add your first account and keep your
                    <br className="desktop-break" /> authentication codes close
                    at hand.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={17} /> Add your first account
                  </button>
                  <span className="empty-caption">
                    YOUR SECRETS NEVER LEAVE THIS BROWSER
                  </span>
                </div>
              )
            )}
            <div className="workspace-note">
              <LockKeyhole size={15} />
              <p>Stored on this device. Never sent to a server.</p>
            </div>
          </section>
          <aside className="info-panel">
            <div className="info-top">
              <ShieldCheck size={23} strokeWidth={1.4} />
              <span>LESS IS MORE.</span>
            </div>
            <h2>
              Private.
              <br />{" "}
              Not complicated.
            </h2>
            <p className="info-intro">
              An authenticator that stays out of your way — and out of your
              data.
            </p>
            <div className="info-feature">
              <span className="feature-number">01</span>
              <div>
                <h3>Only on your device</h3>
                <p>
                  Your accounts live in this browser’s local storage. No sign-up
                  or tracking.
                </p>
              </div>
            </div>
            <div className="info-feature">
              <span className="feature-number">02</span>
              <div>
                <h3>Always a fresh code</h3>
                <p>
                  Codes refresh automatically. Keep your device’s clock
                  accurate.
                </p>
              </div>
            </div>
            <div className="info-feature">
              <span className="feature-number">03</span>
              <div>
                <h3>One click to copy</h3>
                <p>Copy your code and get back to what matters.</p>
              </div>
            </div>
            <div className="privacy-warning">
              <LockKeyhole size={16} />
              <p>
                <strong>A note on storage</strong>Secrets are stored without
                encryption. Use a trusted device. Clearing browser data removes
                your accounts. Keep your service’s recovery codes somewhere
                safe.
              </p>
            </div>
          </aside>
        </div>
        <section className="how-it-works">
          <div className="how-title">
            <ArrowDown size={16} />
            <span>FIRST TIME HERE?</span>
          </div>
          <div className="how-steps">
            <p>
              <span>1.</span> Open your service’s 2FA setup.
            </p>
            <p>
              <span>2.</span> Copy the secret key, then add it here.
            </p>
            <p>
              <span>3.</span> Use the generated code to finish setup.
            </p>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <p>
            A small utility by <a href="https://rundax.com">rundax</a>
          </p>
          <span>Less friction. More control.</span>
          <a href="https://rundax.com" className="footer-link">
            Built with intention <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
      <div className={`toast ${notice ? "visible" : ""}`} role="status">
        {notice && (
          <>
            <Check size={17} /> {notice}
          </>
        )}
      </div>
      {adding && (
        <AddAccount onClose={() => setAdding(false)} onAdd={addAccount} />
      )}
      {deleting && (
        <Modal title="Remove this account?" onClose={() => setDeleting(null)}>
          <p className="modal-description">
            Remove <strong>{deleting.name}</strong>
            {deleting.label ? ` (${deleting.label})` : ""} from this browser?
            You won’t be able to generate its codes here anymore.
          </p>
          <div className="delete-warning">
            <ShieldCheck size={20} />
            <p>
              This does not turn off 2FA on the service. Make sure you have
              another authenticator or recovery codes before removing it.
            </p>
          </div>
          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
              autoFocus
            >
              Keep account
            </button>
            <button className="button primary" onClick={deleteAccount}>
              <Trash2 size={16} /> Remove account
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
