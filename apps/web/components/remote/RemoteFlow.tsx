"use client";
// Remote (Solana devnet) collateral: reservation → Phantom deposit → attested confirmation → Open, then release or settlement and
// the depositor's withdraw (interface-v7 §B, §E; WO-31, WO-34w). Renders only when the contract is v2 and features.solana_remote is on
// (callers check useFeature).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge, Banner, Button, Card, Field, Kv } from "@nectar/ui";
import {
  LAMPORTS_PER_SIGNATURE,
  NONCE_RECORD_ACCOUNT,
  POSITION_ACCOUNT,
  POSITION_STATUS_OPEN,
  POSITION_STATUS_RELEASED,
  POSITION_STATUS_SETTLED,
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_STATE_INITIALIZED,
  associatedTokenAddress,
  authorityAsAddress,
  borrowerCanConfirm,
  claimInstruction,
  compileWireTransaction,
  formatCountdown,
  formatLamports,
  formatYocto,
  formatUnits,
  formatUsdE6,
  isSolanaAddress,
  isSolanaWalletKey,
  openPositionInstruction,
  planRelease,
  remoteConfirmRefusal,
  remoteLoanRefusal,
  remoteRefusalText,
  rentExemptFallback,
  releaseTransactionInstructions,
  remotePath,
  reservationSecondsLeft,
  settlementNeedsResign,
  txRemote,
  vaultPda,
  vaultTokensPda,
  withdrawInstruction,
  type PendingRelease,
  type PendingSettlement,
  type PositionView,
  type RemoteConfigView,
  type RemoteView,
  type SolanaReader,
  type U128,
  type VaultClaim,
  type VaultIds,
  type VaultPosition,
} from "@nectar/sdk";
import { useChain, useSign, useView, useWallet } from "@/components/AppProvider";
import { SOLANA_EXPLORER_ADDR, SOLANA_EXPLORER_TX, SOLANA_FAUCET_URL } from "@/lib/env";
import { toIxPreview, useSolanaReader, useSolanaTx, waitForSignature, type SigState } from "./solana-tx";
import { useSolanaWallet, type SolanaWalletState } from "./useSolanaWallet";

export type RemotePosition = PositionView & { remote: RemoteView };
export const isRemote = (p: PositionView | null | undefined): p is RemotePosition => Boolean(p?.remote);

/** The vault slot of this position: the depositor committed at reservation (SR-8), or the recorded one for reservations made before 2.2. */
export const slotDepositor = (r: RemoteView): string | null => r.committed_depositor ?? r.depositor ?? null;

export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function useInterval(fn: () => void, ms: number, on: boolean) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!on) return;
    latest.current();
    const t = setInterval(() => latest.current(), ms);
    return () => clearInterval(t);
  }, [ms, on]);
}

function useVaultIds(): VaultIds | null {
  const { config } = useChain();
  const { vaultProgram: program, mint } = config.solana;
  return useMemo(() => (program && mint ? { program, mint } : null), [program, mint]);
}

/** Polls one vault slot. `slot` is undefined until the first read, null when no account exists at that address. */
function useVaultSlot(ids: VaultIds | null, positionId: string, depositor: string | null, on: boolean) {
  const reader = useSolanaReader();
  const [slot, setSlot] = useState<VaultPosition | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!ids || !depositor) return;
    reader.vaultPosition(ids, BigInt(positionId), depositor).then(
      (v) => {
        setSlot(v);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [ids, positionId, depositor, reader]);
  useInterval(load, 5000, on && Boolean(ids && depositor));
  return { slot, error, reload: load };
}

// ------------------------------------------------------------------ labels

const STATUS_TEXT: Record<RemoteView["status"], string> = {
  AwaitingDeposit: "Awaiting deposit",
  Open: "Open",
  Settling: "Settling",
  Releasing: "Releasing",
  Closed: "Closed",
  Expired: "Reservation expired",
};

export function RemoteStatusBadge({ status }: { status: RemoteView["status"] }) {
  const kind = status === "Open" ? "open" : status === "AwaitingDeposit" ? "warn" : status === "Releasing" || status === "Settling" ? "info" : status === "Expired" ? "danger" : "neutral";
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
  if (r.status === "Open" || r.status === "Settling" || r.status === "Releasing" || r.status === "Closed") return "open";
  return depositSeen ? "confirm" : "deposit";
}

