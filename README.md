# Blockmate — real Minecraft bot + website

This is a self-hosted Node.js service: a password-protected website and a Minecraft Java client running together. The website really calls the bot; it is not a mock dashboard. Closing the browser does not stop the process.

**Deployment status: not hosted or connected to your Minecraft server.** You need a separate always-on Node.js/Docker host. A Minecraft-only play.hosting plan cannot run this service. Nothing here upgrades that plan, prevents host suspension, bypasses server rules, or guarantees 24/7 availability.

## What you need

- An always-on host that supports **Node.js 22+** (Node.js 24 recommended) or Docker, persistent disk, and outbound Minecraft TCP connections. A small VPS is one option; choose a plan that does not sleep. Budget roughly 1 GB RAM to start and monitor actual use.
- Your Minecraft server address and port, permission to use a bot, and a whitelist entry if required.
- A separate Minecraft Java account for the bot on authenticated servers. Microsoft login is through Microsoft’s device-code page; never enter your Microsoft password into this dashboard. Offline authentication works only when the server explicitly supports offline mode.
- HTTPS for remote dashboard access. Do not expose an unencrypted dashboard password to the internet.

No hosting account has been provisioned or paid for. No Minecraft credentials are included.

## Start locally or on a Node.js host

1. Install Node.js 24 and extract this folder.
2. In the folder run `npm ci`.
3. Copy `.env.example` to `.env`. Set `ADMIN_PASSWORD` to a unique random password of at least 16 characters. Do not commit this file or share it.
4. Run `npm start`.
5. Open `http://localhost:3000` on that machine and sign in with your dashboard password. On a remote server, use an SSH tunnel for initial setup: `ssh -L 3000:127.0.0.1:3000 your-user@your-host`.
6. Enter your play.hosting Minecraft address, port, bot account, and your player name as owner. Leave the version empty for detection, or enter the server’s **exact** version.
7. Save settings, then select **Connect bot**. For Microsoft authentication, complete the sign-in shown in the protected dashboard using the bot’s account.
8. Join Minecraft as the owner and type `!bot follow`. Give the bot suitable tools and food before resource gathering.

Set `HOST=127.0.0.1` in `.env` for a direct Node process that should only listen locally. On a public host, firewall port 3000 and put a properly configured HTTPS reverse proxy in front of it.

## Docker / always-on deployment

Set `ADMIN_PASSWORD` in `.env`, then run:

```sh
docker compose up -d --build
docker compose logs -f
```

The included Compose file restarts the service after a crash or host reboot (if Docker itself starts at boot), keeps configuration/authentication in a persistent volume, and binds the dashboard to **127.0.0.1:3000** by default. Access it with an SSH tunnel, or configure a host-level HTTPS reverse proxy for your domain. Do not simply change the binding to public HTTP.

Enable **Connect automatically when this service starts** in settings if you want it to join after a restart. Reconnect uses a 5–60 second backoff plus jitter for normal disconnections; bans, whitelist failures, and certain authentication errors pause retries for review. A stopped or suspended Minecraft server is not automatically started by this bot.

Microsoft authentication tokens live under `data/auth` (or the Docker volume). Keep these private: they are sensitive credentials. Do not upload the data folder or volume to a public repository. Delete cached authentication securely if the host is compromised or ownership changes.

## Owner commands

Use these in the website, or prefix them with `!bot ` in Minecraft chat:

| Command | Behavior |
| --- | --- |
| `follow` / `follow PlayerName` | Follow the nearby owner or selected nearby player |
| `come` | Walk to the nearby owner’s current location |
| `goto 100 64 -20` | Walk to coordinates within 128 blocks |
| `mine coal_ore 8` | Break up to 8 matching loaded blocks within 32 blocks |
| `chop 8` | Break up to 8 reachable nearby log/stem blocks |
| `collect` | Walk to up to 32 nearby dropped-item positions within 16 blocks |
| `craft oak_planks 4` | Execute an available recipe 4 times; needs ingredients and a nearby table for table recipes |
| `equip iron_pickaxe` | Equip an inventory item in the main hand |
| `drop cobblestone 16` | Drop items from a matching inventory stack |
| `place cobblestone 100 64 -20` | Place one block next to a solid support |
| `eat` | Eat supported safe food already in inventory |
| `sleep` / `wake` | Use a nearby bed or wake up, subject to Minecraft rules |
| `attack zombie` | One hit against a matching non-player entity within 3 blocks |
| `say Hello` | Send ordinary Minecraft chat; no slash commands |
| `status` / `inventory` / `help` | Inspect live state or list commands |
| `stop` | Cancel movement/digging/action; remain connected |

**Disconnect** stops the connection and reconnect loop. **Stop action** does not disconnect.

## Important limits and safety

- This is a deterministic command bot, not an AI that can do everything a human can. No arbitrary building blueprints, farming, smelting automation, chest workflows, continuous combat, or automatic survival guarantees are implemented.
- Resource gathering needs reachable terrain and suitable tools. It does not dig tunnels to reach a requested ore. Chopping targets logs, not whole-tree planning, and may stop at high/unreachable logs. `collect` attempts pickup by approaching items; it does not guarantee every drop is recovered. Protected regions or anti-cheat can reject actions.
- Pathfinding is configured not to dig through unrelated blocks or pillar up. Mining/placing still changes the world intentionally. Test in a disposable area and keep backups.
- Owner checks apply to commands received through Minecraft chat. Website access is a separate administrator role and can change the owner. Protect the dashboard password.
- Optional owner UUID checking rejects a mismatched/missing UUID, but **offline-mode servers cannot reliably authenticate an owner name or UUID**. Prefer a properly authenticated Minecraft server. Proxies and chat plugins may require adaptation.
- “AFK” here means the bot can remain connected and idle while its service runs. No anti-idle evasion, hosting-credit automation, ban bypass, or suspension bypass is implemented. Server rules and idle kicks still apply.
- Exact version support comes from the installed Mineflayer release and plugins. The upstream documentation lists 1.21 variants and 26.1; that is **not a promise for every 1.21.x or 26.x release**. Snapshots, mods, and later releases may not work. Match the server exactly and test before relying on it.
- Settings persist on disk. Logs are capped at 250 entries in memory; sessions expire after 12 hours and reset when the process restarts. The dashboard polls actual state every two seconds.

## Tests and dependencies

Run `npm test` after `npm ci`. Tests cover configuration validation, owner name/UUID checks, command validation/cancellation state, and real HTTP login/settings/logout behavior. Bot behavior tests use stubbed game state; they do not replace testing on an actual Minecraft server.

The package includes a dependency lockfile for reproducible installation. Review updates regularly, run `npm audit`, and test upgrades before changing a deployed bot. Third-party packages retain their own licenses.

At packaging, `npm audit --omit=dev` reported **6 moderate advisories in the dependency tree, no high or critical advisories**. These trace to a UUID buffer-bounds advisory in authentication dependencies. The suggested automatic fix downgrades Mineflayer to an obsolete major release, so it was not applied. This is a known dependency limitation, not a security certification; review upstream fixes before public production deployment. See `TEST-REPORT.md` for the verification boundary.

## What is still needed to go live

Choose/provision the separate host, upload this folder, configure a strong password and HTTPS, enter your Minecraft server/account settings, and test the actual connection and owner commands. Without that deployment, no bot is currently running 24/7.
