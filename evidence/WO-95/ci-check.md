# WO-95b §2g — GitHub CI that passes without secrets (2026-11-13 21:31–21:50Z)

## Why the old workflow never started
Both runs on NectarLabsio/nectar-labs (b6d6f41, 126e47b) ended `failure` with 0 jobs. `yaml.safe_load` (PyYAML 6.0.3) on the old
`.github/workflows/ci.yml` fails: `while parsing a flow mapping … line 10, column 14: expected ',' or '}', but got '{'`. Line 10
`env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }` puts `${{ }}` inside a flow mapping, so the file is not valid YAML and GitHub
cannot schedule any job. Line 16 `with: { targets: wasm32-unknown-unknown,wasm32-wasip2 }` was a second defect (the comma makes
`wasm32-wasip2` a separate null key). The rust job had a third: `cargo test` ran before any `cargo near build`, and
`contracts/mock-ft/tests/sandbox_faucet.rs:46` reads `target/near/mock_ft/mock_ft.wasm` without building it.

## Fresh-clone reproduction
Clone of 80a4ec9 (main 1d0149d + the scripts audit) into `/tmp/ci-check-20261113T213112Z` (internal disk). Clean environment:
fake `HOME` (no `~/.nectar`, empty pnpm store, no cargo-near state), `CI=true`, no `.env`. Node v22.23.4, pnpm 10.34.9,
rustc 1.95.0, cargo-near 0.23.0.

| Job | Steps | Result | Duration | Log |
| --- | --- | --- | --- | --- |
| node | `pnpm i --frozen-lockfile` 34 s · `pnpm lint` 1 s · `pnpm typecheck` 17 s · `pnpm test` 6 s (725 pass, 0 fail, 1 skipped) · `pnpm --filter web build` 8 s · `pnpm --filter docs-site build` 12 s | PASS | 78 s | ci-node-20261113T213112Z.log |
| node, case-sensitive APFS (Linux-like file names) | same commands, second fresh clone on a case-sensitive volume image under /tmp | PASS | 218 s (install 146 s) | ci-node-case-sensitive-20261113T213112Z.log |
| rust | `cargo near build non-reproducible-wasm` for nectar-core 45 s, mock-ft 5 s, test-stubs 6 s · `cargo test --workspace` 810 s (710 pass, 0 fail: unit 608 + 38 + 12, sandbox 52) | PASS | 866 s (14.4 min, under the 25 min limit) | ci-rust-20261113T213112Z.log |

Local-only setting: the rust run exported `SDKROOT=…/MacOSX26.5.sdk`, because this Mac's default Command Line Tools SDK 27.0 breaks
`ld` for host build scripts (`.claude/agent-memory/contract/host_toolchain_quirks.md`). The first attempt failed on that before any
repo code compiled. Ubuntu does not need the setting.

## New ci.yml
- Jobs kept: `node`, `rust`. Job dropped: `secrets` (gitleaks/gitleaks-action needs a GITLEAKS_LICENSE secret for org-owned repos, and
  no secret is available). The local `.githooks/pre-commit` gitleaks hook stays.
- `defaults.run.shell: bash` makes every step run as `bash --noprofile --norc -eo pipefail {0}`. No `| tail` remains, so a failure fails its step.
- Every `with:` value is quoted. The triggers use the list form `on: [push, pull_request]`. `permissions: contents: read`. The runner is pinned to ubuntu-24.04.
- Node job: checkout `fetch-depth: '0'`, because `apps/web/scripts/build-changelog.mjs` reads the git history.
- Rust job: builds the three contract wasm first, then runs `cargo test --workspace`. cargo-near 0.23.0 comes from the release
  tarball with a pinned sha256 `94008b82…a4073` (checked against the release's `.sha256` asset, and the downloaded file matched). No
  `cargo install` from source.
- `yaml.safe_load` parses the new file.

## Actions checked to exist (GitHub, 2026-11-13)
| uses | Check |
| --- | --- |
| actions/checkout@v5 | `action.yml` at ref v5 resolves, `using: node24` (releases up to v7.0.1) |
| pnpm/action-setup@v5 | ref v5 resolves, `using: node24`. v5.0.0 notes: "Updated the action to use Node.js 24". Reads `packageManager` from package.json |
| actions/setup-node@v5 | ref v5 resolves, `using: 'node24'` |
| dtolnay/rust-toolchain@1.95.0 | branch 1.95.0 exists (035fceb3), composite action with a `targets` input |
| cargo-near release cargo-near-v0.23.0 | asset `cargo-near-x86_64-unknown-linux-gnu.tar.gz` exists. The ELF needs GLIBC_2.34 (Ubuntu 24.04 ships 2.39) and libudev.so.1 |
The v4 majors run on `node20`. The v5 majors run on node24, so Node 20 deprecation on the runners does not affect them.

## Not verified
- Nothing ran on an actual GitHub Ubuntu runner, because nothing was pushed. The x86_64 Linux paths are unverified: the cargo-near
  binary, the near-workspaces sandbox download, and the Next and Docusaurus builds on Linux. The case-sensitive rerun covers only
  file-name casing.
- actionlint was not run. The download of its binary was refused by the local permission classifier.
