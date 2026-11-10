// near-api-js 7.4.0 adapter (F-012). API names checked against the installed package's type
// definitions (lib/index.d.ts, lib/account-*.d.ts): JsonRpcProvider({url}), provider.callFunctionRaw
// ({contractId, method, args, blockQuery}) → {result, logs, block_height}, provider.viewAccessKey
// ({accountId, publicKey}) → {permission}, Account(accountId, provider, signer),
// account.callFunctionRaw({contractId, methodName, args, deposit, gas, waitUntil}), KeyPairSigner.fromSecretKey.
//
// Security posture: the writer can only call KEEPER_METHODS, always with 0 deposit (F-015: a
// function-call key cannot attach deposits anyway), and it never prices or builds payloads: it sends a
// position id and, for relays, the Solana tx signature it observed (a result, not an input).

import { Account, JsonRpcProvider, KeyPairSigner } from 'near-api-js';
import { KEEPER_METHODS, type KeeperMethod } from './abi.ts';

export interface ViewResult {
  value: unknown;
  blockHeight: number;
}

export type Allowance =
  | { kind: 'unlimited' }
  | { kind: 'limited'; yocto: string }
  | { kind: 'full_access' }
  | { kind: 'unknown'; reason: string };

export interface CoreReader {
  view(method: string, args: Record<string, unknown>): Promise<ViewResult>;
  keyAllowance(): Promise<Allowance>;
}

export interface TxResult {
  txHash: string;
  ok: boolean;
  failure: string | null;
  logs: string[];
}

export interface KeeperCallArgs {
  position_id: string;
  /** relay_* only: base58 Solana transaction signature. */
  solana_tx_sig?: string;
}

export interface KeeperWriter {
  call(method: KeeperMethod, args: KeeperCallArgs): Promise<TxResult>;
}

export function assertKeeperMethod(m: string): asserts m is KeeperMethod {
  if (!(KEEPER_METHODS as readonly string[]).includes(m)) throw new Error(`method ${m} is not a keeper method`);
}

export class NearCoreReader implements CoreReader {
  private readonly provider: JsonRpcProvider;
  private readonly contractId: string;
  private readonly keeperAccountId: string | null;
  private readonly keeperPublicKey: string | null;

  constructor(rpcUrl: string, contractId: string, keeperAccountId: string | null = null, keeperPublicKey: string | null = null) {
    this.provider = new JsonRpcProvider({ url: rpcUrl });
    this.contractId = contractId;
    this.keeperAccountId = keeperAccountId;
    this.keeperPublicKey = keeperPublicKey;
  }

  async view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
    const raw = await this.provider.callFunctionRaw({ contractId: this.contractId, method, args, blockQuery: { finality: 'final' } });
    const text = new TextDecoder().decode(new Uint8Array(raw.result));
    return { value: text === '' ? null : (JSON.parse(text) as unknown), blockHeight: raw.block_height };
  }

  async keyAllowance(): Promise<Allowance> {
    if (this.keeperAccountId === null || this.keeperPublicKey === null) return { kind: 'unknown', reason: 'no public key in key file' };
    try {
      const ak = await this.provider.viewAccessKey({ accountId: this.keeperAccountId, publicKey: this.keeperPublicKey });
      const p = ak.permission;
      if (p === 'FullAccess') return { kind: 'full_access' };
      if ('FunctionCall' in p) {
        const a = p.FunctionCall.allowance;
        return a === undefined || a === null ? { kind: 'unlimited' } : { kind: 'limited', yocto: String(a) };
      }
      return { kind: 'unknown', reason: 'unexpected permission kind' };
    } catch (e) {
      return { kind: 'unknown', reason: e instanceof Error ? e.message : String(e) };
    }
  }
}

export class NearKeeperWriter implements KeeperWriter {
  private readonly account: Account;
  private readonly contractId: string;
  private readonly gas: bigint;

  constructor(rpcUrl: string, keeperAccountId: string, secretKey: `ed25519:${string}`, contractId: string, gasTgas: number) {
    const provider = new JsonRpcProvider({ url: rpcUrl });
    this.account = new Account(keeperAccountId, provider, KeyPairSigner.fromSecretKey(secretKey));
    this.contractId = contractId;
    this.gas = BigInt(gasTgas) * 10n ** 12n;
  }

  async call(method: KeeperMethod, args: KeeperCallArgs): Promise<TxResult> {
    assertKeeperMethod(method);
    const res = await this.account.callFunctionRaw({
      contractId: this.contractId,
      methodName: method,
      args: args.solana_tx_sig === undefined ? { position_id: args.position_id } : { position_id: args.position_id, solana_tx_sig: args.solana_tx_sig },
      deposit: 0n,
      gas: this.gas,
      waitUntil: 'EXECUTED_OPTIMISTIC',
    });
    const logs = res.receipts_outcome.flatMap((r) => r.outcome.logs);
    const status = res.status;
    const failure = typeof status === 'object' && status !== null && 'Failure' in status ? JSON.stringify(status.Failure) : null;
    const receiptFailure = res.receipts_outcome
      .map((r) => r.outcome.status)
      .find((s) => typeof s === 'object' && s !== null && 'Failure' in s);
    const f = failure ?? (receiptFailure !== undefined ? JSON.stringify(receiptFailure) : null);
    return { txHash: res.transaction_outcome.id, ok: f === null, failure: f, logs };
  }
}
