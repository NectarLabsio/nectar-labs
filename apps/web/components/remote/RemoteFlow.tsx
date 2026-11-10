"use client";
// Remote (Solana devnet) collateral: reservation → Phantom deposit → attested confirmation → Open, and release after repay
// (interface-v7 §B, WO-31). Renders only when the contract is v2 and features.solana_remote is on (callers check useFeature).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge, Banner, Button, Card, Kv } from "@nectar/ui";
import {
  LAMPORTS_PER_SIGNATURE,
  POSITION_ACCOUNT,
  authorityAsAddress,
  compileWireTransaction,
  formatCountdown,
  formatLamports,
  formatUnits,
  formatUsdE6,
  openPositionInstruction,
  planRelease,
  rentExemptFallback,
  releaseTransactionInstructions,
  remotePath,
  reservationSecondsLeft,
  txRemote,
  type PendingRelease,
  type PositionView,
  type RemoteView,
  type VaultIds,
  type VaultPosition,
} from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { SOLANA_EXPLORER_ADDR, SOLANA_EXPLORER_TX, SOLANA_FAUCET_URL } from "@/lib/env";
import { toIxPreview, useSolanaReader, useSolanaTx, waitForSignature, type SigState } from "./solana-tx";
import { useSolanaWallet, type SolanaWalletState } from "./useSolanaWallet";

export type RemotePosition = PositionView & { remote: RemoteView };
export const isRemote = (p: PositionView | null | undefined): p is RemotePosition => Boolean(p?.remote);

const NONCE_RECORD_BYTES = 59; // 8 + NonceRecord::INIT_SPACE (version u8, vault, nonce u64, position_id u64, op u8, kind u8)
const ATA_BYTES = 165;

export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function useInterval(fn: () => void, ms: number, on: boolean) {
  useEffect(() => {
    if (!on) return;
    fn();
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, on]);
}

function useVaultIds(): VaultIds | null {
  const { config } = useChain();
  return config.solana.vaultProgram && config.solana.mint ? { program: config.solana.vaultProgram, mint: config.solana.mint } : null;
}

// ------------------------------------------------------------------ labels

const STATUS_TEXT: Record<RemoteView["status"], string> = {
  AwaitingDeposit: "Awaiting deposit",
  Open: "Open",
  Releasing: "Releasing",
  Released: "Released",
  Expired: "Reservation expired",
};

export function RemoteStatusBadge({ status }: { status: RemoteView["status"] }) {
  const kind = status === "Open" ? "open" : status === "AwaitingDeposit" ? "warn" : status === "Releasing" ? "info" : status === "Expired" ? "danger" : "neutral";
  return (
    <span className={`badge ${kind}`} role="status" aria-live="polite" data-testid="remote-status" data-status={status}>
      {STATUS_TEXT[status]}
    </span>
  );
}

/** "keeper-attested" when the keeper attested the deposit (owner-enabled fallback), "OutLayer-attested" for the attested vault read. */
export function DepositSourceBadge({ source }: { source: RemoteView["source"] }) {
  if (source === "keeper") return <Badge kind="fallback" title="Deposit attested by the keeper key (owner flag allow_keeper_deposit_attestation), not by an attested OutLayer vault read."><span data-testid="deposit-source">keeper-attested</span></Badge>;
  if (source === "outlayer") return <Badge kind="verified" title="Deposit read from the Solana vault by an attested OutLayer job."><span data-testid="deposit-source">OutLayer-attested</span></Badge>;
  return null;
}

// ------------------------------------------------------------------ steps

export type RemoteStep = "reserve" | "deposit" | "confirm" | "open";
export function RemoteSteps({ current }: { current: RemoteStep }) {
  const order: RemoteStep[] = ["reserve", "deposit", "confirm", "open"];
  const label: Record<RemoteStep, string> = { reserve: "Reserve on NEAR", deposit: "Deposit on Solana", confirm: "Attested confirmation", open: "Open, USDC paid" };
  const at = order.indexOf(current);
  return (
    <ol className="rsteps" aria-label="Solana borrow steps" data-testid="remote-steps">
      {order.map((s, i) => (
        <li key={s} data-state={i < at ? "done" : i === at ? "current" : "todo"} aria-current={i === at ? "step" : undefined}>
          {label[s]}
        </li>
      ))}
    </ol>
  );
}

