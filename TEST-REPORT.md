# Verification report

## Passed locally

`npm test`: **9 tests passed, 0 failed**.

- Valid exact-version-shaped settings, malformed/wildcard input rejection, and numeric limits.
- Owner name matching and optional UUID matching/rejection.
- Inventory/status retrieval from stubbed bot state.
- Command rejection, state cleanup, and cancellation generation changes.
- A real locally started HTTP server: page/assets, authentication rejection, correct login, protected settings, disk persistence, command submission/error reporting, logout, and rejection of the expired session.
- JavaScript syntax checks for server, bot, and browser script.

Installed runtime dependencies: Mineflayer **4.39.0**, mineflayer-pathfinder **2.4.5**. The installed protocol library advertises 1.21 variants through 1.21.11 and 26.1. That advertisement does not establish gameplay/plugin compatibility with your exact server.

## Not verified

- Your actual play.hosting address, server version, network access, whitelist, mods/plugins, and bot policies.
- Microsoft sign-in using a real paid Minecraft account.
- Actual navigation/mining/chopping/crafting or other gameplay on a Minecraft server.
- Browser-driven visual/end-to-end interaction, Docker image build, external deployment, HTTPS setup, host reboot recovery, or a 24-hour uptime run.

No Minecraft server/account was provided. No bot is deployed or currently connected. Gameplay unit tests use simulated bot objects; they are not Minecraft integration tests.

## Dependency audit

`npm audit --omit=dev` reported 6 moderate entries, 0 high, and 0 critical. Entries propagate from UUID usage through Mineflayer’s authentication dependencies. Advisory: https://github.com/advisories/GHSA-w5hq-g745-h8pq . No forced downgrade or untested major dependency override was applied. Re-audit before deployment.
