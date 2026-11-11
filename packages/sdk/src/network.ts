// Network guards shared by the web app, services and tests (review 2, R2-10). Testnet / devnet only: these refuse, they never
// switch networks. Pattern as services/x402/src/config.ts `assertTestnet`: any URL that names mainnet is refused.

/** NEAR implicit account: 64 lowercase hex chars (ed25519 key) or `0x` + 40 lowercase hex (ETH-style implicit). */
const IMPLICIT_HEX64 = /^[0-9a-f]{64}$/;
const IMPLICIT_ETH = /^0x[0-9a-f]{40}$/;

export function isImplicitAccount(id: string): boolean {
  return IMPLICIT_HEX64.test(id) || IMPLICIT_ETH.test(id);
}

/** A signer the app will hand to a wallet: a named `.testnet` account or an implicit account. `alice.near` is refused. */
export function isTestnetSigner(id: string | null | undefined): boolean {
  if (!id) return false;
  return (id.length > ".testnet".length && id.endsWith(".testnet")) || isImplicitAccount(id);
}

/** Why the connected signer is refused, or null when it is a testnet signer. */
export function testnetSignerBlock(id: string | null | undefined): string | null {
  if (!id) return "Connect a NEAR testnet wallet first.";
  if (isTestnetSigner(id)) return null;
  return `${id} is not a NEAR testnet account. Switch your wallet to testnet (an account ending in .testnet); nothing here signs on mainnet.`;
}

export class MainnetRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MainnetRpcError";
  }
}

/** True when a URL names mainnet (NEAR `rpc.mainnet.*`, Solana `api.mainnet-beta.*`, any provider with "mainnet" in it). */
export function isMainnetUrl(url: string): boolean {
  return /mainnet/i.test(url);
}

/** Return `url` unchanged, or throw when it names mainnet. `name` is the setting that carried it (e.g. NEXT_PUBLIC_NEAR_RPC). */
export function assertNotMainnetRpc(url: string, name: string): string {
  if (isMainnetUrl(url)) throw new MainnetRpcError(`refusing ${name}=${JSON.stringify(url)}: mainnet is not allowed (testnet / devnet only)`);
  return url;
}