export function stepOf(r: RemoteView, depositSeen: boolean): RemoteStep {
  if (r.status === "Open" || r.status === "Releasing" || r.status === "Released") return "open";
  return depositSeen ? "confirm" : "deposit";
}

// ------------------------------------------------------------------ Solana wallet states

function SolanaWalletBlock({ sol, need, children }: { sol: SolanaWalletState; need: string; children: ReactNode }) {
  if (sol.wallets.length === 0)
    return (
      <Banner tone="info" title="No Solana wallet found" role="status">
        <span data-testid="no-phantom">
          Install Phantom (or any Wallet Standard Solana wallet), switch it to devnet, then reload this page to {need}.{" "}
          <a className="link" href="https://phantom.com/download" target="_blank" rel="noreferrer noopener">Get Phantom</a>
        </span>
      </Banner>
    );
  if (!sol.account)
    return (
      <Banner tone="info" title="Connect Phantom (devnet)" actions={<Button size="sm" variant="primary" loading={sol.connecting} onClick={() => sol.connect()}>Connect {sol.wallets[0]?.name ?? "wallet"}</Button>}>
        Connect a Solana devnet wallet to {need}. It only signs Solana devnet transactions shown to you first.
        {sol.error ? <span className="danger-text small"> {sol.error}</span> : null}
      </Banner>
    );
  if (!sol.devnet)
    return (
      <Banner tone="danger" title="Wrong Solana cluster">
        <span data-testid="wrong-cluster">{sol.wallet?.name ?? "Your wallet"} does not offer Solana devnet for this account. Switch it to devnet (Phantom: Settings, Developer settings, Testnet mode); nothing here runs on mainnet.</span>
      </Banner>
    );
  return <>{children}</>;
}

function NoSol({ needLamports }: { needLamports: bigint }) {
  return (
    <Banner tone="warn" title="Not enough devnet SOL">
      <span data-testid="no-sol">
        This transaction needs about {formatLamports(needLamports)} for the fee and rent.{" "}
        <a className="link" href={SOLANA_FAUCET_URL} target="_blank" rel="noreferrer noopener">Get devnet SOL</a>.
      </span>
    </Banner>
  );
}

function SigLine({ s }: { s: SigState }) {
  const text = { sending: "Waiting for devnet confirmation", confirmed: "Confirmed on devnet", failed: "Failed on devnet", unseen: "Not seen on devnet" }[s.status];
  return (
    <div className="stack-sm" aria-live="polite">
      <Kv k="Solana transaction" v={<a className="link mono" href={SOLANA_EXPLORER_TX(s.sig)} target="_blank" rel="noreferrer noopener">{s.sig.slice(0, 12)}…</a>} />
      <Kv k="Status" v={<span data-testid="sol-sig-status">{text}</span>} />
      {s.status === "unseen" ? <Banner tone="danger" title="Not on devnet">The wallet reported a signature that devnet does not know. It probably sent the transaction to another cluster: switch the wallet to devnet.</Banner> : null}
      {s.status === "failed" ? <Banner tone="danger" title="Transaction failed">Devnet rejected the transaction. Nothing moved; open it in the explorer for the program log.</Banner> : null}
    </div>
  );
}

// ------------------------------------------------------------------ reservation

