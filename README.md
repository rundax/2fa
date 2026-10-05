# Rundax 2FA

A simple, fast, and private client-side two-factor authentication (TOTP) web application.

## Overview

Rundax 2FA provides a reliable authenticator directly in your browser without requiring an account, server sync, or third-party tracking. All secrets and accounts stay local to your device.

## Features

- **100% Client-Side & Private**: Your accounts and secret keys are stored exclusively in your browser's `localStorage`. No analytics, no telemetry, and no backend databases.
- **Strict Security Headers**: Includes a hardened Content Security Policy (`default-src 'none'`) ensuring no external network requests or unauthorized scripts can run.
- **Standard TOTP Implementation**: Fully compliant with RFC 6238 using the native Web Crypto API (`SubtleCrypto`).
- **Multiple Hash Algorithms**: Supports HMAC-SHA-1, HMAC-SHA-256, and HMAC-SHA-512.
- **Flexible Configurations**: Supports standard 6-digit and 8-digit codes, plus custom time step intervals (5s to 300s).
- **Setup URI & Secret Parsing**: Accepts both raw Base32 secret keys and standard `otpauth://totp/...` setup URIs.
- **Responsive & Accessible**: Clean interface with keyboard navigation, countdown timers, and quick one-click code copying.

## Tech Stack

- **Framework**: React 19
- **Language**: TypeScript
- **Tooling**: Vite
- **Testing**: Vitest & React Testing Library
- **Icons**: Lucide React
- **Deployment**: Cloudflare Pages / Static Hosting

## Getting Started

### Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm

### Installation

```bash
git clone https://github.com/your-username/rundax-2fa.git
cd rundax-2fa
npm install
```

### Development

Start the local development server:

```bash
npm run dev
```

### Testing & Validation

Run the test suite:

```bash
npm test
```

Run TypeScript type checks:

```bash
npm run typecheck
```

Build the application for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Deployment

Deploy to Cloudflare Pages:

```bash
npm run deploy
```

*(Requires `wrangler` CLI authentication or setting the `CLOUDFLARE_ACCOUNT_ID` environment variable.)*

## Security Model

- **Local Storage**: Account data is validated and stored under a single versioned `localStorage` key.
- **No Network Transmission**: Secrets never leave the browser. TOTP generation runs locally via Web Crypto API.
- **Content Security Policy**: The application operates under a strict CSP denying external scripts, objects, form submissions, and connections.

## License

This project is licensed under the [MIT License](LICENSE).
