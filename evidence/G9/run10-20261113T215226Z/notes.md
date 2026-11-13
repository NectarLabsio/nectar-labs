# G9 run 10 (WO-97) running notes — verifier, fresh local clone of d55ba25 at /tmp/g9-run10-20261113T215226Z

- 21:52:26Z clone `git clone /Volumes/T7/nectar-labs` + `git checkout d55ba25`; git status clean (0 lines). No listener on 3000/3100/8788/8789/18788/18789.
- Part A (21:52:58Z–21:53:33Z): pnpm i exit 0 (5 s); pnpm demo:testnet exit 1 (2 s): `list_positions` -429 from the default FastNear RPC;
  pnpm verify exit 1 (17 s): verify:quick green, then 50-verify.sh `get_health` -429; docs-site build exit 0 (9 s); gitleaks exit 0 (2 s).
- Part A2 (21:54:21Z–21:55:47Z) with README's documented override NEAR_RPC_URL=https://rpc.testnet.near.org: demo:testnet exit 0 (37 s), verify exit 0 (46 s).
  Guess/friction: the README default RPC throttles this machine; a stranger has to know to set NEAR_RPC_URL (README documents it in the command table).
- Repo shape: product diff 54bdd32..d55ba25 over apps packages services contracts EMPTY; no tracked file > 5 MB (largest 3.48 MB evidence/G3/design/home-1440-light.png);
  0 files with `[/]Users[/][A-Za-z]`; 2 `/home/x/` hits (docs/EVIDENCE.md:1289,1326 + run9 checks-d.txt quoting them = the pattern itself, false positive);
  top level = README LICENSE SECURITY CLAUDE.md package.json pnpm-* Cargo.* .gitignore .github .claude(settings.json + 2 hooks) apps packages services contracts scripts docs evidence
  + kept quoter solana evm landing + dotfiles .dockerignore .env.example .githooks .gitleaks.toml .railwayignore.
- Link check (/tmp/g9-run10-20261113T215226Z.logs/linkcheck.mjs, 245 md files, 78 relative targets): 2 broken —
  docs/EVIDENCE.md:520 `[https://feed-production…](…)` (ellipsis as target, inside a quoted line) and docs/FACTS.md:223 `[production domains](/docs/domains/working-with-domains/add-a-domain)`
  (quoted Vercel docs text with its site-relative link); 1 dead same-file anchor docs/FACTS.md:251 `#external-faucet` (quoted NEAR docs text). No broken link to a repo file.
- demo:testnet oracle line: `$135.00 (age 2854s, fresh)` at ~21:53Z (README:43 "58 s old" at 20:13Z; read time intact).