// ------------------------------------------------------------------ Solana wallet states

/** Renders `children` once a devnet wallet is connected. With `expect`, only that address passes: the vault checks it, so a mismatch is stopped here. */
export function SolanaWalletBlock({ sol, need, expect, children }: { sol: SolanaWalletState; need: string; expect?: { address: string; why: string } | null; children: ReactNode }) {
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
  if (expect && sol.address !== expect.address)
    return (
      <Banner tone="warn" title="Switch to the right Solana wallet">
        <span data-testid="wrong-solana-wallet">
          {expect.why} Expected <span className="addr">{expect.address}</span>; connected <span className="addr">{sol.address}</span>.
        </span>
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
        {r.committed_depositor ? <Kv k="Depositor wallet" v={<span className="addr" data-testid="committed-depositor">{r.committed_depositor}</span>} /> : null}
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
      actions={accountId && config.core && pos.remote.status === "AwaitingDeposit" ? <Button size="sm" onClick={async () => { await sign(txRemote.expireReservation(config.core!, pos.id), { success: "Reservation expired" }); onChanged(); }}>Close reservation</Button> : undefined}
    >
      <span data-testid="reservation-expired">The 30-minute window to deposit has passed. Do not deposit for this id: reserve again from Borrow.</span>
    </Banner>
  );
}

// ------------------------------------------------------------------ deposit + confirm

