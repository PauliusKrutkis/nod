# Development

How to build and run Nod from source. If you only want to use the app, the
[README](../README.md#install--auto-updates) has the install instructions and
you do not need any of this.

Nod is source-available, not a community project: the licence
([FSL-1.1-Apache-2.0](../LICENSE.md)) lets you read, build and modify it, and
outside pull requests are not part of the plan today. Issues are welcome.

## Prerequisites

- **Node 18+** and **pnpm** (the repo pins pnpm 11 via `packageManager`)
- **Rust toolchain**, via [rustup](https://rustup.rs). Tauri compiles a native
  binary, so the desktop app will not start without it.
- **Platform build dependencies for Tauri**, listed at
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/). On
  macOS that is the Xcode Command Line Tools.

## Layout

A pnpm workspace with two apps.

| Path | What it is |
| --- | --- |
| `apps/desktop` | The Tauri app: React 19 + TypeScript frontend, Rust backend in `src-tauri/` |
| `apps/web` | [nodreview.com](https://nodreview.com): Astro static site plus the Cloudflare Pages Functions behind licensing |
| `docs` | Architecture, testing, releasing, design and backlog |
| `packaging` | Homebrew cask template |
| `scripts` | Landing-page capture, download stats |

## Run it

```bash
pnpm install

pnpm dev:desktop   # the desktop app (needs the Rust toolchain)
pnpm dev           # the frontend alone, in a browser, against the Tauri bridge
pnpm dev:web       # the marketing site

pnpm build         # typecheck plus a frontend production build
pnpm tauri build   # a distributable bundle
```

The first `pnpm dev:desktop` compiles the Rust side and takes a few minutes.
Later runs are fast.

## Sign-in credentials

Release builds bake the OAuth client IDs in at build time, so an installed Nod
just works. A local build has no credentials, and the sign-in buttons show a
"needs setup" hint until you provide them. Two ways around it: paste a personal
access token in the app and skip the rest of this section, or register your own
OAuth apps as below.

Both live in `apps/desktop/src-tauri/.env` (gitignored, see
`.env.example`). Real shell environment variables win over the file, so you can
`export` them instead.

### GitHub

1. **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   ([direct link](https://github.com/settings/applications/new)).
2. Set the **Authorization callback URL** to exactly
   `http://127.0.0.1:8765/callback`. The homepage URL can be anything.
3. Create it, copy the **Client ID**, and generate a **client secret**.
4. Write both into `apps/desktop/src-tauri/.env`:

   ```dotenv
   NOD_GH_CLIENT_ID=Ov23xxxxxxxxxxxxxxxx
   NOD_GH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```

The callback uses a fixed loopback port, 8765. GitHub OAuth Apps do not support
PKCE, so the authorization-code flow needs the secret; for a single-user desktop
tool that is an acceptable trade.

### GitLab

1. **GitLab → Preferences → Applications → Add new application**
   ([direct link](https://gitlab.com/-/user_settings/applications)).
2. Redirect URI `http://127.0.0.1:8765/callback`, scope `api`. Uncheck
   **Confidential** (public client, PKCE) and uncheck **Expire access tokens**,
   otherwise tokens die after two hours and you re-authenticate constantly.
3. Write the application ID into `apps/desktop/src-tauri/.env`:

   ```dotenv
   NOD_GITLAB_CLIENT_ID=xxxxxxxx
   ```

Self-managed GitLab registers applications per instance, so use a personal
access token with the `api` scope plus your host URL instead.

## Checks

CI runs the same commands. `pnpm check` is the lint gate and is stricter than a
plain Biome run, so use it before pushing.

```bash
pnpm check      # ultracite lint and format check
pnpm typecheck
pnpm test       # vitest, apps/desktop
pnpm e2e        # playwright against vite with a mocked Tauri bridge
pnpm knip       # unused files, exports and dependencies

cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

pnpm --filter @nod/web test
pnpm --filter @nod/web run check
pnpm e2e:web
```

`pnpm fix` applies what the lint gate can fix on its own.

[TESTING.md](TESTING.md) describes what each suite covers and why.

## Where to read next

- [ARCHITECTURE.md](ARCHITECTURE.md) for layering, state, caching and the
  comment conventions this codebase actually enforces
- [RUST.md](RUST.md) for the Tauri backend module map
- [RELEASING.md](RELEASING.md) for cutting a release, signing and the
  commercial-launch design
- [DESIGN.md](DESIGN.md) for the product decisions behind the interaction model
