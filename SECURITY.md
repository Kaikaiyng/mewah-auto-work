# Publication and credential handling

This repository is a source-only portfolio snapshot. Customer exports, operational
records, screenshots, archives, installers, third-party DLLs, diagnostic backups,
account seeds, and live credentials are intentionally excluded. Application branding
is retained. Examples use reserved domains and fictional records.

Keep all passwords and integration tokens in environment variables or private
configuration outside the checkout. Never put secrets in `VITE_*` variables: those
are embedded in browser JavaScript. Copy `.env.example` to an ignored local file.
Provision administrator accounts privately; no ready-made account seed is included.
Local demo credentials are explicitly fictional and work only in opt-in development
mode, never production authentication.

AutoCount requires separately installed licensed assemblies and runtime configuration;
see `Autocount_Sync_Program/RUNTIME_CONFIGURATION.md`.

Before every push, run `node tools/check-public-snapshot.mjs` and Gitleaks against
both the working files and the Git history. CI runs these checks too, but CI happens
after upload and is not a substitute for checking before pushing.

In a new clone, install Gitleaks on PATH and enable the pre-push guard with
`git config core.hooksPath .githooks`. This blocks a push when the policy or history
scan fails, or the scanner is unavailable. Never bypass the guard with `--no-verify`.

## Incident follow-up before making this repository public

An earlier private version contained credentials. Treat database/AutoCount passwords
and the Telegram bot token from that version as exposed and rotate/revoke them at
their providers. Check the sync token and any reused passwords as well. Removing
files or rewriting Git history does not revoke a credential.

Old local checkouts must not be pushed or merged into this snapshot. GitHub may retain
unreachable commits after a force push. Complete GitHub's sensitive-data removal
process for cached commits before changing visibility. Keep this repository private
until credential rotation and remote retention cleanup are confirmed.
