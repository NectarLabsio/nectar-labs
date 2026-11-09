---
name: reference-repo-tags
description: Git tag formats and where CLI grammar lives in near-cli-rs, near-sdk-rs, cargo-near source (for /tmp/research clones)
metadata:
  type: reference
---

- near-cli-rs: tag `vX.Y.Z`. Grammar = interactive_clap structs under src/commands/**; `#[interactive_clap(long)]` field `foo_bar` → `--foo-bar`; positional = plain fields; docs/GUIDE.en.md examples are mostly current, docs/NEW_NEAR_CLI_INTERFACE.md is stale (C-004, 2026-11-10).
- near-sdk-rs: tag `near-sdk-vX.Y.Z`; exports in near-sdk/src/lib.rs, env fns in environment/env.rs.
- cargo-near: tag `cargo-near-vX.Y.Z`; build flags in cargo-near-build/src/near/build/mod.rs and README RUSTFLAGS section.
- crates.io JSON API (`/api/v1/crates/<name>`) needs a User-Agent header.
- near/docs (docs.near.org source): Mintlify .mdx at repo root (web3-apps/, protocol/, data-infrastructure/), no docs/ dir; zsh has no `--include=*.md` globbing issues if you grep dirs directly.
- near-connect (@hot-labs/near-connect) source is github.com/hot-dao/near-selector (not hot-labs/near-connect); wallet list in repository/manifest.json.
- 1Click OpenAPI: https://1click.chaindefuser.com/docs/v0/openapi.yaml. Hermes: use `curl -g` for `ids[]=`; as of 2026-11-09 `/v2/updates/price/latest` returned 401 (C-007).