export function ReservationCard({ pos }: { pos: RemotePosition }) {
  const { config } = useChain();
  const now = useNow();
  const r = pos.remote;
  const left = r.status === "AwaitingDeposit" ? reservationSecondsLeft(r, now, config.v7.reservation_expiry_s) : null;
  const expired = r.status === "Expired" || left === 0;
  return (
    <Card label={`Reservation #${pos.id}`} actions={<RemoteStatusBadge status={expired && r.status === "AwaitingDeposit" ? "Expired" : r.status} />}>
      <div className="kvs">
        <Kv k="MPC path" v={<span className="mono">{r.path ?? remotePath(pos.id, config.v7.remote_path_prefix)}</span>} />
        <Kv k="Stored authority" v={r.authority ? <span className="addr" data-testid="remote-authority">{r.authority}</span> : <span className="dim">deriving on NEAR…</span>} />
        {r.authority ? <Kv k="As Solana address" v={<span className="addr">{authorityAsAddress(r.authority)}</span>} /> : null}
        <Kv k="Units to deposit" v={`${formatUnits(BigInt(r.units ?? pos.units), config.solana.decimals)} ${pos.collateral}`} />
        <Kv k="Borrow" v={formatUsdE6(pos.debt_usd_e6)} />
        {left !== null ? <Kv k="Reservation expires in" v={<span className="num" data-testid="reservation-countdown">{expired ? "expired" : formatCountdown(left)}</span>} /> : null}
      </div>
      {r.authority ? <p className="caption" style={{ marginTop: 10 }}>This key is derived by NEAR for position #{pos.id} (Chain Signatures, path above). Only a signature from it can move the deposit on Solana.</p> : null}
    </Card>
  );
}

function ExpiredBanner({ pos, onChanged }: { pos: RemotePosition; onChanged: () => void }) {
  const { config } = useChain();
  const sign = useSign();
  const { accountId } = useWallet();
  return (
    <Banner
      tone="danger"
      title="Reservation expired"
      actions={accountId && config.core ? <Button size="sm" onClick={async () => { await sign(txRemote.expireReservation(config.core!, pos.id), { success: "Reservation expired" }); onChanged(); }}>Close reservation</Button> : undefined}
    >
      <span data-testid="reservation-expired">The 30-minute window to deposit has passed. Do not deposit for this id: reserve again from Borrow.</span>
    </Banner>
  );
}

// ------------------------------------------------------------------ deposit + confirm

/** Deposit with Phantom, then wait for the attested confirmation. `loadedAt` is when the parent last read the NEAR position. */
export function RemoteDeposit({ pos, onChanged, loadedAt, onSeen }: { pos: RemotePosition; onChanged: () => void; loadedAt: number; onSeen?: (seen: boolean) => void }) {
  const { config } = useChain();
  const sign = useSign();
  const { accountId } = useWallet();
  const ids = useVaultIds();
  const sol = useSolanaWallet();
  const reader = useSolanaReader();
  const tx = useSolanaTx(sol);
  const now = useNow();
  const r = pos.remote;
  const units = BigInt(r.units ?? pos.units);
  const left = reservationSecondsLeft(r, now, config.v7.reservation_expiry_s);
  const expired = r.status === "Expired" || left === 0;

  const [bal, setBal] = useState<{ lamports: bigint; tokens: bigint } | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  const [rent, setRent] = useState<bigint>(rentExemptFallback(POSITION_ACCOUNT.size));
  const [vp, setVp] = useState<VaultPosition | null | undefined>(undefined);
  const [sig, setSig] = useState<SigState | null>(null);
  const [confirmAt, setConfirmAt] = useState<{ at: number; failure: string | null } | null>(null);

  const loadBal = useCallback(() => {
    if (!sol.address || !ids) return;
    Promise.all([reader.balanceLamports(sol.address), reader.tokenBalance(sol.address, ids.mint)])
      .then(([lamports, tokens]) => {
        setBal({ lamports, tokens });
        setBalErr(null);
      })
      .catch((e: unknown) => setBalErr(e instanceof Error ? e.message : String(e)));
  }, [sol.address, ids, reader]);
  useEffect(loadBal, [loadBal]);
  useEffect(() => {
    reader.rentExemptLamports(POSITION_ACCOUNT.size).then(setRent, () => undefined);
  }, [reader]);

  // Poll the vault PDA (deposit landed?) and the NEAR position (attested?) every 5 s while awaiting.
  const awaiting = r.status === "AwaitingDeposit" && !expired;
  useInterval(() => {
    if (ids) reader.vaultPosition(ids, BigInt(pos.id)).then(setVp, () => undefined);
  }, 5000, Boolean(ids) && awaiting);
  const depositSeen = Boolean(vp) || sig?.status === "confirmed";
  useInterval(onChanged, 5000, awaiting && depositSeen);
  useEffect(() => onSeen?.(depositSeen), [depositSeen, onSeen]);

  const need = LAMPORTS_PER_SIGNATURE + rent;
  const noSol = bal !== null && bal.lamports < need;
  const noTokens = bal !== null && bal.tokens < units;

  const deposit = async () => {
    if (!ids || !sol.address || !r.authority) return;
    const d = await openPositionInstruction(ids, { depositor: sol.address, positionId: BigInt(pos.id), authority: r.authority, amount: units });
    const payer = sol.address;
    const s = await tx.request(
      {
        label: `Deposit ${formatUnits(units, config.solana.decimals)} ${pos.collateral} on Solana`,
        network: "Solana devnet",
        feePayer: payer,
        instructions: [toIxPreview(d)],
        fees: [
          { label: "Network fee (1 signature)", value: formatLamports(LAMPORTS_PER_SIGNATURE) },
          { label: `Rent for the position account (${POSITION_ACCOUNT.size} bytes; returned to you when it closes)`, value: formatLamports(rent) },
        ],
        feesTotal: formatLamports(need),
        note: `Moves ${units} base units of mock ${pos.collateral} from your token account into the vault, locked to the NEAR-derived authority.`,
      },
      async () => compileWireTransaction([d.instruction], payer, await reader.latestBlockhash()),
    );
    if (!s) return;
    setSig({ sig: s, status: "sending" });
    const status = await waitForSignature(reader, s);
    setSig({ sig: s, status });
    loadBal();
  };

  const confirmNow = async () => {
    if (!config.core) return;
    const out = await sign(txRemote.confirmDeposit(config.core, pos.id), { success: "Confirmation requested" });
    if (!out) return;
    setConfirmAt({ at: Date.now(), failure: out.ok ? null : out.failure });
    onChanged();
  };
  // OutLayer could not confirm: the call failed, or it ran and the position is still AwaitingDeposit on the next read.
  const confirmFailed = confirmAt !== null && r.status === "AwaitingDeposit" && (confirmAt.failure !== null || loadedAt > confirmAt.at);

  if (expired && r.status !== "Open") return <ExpiredBanner pos={pos} onChanged={onChanged} />;
  if (!ids)
    return (
      <Banner tone="warn" title="Solana vault not configured">
        The nectar_vault program id and mint are filled in by the devnet deployment (config <code>solana.vault_program</code>, <code>solana.mint</code>). Until then deposits cannot be built.
      </Banner>
    );

  return (
    <Card label={depositSeen ? "Waiting for attested deposit" : "Deposit on Solana"} live={depositSeen}>
      <div className="stack">
        {left !== null && left < 300 && !depositSeen ? <Banner tone="warn" title="Reservation ends soon">Less than five minutes left. Deposit only if the transaction can land before the countdown ends.</Banner> : null}
        {!depositSeen ? (
          <SolanaWalletBlock sol={sol} need="deposit the collateral">
            <div className="kvs">
              <Kv k="Wallet" v={<span className="addr">{sol.address}</span>} />
              <Kv k="Devnet SOL" v={bal ? formatLamports(bal.lamports) : "…"} />
              <Kv k={`Mock ${pos.collateral} (Solana)`} v={bal ? `${formatUnits(bal.tokens, config.solana.decimals)} ${pos.collateral}` : "…"} />
              <Kv k="Vault authority" v={r.authority ? <span className="addr">{authorityAsAddress(r.authority)}</span> : "…"} />
            </div>
            <p className="caption">This key is derived by NEAR for position #{pos.id}. The vault only releases or settles with its signature.</p>
            {balErr ? <Banner tone="danger" title="Solana devnet RPC error" actions={<Button size="sm" onClick={loadBal}>Retry</Button>}>Could not read balances. Nothing was sent. <span className="mono small">{balErr.slice(0, 160)}</span></Banner> : null}
            {noSol ? <NoSol needLamports={need} /> : null}
            {noTokens ? <Banner tone="warn" title={`Not enough mock ${pos.collateral} on Solana`}>The reservation is for {formatUnits(units, config.solana.decimals)} {pos.collateral}. Mock tokens come from the demo seeding script on devnet.</Banner> : null}
            <Button variant="primary" disabled={!r.authority || !bal || noSol || noTokens || sig?.status === "sending"} loading={sig?.status === "sending"} onClick={deposit}>
              Deposit {formatUnits(units, config.solana.decimals)} {pos.collateral} on Solana
            </Button>
          </SolanaWalletBlock>
        ) : (
          <div className="stack-sm" data-testid="waiting-attested">
            <p className="small">The deposit is on Solana. nectar-core pays out after an attested OutLayer read of the vault confirms the units, the authority and the depositor. The keeper requests this automatically; anyone may request it.</p>
            {vp ? (
              <div className="kvs">
                <Kv k="Vault position" v={<span className="addr">{formatUnits(vp.amount, config.solana.decimals)} {pos.collateral} from {vp.depositor}</span>} />
              </div>
            ) : null}
            {confirmFailed ? (
              <Banner tone="danger" title="OutLayer confirmation failed">
                <span data-testid="confirm-failed">The attested read did not confirm the deposit, so the position stays AwaitingDeposit and nothing was paid. Your collateral stays in the vault under the NEAR-derived key. Retry, or wait for the keeper.</span>
              </Banner>
            ) : null}
            <Button onClick={confirmNow} disabled={!accountId}>{confirmFailed ? "Retry confirmation" : "Request confirmation now"}</Button>
          </div>
        )}
        {sig ? <SigLine s={sig} /> : null}
      </div>
      {tx.modal}
    </Card>
  );
}

// ------------------------------------------------------------------ open

export function RemoteOpenCard({ pos }: { pos: RemotePosition }) {
  const r = pos.remote;
  return (
    <Card label="Open" live actions={<DepositSourceBadge source={r.source} />}>
      <div className="kvs" data-testid="remote-open">
        <Kv k="Payout" v={r.paid_usd_e6 != null ? <span data-testid="remote-payout">{formatUsdE6(r.paid_usd_e6)}</span> : "paid at confirmation (see the transaction)"} />
        <Kv k="Debt" v={formatUsdE6(pos.debt_usd_e6)} />
        {r.depositor ? <Kv k="Depositor (Solana)" v={<a className="link addr" href={SOLANA_EXPLORER_ADDR(r.depositor)} target="_blank" rel="noreferrer noopener">{r.depositor}</a>} /> : null}
        {r.source === "keeper" ? <p className="caption">Keeper-attested: this deposit was attested by the keeper key under an owner flag, not by an attested OutLayer read.</p> : null}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ release

/** After full repay: request the NEAR release signature, then withdraw on Solana with [Ed25519 verify, release]. */
export function RemoteRelease({ pos, onChanged }: { pos: RemotePosition; onChanged: () => void }) {
  const { config } = useChain();
  const sign = useSign();
  const { accountId } = useWallet();
  const ids = useVaultIds();
  const sol = useSolanaWallet();
  const reader = useSolanaReader();
  const tx = useSolanaTx(sol);
  const now = useNow();
  const r = pos.remote;
  const debtZero = BigInt(pos.debt_usd_e6) === 0n;
  const pr = useView<PendingRelease | null>(r.status === "Releasing" ? (v) => v.getPendingRelease(pos.id) : null, [pos.id, r.status]);
  const [sig, setSig] = useState<SigState | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [bal, setBal] = useState<bigint | null>(null);
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (sol.address) reader.balanceLamports(sol.address).then(setBal, () => setBal(null));
  }, [sol.address, reader]);
  useInterval(() => {
    if (ids) reader.vaultPosition(ids, BigInt(pos.id)).then((v) => setReleased(v === null), () => undefined);
  }, 5000, Boolean(ids) && r.status === "Releasing" && sig?.status === "confirmed");

  const nonceRent = rentExemptFallback(NONCE_RECORD_BYTES);
  const ataRent = rentExemptFallback(ATA_BYTES);
  const fee = LAMPORTS_PER_SIGNATURE * 2n; // the fee payer plus the Ed25519 precompile signature
  const need = fee + nonceRent + ataRent;
  const expiresS = pr.data ? Number(pr.data.expires) : null;
  const sigExpired = expiresS !== null && expiresS * 1000 <= now;

  const requestRelease = async () => {
    if (!config.core) return;
    await sign(txRemote.requestRelease(config.core, pos.id), {
      success: "Release signed on NEAR",
      summary: <p className="small">nectar-core signs NECTAR_RELEASE_V1 for position #{pos.id} with its NEAR-derived key (Chain Signatures). The signature lets the vault pay every unit back to the depositor.</p>,
    });
    onChanged();
  };

  const withdraw = async () => {
    if (!ids || !sol.address || !pr.data || !r.authority || !r.depositor) return;
    setPlanErr(null);
    let ixs;
    try {
      const plan = planRelease(pr.data, { program: ids.program, positionId: BigInt(pos.id), depositor: r.depositor });
      ixs = await releaseTransactionInstructions(ids, plan, { payer: sol.address, authority: r.authority });
    } catch (e) {
      setPlanErr(e instanceof Error ? e.message : String(e));
      return;
    }
    const payer = sol.address;
    const s = await tx.request(
      {
        label: "Withdraw on Solana",
        network: "Solana devnet",
        feePayer: payer,
        instructions: ixs.map(toIxPreview),
        fees: [
          { label: "Network fee (2 signatures: yours + the Ed25519 check)", value: formatLamports(fee) },
          { label: `Rent for the nonce record (${NONCE_RECORD_BYTES} bytes; stays, marks the nonce used)`, value: formatLamports(nonceRent) },
          { label: "Rent for the depositor token account, only if it is missing", value: `up to ${formatLamports(ataRent)}` },
        ],
        feesTotal: `up to ${formatLamports(need)}`,
        note: `Pays all ${pos.collateral} in the vault for position #${pos.id} to ${r.depositor}. The position account closes and its rent returns to the depositor.`,
      },
      async () => compileWireTransaction(ixs.map((i) => i.instruction), payer, await reader.latestBlockhash()),
    );
    if (!s) return;
    setSig({ sig: s, status: "sending" });
    setSig({ sig: s, status: await waitForSignature(reader, s) });
  };

  if (r.status === "Open" && !debtZero) return null;
  return (
    <Card label="Release collateral">
      <div className="stack">
        {r.status === "Open" ? (
          <>
            <p className="small">The debt is repaid. Ask nectar-core to sign the release; the collateral then goes back to the depositor on Solana.</p>
            <Button variant="primary" disabled={!accountId || !config.core} onClick={requestRelease}>Request release</Button>
            {!accountId ? <p className="caption">Connect a NEAR wallet to request the release (anyone may call it).</p> : null}
          </>
        ) : null}
        {r.status === "Releasing" ? (
          pr.error ? (
            <Banner tone="danger" title="Testnet RPC error" actions={<Button size="sm" onClick={pr.reload}>Retry</Button>}>Could not read the pending release. <span className="mono small">{pr.error.slice(0, 160)}</span></Banner>
          ) : !pr.data ? (
            <p className="small dim">{pr.loading ? "Reading the signed release…" : "Waiting for the NEAR release signature (Chain Signatures)…"}</p>
          ) : released ? (
            <Banner tone="good" title="Released on Solana"><span data-testid="released">The vault paid the collateral to <span className="addr">{r.depositor}</span> and closed the position account.</span></Banner>
          ) : (
            <div className="stack-sm">
              <div className="kvs">
                <Kv k="Signed message" v={<span className="addr" data-testid="release-message">{pr.data.message}</span>} />
                <Kv k="Nonce" v={String(pr.data.nonce)} />
                <Kv k="Signature valid until" v={expiresS !== null ? new Date(expiresS * 1000).toISOString().replace(".000Z", "Z") : "—"} />
              </div>
              {!ids ? <Banner tone="warn" title="Solana vault not configured">The vault program id and mint are filled in by the devnet deployment.</Banner> : null}
              {sigExpired ? <Banner tone="danger" title="Release signature expired">The vault refuses an expired signature. Request a new release on NEAR.</Banner> : null}
              {planErr ? <Banner tone="danger" title="Release message mismatch">{planErr}</Banner> : null}
              <SolanaWalletBlock sol={sol} need="withdraw the collateral">
                {bal !== null && bal < need ? <NoSol needLamports={need} /> : null}
                <Button variant="primary" disabled={!ids || sigExpired || sig?.status === "sending" || (bal !== null && bal < need)} loading={sig?.status === "sending"} onClick={withdraw}>
                  Withdraw on Solana
                </Button>
                <p className="caption">Any wallet may send this; the collateral always goes to the depositor recorded at confirmation.</p>
              </SolanaWalletBlock>
              {sigExpired && accountId ? <Button onClick={requestRelease}>Request release again</Button> : null}
            </div>
          )
        ) : null}
        {sig ? <SigLine s={sig} /> : null}
      </div>
      {tx.modal}
    </Card>
  );
}
