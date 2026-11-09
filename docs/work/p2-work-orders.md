# P2 work orders (open only after P1 gates PASS or disclosed) — details in the Build Prompt §8
WO-13 researcher: Instructions sysvar + Ed25519 ix layout (F-082); @solana/kit tx building; signer gas config value (F-034); Ed25519 derivation + Solana pubkey (F-036); Anchor devnet deploy + airdrop limits.
WO-14 solana: nectar_vault (init_vault, open_position, settle w/ sysvar check, cancel_position); negative tests; devnet deploy via scripts.
WO-15 contract: Chain Signatures path (preimage → sha256 → sign Eddsa domain 1, 1 yocto, gas from config); on_signature; relay_settlement_result; cancel_settlement.
WO-16 keeper: on settlement_signed → build [Ed25519 verify ix, settle ix] → devnet → relay_settlement_result; idempotent.
WO-17 web: copilot panel with signature + attestation verification (fixture + live); settlement page with both chains side by side.
Gates: G7, G8. Then submission package + G9.