/** Deposit with Phantom, then wait for the attested confirmation. `loadedAt` is when the parent last read the NEAR position. */
export function RemoteDeposit({ pos, onChanged, loadedAt, onSeen }: { pos: RemotePosition; onChanged: () => void; loadedAt: number; onSeen?: (seen: boolean) => void }) {
  const { config, paused } = useChain();
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
  const [sig, setSig] = useState<SigState | null>(null);
  const [confirmAt, setConfirmAt] = useState<{ at: number; failure: string | null; reason: string | null } | null>(null);
  const committed = r.committed_depositor ?? null;
  // SR-6: only the borrower can ask from here, and the read is paid from the deposit still held for the reservation.
  const remoteConfig = useView<RemoteConfigView>((v) => v.getRemoteConfig(), []);
  const readCost = remoteConfig.data?.vault_read_deposit_yocto ?? null;
  const isBorrower = accountId === pos.borrower;
  const canConfirm = isBorrower && borrowerCanConfirm(r, readCost);

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

  // Poll the depositor's slot (deposit landed?) and the NEAR position (attested?) every 5 s. A slot that is no longer Open is not a
  // deposit (deploy.md). It is also watched after expiry: a late deposit can still be recorded, then released (no loan).
  const pendingDeposit = r.status === "AwaitingDeposit" || r.status === "Expired";
  const { slot: vp } = useVaultSlot(ids, pos.id, committed ?? sol.address, pendingDeposit);
  const awaiting = r.status === "AwaitingDeposit" && !expired;
  const depositSeen = vp?.status === POSITION_STATUS_OPEN || sig?.status === "confirmed";
  useInterval(onChanged, 5000, pendingDeposit && depositSeen);
  useEffect(() => onSeen?.(depositSeen), [depositSeen, onSeen]);

  const need = LAMPORTS_PER_SIGNATURE + rent;
  const noSol = bal !== null && bal.lamports < need;
  const noTokens = bal !== null && bal.tokens < units;

  const deposit = async () => {
    if (!ids || !sol.address || !r.authority || (committed && sol.address !== committed)) return;
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
    const out = await sign(txRemote.confirmDeposit(config.core, pos.id), {
      success: "Confirmation requested",
      summary: <p className="small">nectar-core asks OutLayer for an attested read of the vault.{readCost ? ` The read costs ${formatYocto(readCost)}, taken from the deposit held for this reservation, so that much less is refunded.` : ""}</p>,
    });
    if (!out) return;
    setConfirmAt({ at: Date.now(), failure: out.ok ? null : out.failure, reason: remoteConfirmRefusal(out.logs) });
    onChanged();
  };
  // OutLayer could not confirm: the call failed, or it ran and the position is still AwaitingDeposit on the next read.
  const giveUp = async () => {
    if (!config.core) return;
    await sign(txRemote.requestRelease(config.core, pos.id), {
      success: "Release signed on NEAR",
      summary: <p className="small">Gives up the loan for this reservation. nectar-core signs the release so the deposit becomes withdrawable by its depositor.</p>,
    });
    onChanged();
  };
  const confirmFailed = confirmAt !== null && pendingDeposit && (confirmAt.failure !== null || loadedAt > confirmAt.at);
  const short = vp?.status === POSITION_STATUS_OPEN && vp.amount < units;

  if (expired && r.status !== "Open" && !depositSeen) return <ExpiredBanner pos={pos} onChanged={onChanged} />;
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
          <SolanaWalletBlock sol={sol} need="deposit the collateral" expect={committed ? { address: committed, why: "This reservation commits one depositor. A deposit from any other wallet cannot confirm it and stays locked." } : null}>
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
            {expired ? (
              <Banner tone="warn" title="The deposit arrived after the reservation expired">
                <span data-testid="late-deposit">No loan will be paid. Once nectar-core records the deposit, it can be released back to you.</span>
              </Banner>
            ) : (
              <p className="small">The deposit is on Solana. nectar-core pays out after an attested OutLayer read of the vault confirms the units, the authority and the depositor. The keeper requests this automatically; the borrower may request it too.</p>
            )}
            {short ? (
              <Banner tone="warn" title="The vault holds less than the reservation">
                <span data-testid="short-deposit">The vault holds {formatUnits(vp.amount, config.solana.decimals)} {pos.collateral} of the {formatUnits(units, config.solana.decimals)} reserved, so the loan will be refused. Once that is recorded, release the deposit.</span>
              </Banner>
            ) : null}
            {vp ? (
              <div className="kvs">
                <Kv k="Vault position" v={<span className="addr">{formatUnits(vp.amount, config.solana.decimals)} {pos.collateral} from {vp.depositor}</span>} />
              </div>
            ) : null}
            {confirmFailed ? (
              <Banner tone="danger" title="OutLayer confirmation failed">
                <span data-testid="confirm-failed">{confirmAt?.reason ? `${remoteRefusalText(confirmAt.reason) ?? confirmAt.reason} ` : "The attested read did not confirm the deposit. "}The position stays AwaitingDeposit and nothing was paid. Your collateral stays in the vault under the NEAR-derived key. Retry, or wait for the keeper.</span>
              </Banner>
            ) : null}
            {canConfirm ? (
              <Button onClick={confirmNow} disabled={paused}>{confirmFailed ? "Retry confirmation" : "Request confirmation now"}</Button>
            ) : (
              <p className="caption" data-testid="confirm-keeper-only">{isBorrower ? "The reservation deposit no longer covers an attested read. The keeper requests it automatically." : "The keeper requests this automatically. Only the borrower can request it from here."}</p>
            )}
            {r.depositor && (isBorrower || expired) ? <Button onClick={giveUp} disabled={!accountId || r.confirming || paused}>Release my deposit instead</Button> : null}
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
  const { config } = useChain();
  const r = pos.remote;
  const refusal = remoteLoanRefusal(pos);
  const fmt = (u: U128) => `${formatUnits(BigInt(u), config.solana.decimals)} ${pos.collateral}`;
  return (
    <Card label="Open" live={!refusal} actions={<DepositSourceBadge source={r.source} />}>
      {refusal ? (
        <Banner tone="danger" title="Loan refused — release your deposit">
          <span data-testid="loan-refused">
            {refusal === "short_deposit" && r.units != null && r.reserved_units != null ? `The vault holds ${fmt(r.units)}, less than the ${fmt(r.reserved_units)} reserved, so no USDC was paid.` : "The deposit arrived after the reservation expired, so no USDC was paid."} Request the release, then withdraw on Solana.
          </span>
        </Banner>
      ) : null}
      <div className="kvs" data-testid="remote-open">
        <Kv k="Payout" v={refusal ? "none, the loan was refused" : r.paid_usd_e6 != null ? <span data-testid="remote-payout">{formatUsdE6(r.paid_usd_e6)}</span> : "paid at confirmation (see the transaction)"} />
        <Kv k="Debt" v={formatUsdE6(pos.debt_usd_e6)} />
        {r.depositor ? <Kv k="Depositor (Solana)" v={<a className="link addr" href={SOLANA_EXPLORER_ADDR(r.depositor)} target="_blank" rel="noreferrer noopener">{r.depositor}</a>} /> : null}
        {r.source === "keeper" ? <p className="caption">Keeper-attested: this deposit was attested by the keeper key under an owner flag, not by an attested OutLayer read.</p> : null}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ release

/** After full repay (or a refused loan): request the NEAR release signature, then send [Ed25519 verify, release] on Solana. Moves no tokens. */
export function RemoteRelease({ pos, onChanged }: { pos: RemotePosition; onChanged: () => void }) {
  const { config, paused } = useChain();
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
  const { slot } = useVaultSlot(ids, pos.id, slotDepositor(r), r.status === "Releasing");
  const [sig, setSig] = useState<SigState | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [bal, setBal] = useState<bigint | null>(null);

  useEffect(() => {
    if (sol.address) reader.balanceLamports(sol.address).then(setBal, () => setBal(null));
  }, [sol.address, reader]);

  const released = slot?.status === POSITION_STATUS_RELEASED;
  const nonceRent = rentExemptFallback(NONCE_RECORD_ACCOUNT.size);
  const fee = LAMPORTS_PER_SIGNATURE * 2n; // the fee payer plus the Ed25519 precompile signature
  const need = fee + nonceRent;
  const expiresS = pr.data ? Number(pr.data.expires) : null;
  const sigExpired = expiresS !== null && expiresS * 1000 <= now;
  const signFailed = pr.data?.status === "SignFailed";

  const requestRelease = async () => {
    if (!config.core) return;
    await sign(txRemote.requestRelease(config.core, pos.id), {
      success: "Release signed on NEAR",
      summary: <p className="small">nectar-core signs NECTAR_RELEASE_V1 for position #{pos.id} with its NEAR-derived key (Chain Signatures). The signature lets the vault mark every unit as withdrawable by the depositor.</p>,
    });
    onChanged();
  };

  const sendRelease = async () => {
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
        label: "Release on Solana",
        network: "Solana devnet",
        feePayer: payer,
        instructions: ixs.map(toIxPreview),
        fees: [
          { label: "Network fee (2 signatures: yours + the Ed25519 check)", value: formatLamports(fee) },
          { label: `Rent for the nonce record (${NONCE_RECORD_ACCOUNT.size} bytes; stays, marks the nonce used)`, value: formatLamports(nonceRent) },
        ],
        feesTotal: formatLamports(need),
        note: `Moves no tokens. Marks all ${pos.collateral} in position #${pos.id} as withdrawable by ${r.depositor}, who then signs the withdrawal.`,
      },
      async () => compileWireTransaction(ixs.map((i) => i.instruction), payer, await reader.latestBlockhash()),
    );
    if (!s) return;
    setSig({ sig: s, status: "sending" });
    setSig({ sig: s, status: await waitForSignature(reader, s) });
  };

  if (r.status !== "Open" && r.status !== "Releasing") return null;
  if (r.status === "Open" && !debtZero) return null;
  return (
    <Card label="Release collateral">
      <div className="stack">
        {r.status === "Open" ? (
          <>
            <p className="small">No debt is outstanding. Ask nectar-core to sign the release; the collateral then becomes withdrawable by the depositor on Solana.</p>
            <Button variant="primary" disabled={!accountId || !config.core || paused} onClick={requestRelease}>Request release</Button>
            {paused ? <p className="caption">nectar-core is paused. Releases resume when it does.</p> : !accountId ? <p className="caption">Connect a NEAR wallet to request the release (anyone may call it).</p> : null}
          </>
        ) : null}
        {r.status === "Releasing" ? (
          pr.error ? (
            <Banner tone="danger" title="Testnet RPC error" actions={<Button size="sm" onClick={pr.reload}>Retry</Button>}>Could not read the pending release. <span className="mono small">{pr.error.slice(0, 160)}</span></Banner>
          ) : signFailed ? (
            <Banner tone="danger" title="The NEAR signer did not answer" actions={accountId ? <Button size="sm" onClick={requestRelease}>Request release again</Button> : undefined}>Nothing moved. Request the release again.</Banner>
          ) : !pr.data?.signature_hex ? (
            <p className="small dim">{pr.loading ? "Reading the signed release…" : "Waiting for the NEAR release signature (Chain Signatures)…"}</p>
          ) : released ? (
            <Banner tone="good" title="Released on Solana"><span data-testid="released">The vault marked the collateral as withdrawable by <span className="addr">{r.depositor}</span>. Withdraw it below.</span></Banner>
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
              <SolanaWalletBlock sol={sol} need="send the release">
                {bal !== null && bal < need ? <NoSol needLamports={need} /> : null}
                <Button variant="primary" disabled={!ids || sigExpired || sig?.status === "sending" || (bal !== null && bal < need)} loading={sig?.status === "sending"} onClick={sendRelease}>
                  Send release on Solana
                </Button>
                <p className="caption">The keeper sends this automatically; any wallet may send it instead. It moves no tokens.</p>
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

// ------------------------------------------------------------------ payout destination

type Destination = { address: string | null; field: ReactNode };

/**
 * Where a withdraw or claim pays. The owner's own token account when it can take a credit; otherwise any token account of the mint
 * (the account a claim exists for may be frozen or held by someone else, so it is never assumed).
 */
function useDestination(owner: string | null, ids: VaultIds | null, reader: SolanaReader, label: string): Destination {
  const [own, setOwn] = useState<{ address: string; problem: string | null } | null>(null);
  const [typed, setTyped] = useState("");
  const [typedErr, setTypedErr] = useState<string | null>(null);
  const [typedOk, setTypedOk] = useState<string | null>(null);
  const tokenProgram = ids?.tokenProgram ?? TOKEN_PROGRAM_ADDRESS;

  useEffect(() => {
    if (!owner || !ids) return setOwn(null);
    let live = true;
    (async () => {
      const addr = await associatedTokenAddress(owner, ids.mint, tokenProgram);
      const t = await reader.tokenAccount(addr, tokenProgram);
      const problem = !t ? "This wallet has no token account for this mint." : t.owner !== owner ? "This wallet's token account now belongs to someone else." : t.state !== TOKEN_STATE_INITIALIZED ? "This wallet's token account is frozen." : null;
      if (live) setOwn({ address: addr, problem });
    })().catch(() => live && setOwn(null));
    return () => {
      live = false;
    };
  }, [owner, ids, reader, tokenProgram]);

  useEffect(() => {
    setTypedOk(null);
    setTypedErr(null);
    const a = typed.trim();
    if (!a || !ids) return;
    if (!isSolanaAddress(a)) return setTypedErr("Enter a Solana address");
    let live = true;
    (async () => {
      const vaultTokens = await vaultTokensPda(ids.program, await vaultPda(ids.program, ids.mint));
      const t = await reader.tokenAccount(a, tokenProgram);
      const problem = a === vaultTokens ? "That is the vault's own account." : !t ? "No token account at this address." : t.mint !== ids.mint ? "That token account holds a different mint." : t.state !== TOKEN_STATE_INITIALIZED ? "That token account is frozen." : null;
      if (!live) return;
      if (problem) setTypedErr(problem);
      else setTypedOk(a);
    })().catch((e: unknown) => live && setTypedErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [typed, ids, reader, tokenProgram]);

  if (own && !own.problem) return { address: own.address, field: <Kv k="Paid to your token account" v={<span className="addr" data-testid="destination">{own.address}</span>} /> };
  return {
    address: typedOk,
    field: <Field label={label} value={typed} onChange={(e) => setTyped(e.target.value)} error={typedErr ?? undefined} hint={own?.problem ? `${own.problem} Enter any token account of this mint. The tokens go to whoever owns it.` : "Any token account of this mint. The tokens go to whoever owns it."} />,
  };
}

// ------------------------------------------------------------------ withdraw (depositor)

/** After settle or release the vault holds the depositor's units as `withdrawable`; only the depositor can move them, to any token account. */
export function RemoteWithdraw({ pos, onChanged }: { pos: RemotePosition; onChanged: () => void }) {
  const { config } = useChain();
  const ids = useVaultIds();
  const sol = useSolanaWallet();
  const reader = useSolanaReader();
  const tx = useSolanaTx(sol);
  const r = pos.remote;
  const depositor = slotDepositor(r);
  const { slot, error, reload } = useVaultSlot(ids, pos.id, depositor, true);
  const [sig, setSig] = useState<SigState | null>(null);
  const dest = useDestination(sol.address, ids, reader, "Destination token account");
  const [bal, setBal] = useState<bigint | null>(null);

  useEffect(() => {
    if (sol.address) reader.balanceLamports(sol.address).then(setBal, () => setBal(null));
  }, [sol.address, reader]);

  const ready = slot?.status === POSITION_STATUS_SETTLED || slot?.status === POSITION_STATUS_RELEASED;
  const amount = slot?.withdrawable ?? 0n;
  const noSol = bal !== null && bal < LAMPORTS_PER_SIGNATURE;

  const withdraw = async () => {
    if (!ids || !sol.address || !slot || !dest.address || sol.address !== depositor) return;
    const d = await withdrawInstruction(ids, { depositor: sol.address, positionId: BigInt(pos.id), destination: dest.address });
    const payer = sol.address;
    const s = await tx.request(
      {
        label: "Withdraw on Solana",
        network: "Solana devnet",
        feePayer: payer,
        instructions: [toIxPreview(d)],
        fees: [{ label: "Network fee (1 signature)", value: formatLamports(LAMPORTS_PER_SIGNATURE) }],
        feesTotal: formatLamports(LAMPORTS_PER_SIGNATURE),
        note: `Pays ${formatUnits(amount, config.solana.decimals)} ${pos.collateral} to ${dest.address}. The vault account for position #${pos.id} closes and its rent returns to you.`,
      },
      async () => compileWireTransaction([d.instruction], payer, await reader.latestBlockhash()),
    );
    if (!s) return;
    setSig({ sig: s, status: "sending" });
    const status = await waitForSignature(reader, s);
    setSig({ sig: s, status });
    reload();
    onChanged();
  };

  if (!ids || !depositor) return null;
  if (error) return <Banner tone="danger" title="Solana devnet RPC error" actions={<Button size="sm" onClick={reload}>Retry</Button>}>Could not read the vault. <span className="mono small">{error.slice(0, 160)}</span></Banner>;
  if (!ready && !sig) return null;
  return (
    <Card label="Withdraw on Solana">
      <div className="stack">
        {sig?.status === "confirmed" ? (
          <Banner tone="good" title="Withdrawn"><span data-testid="withdrawn">The vault paid the collateral and closed the account.</span></Banner>
        ) : (
          <>
            <div className="kvs">
              <Kv k="Withdrawable" v={<span data-testid="withdrawable">{formatUnits(amount, config.solana.decimals)} {pos.collateral}</span>} />
              <Kv k="Depositor" v={<span className="addr">{depositor}</span>} />
            </div>
            {amount === 0n ? <p className="caption">Nothing is left to withdraw: the settlement took all of it. Withdrawing closes the vault account and returns its rent.</p> : null}
            <SolanaWalletBlock sol={sol} need="withdraw the collateral" expect={{ address: depositor, why: "Only the depositor can withdraw." }}>
              <div className="stack-sm">
                {dest.field}
                {noSol ? <NoSol needLamports={LAMPORTS_PER_SIGNATURE} /> : null}
                <Button variant="primary" disabled={!dest.address || noSol || sig?.status === "sending"} loading={sig?.status === "sending"} onClick={withdraw}>
                  Withdraw on Solana
                </Button>
              </div>
            </SolanaWalletBlock>
          </>
        )}
        {sig ? <SigLine s={sig} /> : null}
      </div>
      {tx.modal}
    </Card>
  );
}

// ------------------------------------------------------------------ claim (buyer)

/** Settle pays the buyer directly when its token account can take the credit; otherwise it records a `Claim` the buyer signs for. */
export function RemoteClaim({ pos }: { pos: RemotePosition }) {
  const { config } = useChain();
  const ids = useVaultIds();
  const sol = useSolanaWallet();
  const reader = useSolanaReader();
  const tx = useSolanaTx(sol);
  const r = pos.remote;
  const leg = useView<PendingSettlement | null>((v) => v.getPendingSettlement(pos.id), [pos.id, r.status]);
  const recipient = leg.data && isSolanaWalletKey(leg.data.recipient) ? leg.data.recipient : null;
  const [claim, setClaim] = useState<VaultClaim | null>(null);
  const [sig, setSig] = useState<SigState | null>(null);
  const dest = useDestination(sol.address, ids, reader, "Destination token account");

  const load = useCallback(() => {
    if (ids && recipient) reader.vaultClaim(ids, recipient).then(setClaim, () => undefined);
  }, [ids, recipient, reader]);
  useInterval(load, 15_000, Boolean(ids && recipient));

  const claimNow = async () => {
    if (!ids || !sol.address || !claim || !dest.address || sol.address !== recipient) return;
    const d = await claimInstruction(ids, { recipient: sol.address, destination: dest.address });
    const payer = sol.address;
    const s = await tx.request(
      {
        label: "Claim on Solana",
        network: "Solana devnet",
        feePayer: payer,
        instructions: [toIxPreview(d)],
        fees: [{ label: "Network fee (1 signature)", value: formatLamports(LAMPORTS_PER_SIGNATURE) }],
        feesTotal: formatLamports(LAMPORTS_PER_SIGNATURE),
        note: `Pays the whole claim, ${formatUnits(claim.amount, config.solana.decimals)} ${pos.collateral}, to ${dest.address}. The claim account closes and its rent returns to you.`,
      },
      async () => compileWireTransaction([d.instruction], payer, await reader.latestBlockhash()),
    );
    if (!s) return;
    setSig({ sig: s, status: "sending" });
    const status = await waitForSignature(reader, s);
    setSig({ sig: s, status });
    load();
  };

  if (!ids || !recipient || (!claim && !sig)) return null;
  return (
    <Card label="Claim your collateral">
      <div className="stack">
        {sig?.status === "confirmed" ? (
          <Banner tone="good" title="Claimed"><span data-testid="claimed">The vault paid the claim and closed the account.</span></Banner>
        ) : claim ? (
          <>
            <p className="small">The settlement could not pay this buyer's token account directly, so the vault is holding the collateral for it.</p>
            <div className="kvs">
              <Kv k="Claimable" v={<span data-testid="claimable">{formatUnits(claim.amount, config.solana.decimals)} {pos.collateral}</span>} />
              <Kv k="Recipient" v={<span className="addr">{recipient}</span>} />
            </div>
            <SolanaWalletBlock sol={sol} need="claim the collateral" expect={{ address: recipient, why: "Only the recipient can claim." }}>
              <div className="stack-sm">
                {dest.field}
                <Button variant="primary" disabled={!dest.address || sig?.status === "sending"} loading={sig?.status === "sending"} onClick={claimNow}>Claim</Button>
              </div>
            </SolanaWalletBlock>
          </>
        ) : null}
        {sig ? <SigLine s={sig} /> : null}
      </div>
      {tx.modal}
    </Card>
  );
}

// ------------------------------------------------------------------ settlement

/** While a remote leg is out: what was signed and, once its signature has expired unrelayed, the re-sign recovery (SR-3). */
export function RemoteSettlement({ pos, onChanged }: { pos: RemotePosition; onChanged: () => void }) {
  const { config, paused } = useChain();
  const sign = useSign();
  const { accountId } = useWallet();
  const ids = useVaultIds();
  const now = useNow();
  const r = pos.remote;
  const settling = r.status === "Settling";
  const leg = useView<PendingSettlement | null>(settling ? (v) => v.getPendingSettlement(pos.id) : null, [pos.id, settling]);
  const { slot } = useVaultSlot(ids, pos.id, slotDepositor(r), settling);
  useInterval(leg.reload, 10_000, settling);

  if (!settling) return null;
  if (leg.error) return <Banner tone="danger" title="Testnet RPC error" actions={<Button size="sm" onClick={leg.reload}>Retry</Button>}>Could not read the settlement. <span className="mono small">{leg.error.slice(0, 160)}</span></Banner>;
  const d = leg.data;
  if (!d) return null;
  const landed = slot?.status === POSITION_STATUS_SETTLED;
  const needsResign = !landed && settlementNeedsResign(d, now);

  const resign = async () => {
    if (!config.core) return;
    await sign(txRemote.resignSettlement(config.core, pos.id), {
      success: "Re-sign requested",
      summary: <p className="small">nectar-core signs the identical leg again (same repay, seizure and recipient) with a fresh nonce and expiry. If the old signature already landed on Solana, the new one cannot execute.</p>,
    });
    leg.reload();
    onChanged();
  };

  return (
    <Card label="Remote settlement">
      <div className="stack">
        <div className="kvs">
          <Kv k="Buyer recipient" v={<span className="addr">{d.recipient}</span>} />
          <Kv k="Collateral to buyer" v={`${formatUnits(BigInt(d.seize_units), config.solana.decimals)} ${pos.collateral}`} />
          <Kv k="Debt repaid" v={formatUsdE6(d.repay_usd_e6)} />
          <Kv k="Signature valid until" v={new Date(Number(d.expires) * 1000).toISOString().replace(".000Z", "Z")} />
        </div>
        {landed ? <Banner tone="good" title="Landed on Solana"><span data-testid="settlement-landed">Waiting for the keeper to record it on NEAR.</span></Banner> : null}
        {needsResign ? (
          <Banner tone="danger" title="Settlement signature expired" actions={<Button size="sm" variant="primary" disabled={!accountId || !config.core || paused} onClick={resign}>Re-sign settlement</Button>}>
            <span data-testid="resign-needed">The signed leg expired before anyone relayed it. Anyone can ask NEAR to sign the identical leg again.{paused ? " nectar-core is paused, so this waits until it resumes." : accountId ? "" : " Connect a NEAR wallet to request it."}</span>
          </Banner>
        ) : null}
      </div>
    </Card>
  );
}

/** Everything a remote position can need once it has left Open: settlement recovery, release, then the Solana withdraw and claim. */
export function RemoteAfterOpen({ pos, onChanged }: { pos: RemotePosition; onChanged: () => void }) {
  return (
    <>
      <RemoteSettlement pos={pos} onChanged={onChanged} />
      <RemoteRelease pos={pos} onChanged={onChanged} />
      <RemoteWithdraw pos={pos} onChanged={onChanged} />
      <RemoteClaim pos={pos} />
    </>
  );
}

// ------------------------------------------------------------------ owed collateral (NEAR)

/** SR-17: units nectar-core could not transfer to this account (unregistered on the token, for instance) wait here until claimed. */
export function OwedCollateralCard({ symbol, decimals }: { symbol: string; decimals: number }) {
  const { config, paused } = useChain();
  const sign = useSign();
  const { accountId } = useWallet();
  const owed = useView<U128>(accountId ? (v) => v.getOwedCollateral(accountId, symbol) : null, [accountId, symbol]);
  if (!owed.data || BigInt(owed.data) === 0n) return null;
  const claim = async () => {
    if (!config.core) return;
    await sign(txRemote.claimOwedCollateral(config.core, symbol), {
      success: "Owed collateral claimed",
      summary: <p className="small">nectar-core transfers the {symbol} it owes this account. If the transfer fails again, for instance because the account is not registered on the token, the balance is restored.</p>,
    });
    owed.reload();
  };
  return (
    <Card label="Collateral owed to you">
      <div className="stack">
        <p className="small">An earlier transfer to this account failed, so nectar-core kept the units for you.</p>
        <div className="kvs"><Kv k="Owed" v={<span data-testid="owed-collateral">{formatUnits(BigInt(owed.data), decimals)} {symbol}</span>} /></div>
        <Button variant="primary" disabled={!config.core || paused} onClick={claim}>Claim owed collateral</Button>
        {paused ? <p className="caption">nectar-core is paused. Claims resume when it does.</p> : null}
      </div>
    </Card>
  );
}
