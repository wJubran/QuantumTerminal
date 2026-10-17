# Security policy

Quantum Terminal can place real orders through your broker, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
(<https://github.com/wJubran/QuantumTerminal/security/advisories/new>).
If that option isn't available, open an issue that only asks for a private contact, with no
details.

Please include:
- what an attacker can do;
- the steps to reproduce it;
- the version you tested (shown in the terminal's footer and in the `VERSION` file).

Fixes ship as a new release. The release notes credit the reporter, unless you prefer otherwise.

You can write in English or Arabic.

## Scope

In scope:
- **The local API and WebSocket server (`backend/`).** For example, a web page or another computer
  reaching it, getting past the Host / Origin checks, or placing orders while trading is switched
  off.
- **Order handling,** with MetaTrader 5 or with the simulator's paper account.
- **The desktop shell (`electron_shell/`) and the update check.**

Out of scope:
- vulnerabilities in MetaTrader 5, brokers or other third-party services themselves;
- attacks that need someone who already controls your computer.

## Supported versions

Only the latest release receives security fixes.
