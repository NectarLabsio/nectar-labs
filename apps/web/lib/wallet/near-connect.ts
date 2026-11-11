// near-connect 0.12.0 adapter (D-011, F-095–F-097). Client-only; the connector is created lazily so that no wallet
// manifest or wallet sandbox is fetched until the user presses "Connect wallet" (or connected in an earlier visit).
import type { TxIntent } from "@nectar/sdk";
import type { NearConnector } from "@hot-labs/near-connect";
import { RPC_URL } from "../env";
import { parseOutcome, type TxOutcome, type WalletAdapter } from "./types";

const SESSION_FLAG = "nectar-wallet-connected";

/** Root class near-connect 0.12.0 gives every popup it appends to <body> (wallet selector, sandboxed wallet frame); it toggles inline `display`. */
export const NEAR_CONNECT_POPUP = ".hot-connector-popup";

type Wallet = Awaited<ReturnType<NearConnector["wallet"]>>;

export class NearConnectAdapter implements WalletAdapter {
  readonly id = "near-connect";
  readonly label = "Meteor and other testnet wallets";
  private connector: NearConnector | null = null;
  private wallet: Wallet | null = null;


  private async get(): Promise<NearConnector> {
    if (this.connector) return this.connector;
    const { NearConnector } = await import("@hot-labs/near-connect");
    this.connector = new NearConnector({ network: "testnet", providers: { testnet: [RPC_URL] }, footerBranding: null });
    return this.connector;
  }

  private async accountOf(w: Wallet): Promise<string | null> {
    const accounts = await w.getAccounts();
    return accounts[0]?.accountId ?? null;
  }

  async restore(): Promise<string | null> {
    try {
      if (localStorage.getItem(SESSION_FLAG) !== "1") return null;
    } catch {
      return null;
    }
    try {
      const c = await this.get();
      const { wallet, accounts } = await c.getConnectedWallet();
      this.wallet = wallet;
      return accounts[0]?.accountId ?? null;
    } catch {
      return null;
    }
  }

  async connect(): Promise<string | null> {
    const c = await this.get();
    const w = await c.connect();
    this.wallet = w;
    const id = await this.accountOf(w);
    try {
      if (id) localStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* ignore */
    }
    return id;
  }

  async disconnect(): Promise<void> {
    try {
      localStorage.removeItem(SESSION_FLAG);
    } catch {
      /* ignore */
    }
    if (this.connector && this.wallet) await this.connector.disconnect(this.wallet);
    this.wallet = null;
  }

  async signAndSend(intent: TxIntent): Promise<TxOutcome> {
    const w = this.wallet ?? (await (await this.get()).wallet());
    const raw: unknown = await w.signAndSendTransaction({
      receiverId: intent.receiverId,
      actions: [{ type: "FunctionCall", params: { methodName: intent.methodName, args: intent.args, gas: intent.gas, deposit: intent.deposit } }],
    });
    return parseOutcome(raw);
  }
}
