# WO-26e — web — sdk tests must not pin config values (≤ 12 tool calls; commit `test(sdk): config-agnostic flag and vault-id tests`)
main's `pnpm verify:quick` is red after config commits 8ba7650 (features enabled) and 9fb7cfb (Solana vault ids set): packages/sdk
`test/v7.test.ts` "parses config flags (all false today)" and `test/solana.test.ts` "Solana vault ids are null while TODO-G7" assert today's values.
Rewrite them to test the parsing rules (TODO → null, booleans parsed, unknown flags ignored) with inline fixture YAML/objects, and at most assert that the live
config.yaml parses with types correct — never its current values. `pnpm verify:quick` green. Write only packages/sdk (and apps/web tests if they pin the same values).
Report ≤ 5 lines.
