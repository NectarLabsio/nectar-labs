// Agent-side x402 payment (used by demo-agent.ts and the tests). The challenge is inspected first: any
// accepted option that is not `near:testnet` is refused before anything is signed. Payment = NEP-366
// SignedDelegate (ft_transfer of the route's asset to payTo) built by the official @x402/near local signer.

import { createNearPaymentFetch, type ClientNearSigner } from '@fastnear/x402';
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { NETWORK } from './config.ts';

export interface PaidResult {
  challenge: { status: number; network: string; asset: string; amount: string; payTo: string };
  status: number;
  body: string;
  transaction: string | null;
}

export class PaymentRefused extends Error {}

export async function payForResource(url: string, signer: ClientNearSigner, fetchImpl: typeof fetch = fetch): Promise<PaidResult> {
  const first = await fetchImpl(url);
  if (first.status !== 402) throw new PaymentRefused(`expected a 402 challenge from ${url}, got ${first.status}`);
  const header = first.headers.get('PAYMENT-REQUIRED');
  if (header === null) throw new PaymentRefused('402 without a PAYMENT-REQUIRED header');
  const req = decodePaymentRequiredHeader(header);
  const opt = req.accepts[0];
  if (opt === undefined) throw new PaymentRefused('402 challenge has no payment option');
  const wrong = req.accepts.find((a) => a.network !== NETWORK);
  if (wrong !== undefined) throw new PaymentRefused(`refusing to pay on ${wrong.network}: ${NETWORK} only`);
  const paid = createNearPaymentFetch({ signer, network: NETWORK, fetch: fetchImpl });
  const res = await paid(url);
  const pr = res.headers.get('PAYMENT-RESPONSE');
  return {
    challenge: { status: first.status, network: opt.network, asset: opt.asset, amount: opt.amount, payTo: opt.payTo },
    status: res.status,
    body: await res.text(),
    transaction: pr === null ? null : decodePaymentResponseHeader(pr).transaction,
  };
}
