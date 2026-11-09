---
name: host-toolchain-quirks
description: macOS host linker fails with default SDK (MacOSX27.0, arm64e.x1 tbd); set SDKROOT to MacOSX26.5.sdk for cargo test / cargo near build; exFAT breaks incremental hard links
metadata:
  type: project
---

On Kunal's Mac (2026-11-10) the Command Line Tools default SDK is MacOSX27.0.sdk whose libSystem.tbd lists
`arm64e.x1-*` archs that ld-1267 rejects ("tapi error: malformed file"), so every host build script fails to link.

**Why:** CLT ships a newer SDK than its linker understands; not a repo problem.
**How to apply:** prefix contract builds/tests with
`SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk CARGO_INCREMENTAL=0`
(the repo is on an exFAT drive, so incremental hard-linking warns; CARGO_INCREMENTAL=0 silences it).
Plain `cargo check` on the contract crate errors by design (near-sdk demands `--cfg near`, F-027);
use `cargo check --target wasm32-unknown-unknown`, `cargo test`, or `cargo near build`.
Report this to the orchestrator/verifier if a fresh-clone gate fails at link time.
