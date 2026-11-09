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
