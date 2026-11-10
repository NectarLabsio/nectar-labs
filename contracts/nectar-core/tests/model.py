#!/usr/bin/env python3
"""Reference model for nectar-core maths (v2 = 2.0.0-v7). Writes tests/model.csv (do not edit the CSV by hand).

Integer arithmetic only, mirroring contracts/nectar-core/src/math.rs. Rounding (against the borrower):
  value_usd_e6 (V)     = floor(floor(units * M / 1e18) * price / 10^decimals)   (v2 A3; M = 1e18 -> v1 formula)
  static_limit_usd_e6  = floor(V * base_ltv_bps / 1e4)
  capacity_usd_e6      = floor((Q + R + D_eff) * (1e4 - h) / 1e4), D_eff = 0 and h = weekend when closed
  aggregate_headroom   = max(0, capacity - total_debt)                         (v2 A1)
  b_c_usd_e6           = min(floor(V * max_nectar_ltv_bps / 1e4), aggregate_headroom)
  borrow_ok            = 0 < borrow <= LTV cap, total_debt + borrow <= capacity, borrow * 1e4 <= V * pre_liq
  premium_usd_e6       = ceil(max(0, borrow - static) * limit_premium_bps / 1e4)
  origination_fee      = ceil(borrow * origination_fee_bps / 1e4)              (v2 A5)
  net_proceeds         = max(0, borrow - premium - origination)
  buyers/lenders fee   = floor(premium * bps / 1e4); treasury = remainder; buyers -> treasury when Q == 0
  acc_increment_e18    = floor(buyers * 1e18 / Q)
  ltv_bps              = ceil(debt * 1e4 / V); u32::MAX (4294967295) when V == 0 and debt > 0
  triggerable          = debt * 1e4 > V * pre_liq_ltv_bps
  leg: repay = min(debt, quote_remaining); under = ceil(repay * 1e4 * 10^dec / (price * (1e4 - disc)));
       buyer_units = ceil(under * 1e18 / M) (raw units, v2 A3);
       keeper_units = ceil(buyer_units * keeper_fee_bps / 1e4); capped by position units (see settle_leg_m).

Columns (header row of model.csv):
  case, kind                       row id; kind in {limit, leg}
  inputs (limit): units, decimals, price_usd_e6, q_usd_e6, r_usd_e6, d_usd_e6, session_open (0/1),
                  base_ltv_bps, max_nectar_ltv_bps, base_haircut_bps, weekend_haircut_bps, limit_premium_bps,
                  buyers_bps, lenders_bps, borrow_usd_e6, pre_liq_ltv_bps, debt_usd_e6,
                  multiplier_e18, total_debt_usd_e6, origination_fee_bps (v2)
  inputs (leg):   units, decimals, price_usd_e6, debt_usd_e6, quote_remaining_usd_e6, disc_bps, keeper_fee_bps,
                  multiplier_e18 (v2)
  outputs (limit): value_usd_e6, haircut_bps, capacity_usd_e6, static_limit_usd_e6, b_c_usd_e6, borrow_ok (0/1),
                   premium_usd_e6, buyers_fee_usd_e6, lenders_fee_usd_e6, treasury_fee_usd_e6, acc_increment_e18,
                   ltv_bps, triggerable (0/1), aggregate_headroom_usd_e6, origination_fee_usd_e6,
                   net_proceeds_usd_e6 (v2)
  outputs (leg):  repay_usd_e6, buyer_units, keeper_units (empty repay => no leg)
Cells that do not apply to a kind are empty.

Rows named demo_* are the sandbox scenario in tests/sandbox.rs (closed session, NVDAx $180 -> $155 -> $140).
Rows named agg_* / mult_* are the v2 scenarios in tests/sandbox_v7.rs (aggregate debt; 2-for-1 split).
Run:  python3 contracts/nectar-core/tests/model.py          (write)
      python3 contracts/nectar-core/tests/model.py --check  (CI: fail if model.csv differs)
"""
import csv
import io
import os
import sys

BPS = 10_000
E18 = 10 ** 18
U32_MAX = 2 ** 32 - 1

COLUMNS = [
    "case", "kind",
    "units", "decimals", "price_usd_e6", "q_usd_e6", "r_usd_e6", "d_usd_e6", "session_open",
    "base_ltv_bps", "max_nectar_ltv_bps", "base_haircut_bps", "weekend_haircut_bps", "limit_premium_bps",
    "buyers_bps", "lenders_bps", "borrow_usd_e6", "pre_liq_ltv_bps", "debt_usd_e6",
    "quote_remaining_usd_e6", "disc_bps", "keeper_fee_bps",
    "value_usd_e6", "haircut_bps", "capacity_usd_e6", "static_limit_usd_e6", "b_c_usd_e6", "borrow_ok",
    "premium_usd_e6", "buyers_fee_usd_e6", "lenders_fee_usd_e6", "treasury_fee_usd_e6", "acc_increment_e18",
    "ltv_bps", "triggerable",
    "repay_usd_e6", "buyer_units", "keeper_units",
    # v2 (appended so v1 columns keep their positions)
    "multiplier_e18", "total_debt_usd_e6", "origination_fee_bps",
    "aggregate_headroom_usd_e6", "origination_fee_usd_e6", "net_proceeds_usd_e6",
    # WO-23a (appended): Shields (kind=shield) and Profit-Lock (kind=self)
    "shield_fee_bps", "pl_fee_bps", "pl_fee_usd_e6", "fill_usd_e6", "units_kept",
    # WO-23b (appended): Nectar Reserve (kind=reserve; reserve_fee_usd_e6 also on limit rows)
    "reserve_fee_usd_e6", "reserve_shares", "reserve_acc_increment_e18", "reserve_deposit_usd_e6", "minted_shares",
    "reserve_acc_units_e18",
]
PROFIT_LOCK_BPS = 50  # contract constant (PRD §4.10)
ORIGINATION_BPS = 30  # contract default (interface-v7.md A5)


def ceil_div(a, b):
    return -(-a // b)


def value(units, price, dec, m=E18):
    return (units * m // E18) * price // 10 ** dec


def ltv_bps(debt, v):
    if v == 0:
        return 0 if debt == 0 else U32_MAX
    return min(ceil_div(debt * BPS, v), U32_MAX)


def limit_row(case, units, dec, price, q, r, d, session_open, base_ltv, max_ltv, base_h, weekend_h,
              prem_bps, buyers_bps, lenders_bps, borrow, pre_liq, debt, m=E18, total_debt=0,
              orig_bps=ORIGINATION_BPS):
    v = value(units, price, dec, m)
    h = base_h if session_open else weekend_h
    d_eff = d if session_open else 0
    cap = (q + r + d_eff) * (BPS - h) // BPS
    static = v * base_ltv // BPS
    ltv_cap = v * max_ltv // BPS
    headroom = max(0, cap - total_debt)
    b_c = min(ltv_cap, headroom)
    premium = ceil_div(max(0, borrow - static) * prem_bps, BPS)
    origination = ceil_div(borrow * orig_bps, BPS)
    lenders = premium * lenders_bps // BPS
    # WO-23b: buyers' share split Q : R (R backed by shares; limit rows assume 1:1 shares = r)
    buyers, acc, r_fee, _ = split_qr(premium, buyers_bps, lenders_bps, q, r, r)
    treasury = premium - buyers - lenders
    ok = 1 if (0 < borrow <= ltv_cap and total_debt + borrow <= cap and borrow * BPS <= v * pre_liq) else 0
    return {
        "case": case, "kind": "limit", "units": units, "decimals": dec, "price_usd_e6": price,
        "q_usd_e6": q, "r_usd_e6": r, "d_usd_e6": d, "session_open": int(session_open),
        "base_ltv_bps": base_ltv, "max_nectar_ltv_bps": max_ltv, "base_haircut_bps": base_h,
        "weekend_haircut_bps": weekend_h, "limit_premium_bps": prem_bps, "buyers_bps": buyers_bps,
        "lenders_bps": lenders_bps, "borrow_usd_e6": borrow, "pre_liq_ltv_bps": pre_liq, "debt_usd_e6": debt,
        "value_usd_e6": v, "haircut_bps": h, "capacity_usd_e6": cap, "static_limit_usd_e6": static,
        "b_c_usd_e6": b_c, "borrow_ok": ok, "premium_usd_e6": premium, "buyers_fee_usd_e6": buyers,
        "lenders_fee_usd_e6": lenders, "treasury_fee_usd_e6": treasury, "acc_increment_e18": acc,
        "ltv_bps": ltv_bps(debt, v), "triggerable": int(debt * BPS > v * pre_liq),
        "multiplier_e18": m, "total_debt_usd_e6": total_debt, "origination_fee_bps": orig_bps,
        "aggregate_headroom_usd_e6": headroom, "origination_fee_usd_e6": origination,
        "net_proceeds_usd_e6": max(0, borrow - premium - origination),
        "reserve_fee_usd_e6": r_fee,
    }


def split_qr(premium, buyers_bps, lenders_bps, q, r, shares):
    """math::split_premium_qr: quotes = floor(buyers*Q/(Q+R)), Reserve = rest; R ignored without shares."""
    if shares == 0:
        r = 0
    buyers = premium * buyers_bps // BPS
    if q + r == 0:
        return 0, 0, 0, 0
    q_part = buyers * q // (q + r)
    r_part = buyers - q_part
    acc = 0 if q == 0 else q_part * E18 // q
    r_acc = 0 if r_part == 0 else r_part * E18 // shares
    return buyers, acc, r_part, r_acc


def reserve_row(case, q, r, shares, premium, deposit, debt=0, units=0, price=0, disc=0, kfee=0, dec=6):
    """WO-23b (PRD §4.8): fee split Q:R, shares minted for `deposit`, and the Reserve leg at `disc` against R
    (units seized accrue per share: floor(buyer_units * 1e18 / shares))."""
    buyers, acc, r_fee, r_acc = split_qr(premium, SPLIT["buyers_bps"], SPLIT["lenders_bps"], q, r, shares)
    minted = deposit if shares == 0 else ("" if r == 0 else deposit * shares // r)
    row = {"case": case, "kind": "reserve", "q_usd_e6": q, "r_usd_e6": r, "reserve_shares": shares,
           "premium_usd_e6": premium, "buyers_bps": SPLIT["buyers_bps"], "lenders_bps": SPLIT["lenders_bps"],
           "buyers_fee_usd_e6": buyers, "acc_increment_e18": acc, "reserve_fee_usd_e6": r_fee,
           "reserve_acc_increment_e18": r_acc, "reserve_deposit_usd_e6": deposit, "minted_shares": minted,
           "debt_usd_e6": debt, "units": units, "decimals": dec, "price_usd_e6": price, "disc_bps": disc,
           "keeper_fee_bps": kfee, "quote_remaining_usd_e6": r, "multiplier_e18": E18}
    if debt and units and price:
        lg = leg(debt, r, units, price, dec, disc, kfee)
        if lg:
            row.update({"repay_usd_e6": lg[0], "buyer_units": lg[1], "keeper_units": lg[2],
                        "reserve_acc_units_e18": lg[1] * E18 // shares})
    return row


def seize(repay, price, dec, disc, kfee, m=E18):
    under = ceil_div(repay * BPS * 10 ** dec, price * (BPS - disc))
    buyer = ceil_div(under * E18, m)
    keeper = ceil_div(buyer * kfee, BPS)
    return buyer, keeper


def leg(debt, remaining, units, price, dec, disc, kfee, m=E18):
    repay = min(debt, remaining)
    if repay == 0 or units == 0:
        return None
    b, k = seize(repay, price, dec, disc, kfee, m)
    if b + k > units:
        cap_b = units * BPS // (BPS + kfee)
        cap_under = cap_b * m // E18
        covered = cap_under * price * (BPS - disc) // (BPS * 10 ** dec)
        repay = min(repay, covered)
        if repay == 0:
            return None
        b, k = seize(repay, price, dec, disc, kfee, m)
        assert b + k <= units
    return repay, b, k


def leg_row(case, units, dec, price, debt, remaining, disc, kfee, m=E18):
    out = leg(debt, remaining, units, price, dec, disc, kfee, m)
    row = {
        "case": case, "kind": "leg", "units": units, "decimals": dec, "price_usd_e6": price,
        "debt_usd_e6": debt, "quote_remaining_usd_e6": remaining, "disc_bps": disc, "keeper_fee_bps": kfee,
        "multiplier_e18": m,
    }
    if out is not None:
        row.update({"repay_usd_e6": out[0], "buyer_units": out[1], "keeper_units": out[2]})
    return row


NVDAX = dict(dec=6, base_ltv=4000, max_ltv=7000, base_h=1000, weekend_h=2500, prem_bps=300)
SPLIT = dict(buyers_bps=7000, lenders_bps=2000)


def nv(case, units, price, q, r, d, session_open, borrow, pre_liq=7500, debt=None, m=E18, total_debt=0):
    return limit_row(case, units, NVDAX["dec"], price, q, r, d, session_open, NVDAX["base_ltv"], NVDAX["max_ltv"],
                     NVDAX["base_h"], NVDAX["weekend_h"], NVDAX["prem_bps"], SPLIT["buyers_bps"],
                     SPLIT["lenders_bps"], borrow, pre_liq, borrow if debt is None else debt, m, total_debt)


def shield_row(case, units, price, q, d, session_open, borrow, fee_bps, total_debt=0):
    """WO-23a §4.9: sized with the session closed (h = weekend, D = 0) whatever the real session is; the flat
    shield fee ceil(borrow * fee_bps / 1e4) replaces the limit premium, same split; session_open records reality."""
    row = limit_row(case, units, NVDAX["dec"], price, q, 0, d, False, NVDAX["base_ltv"], NVDAX["max_ltv"],
                    NVDAX["base_h"], NVDAX["weekend_h"], NVDAX["prem_bps"], SPLIT["buyers_bps"], SPLIT["lenders_bps"],
                    borrow, 7500, borrow, E18, total_debt)
    fee = ceil_div(borrow * fee_bps, BPS)
    buyers = fee * SPLIT["buyers_bps"] // BPS
    lenders = fee * SPLIT["lenders_bps"] // BPS
    acc = 0 if q == 0 else buyers * E18 // q
    if q == 0:
        buyers = 0
    row.update({
        "kind": "shield", "session_open": int(session_open), "shield_fee_bps": fee_bps, "premium_usd_e6": fee,
        "buyers_fee_usd_e6": buyers, "lenders_fee_usd_e6": lenders, "treasury_fee_usd_e6": fee - buyers - lenders,
        "acc_increment_e18": acc,
        "net_proceeds_usd_e6": max(0, borrow - fee - row["origination_fee_usd_e6"]),
    })
    return row


def self_row(case, units, price, debt, remaining, disc, m=E18, pl_bps=PROFIT_LOCK_BPS, dec=6):
    """WO-23a §4.10: fee = ceil(debt * f_pl / 1e4); fill = debt + fee paid by one opted-in quote;
    Q_repaid = seize(fill, disc, keeper 0) raw units (rounded up); kept = units - Q_repaid. Empty when the quote
    cannot cover the fill or the units cannot cover Q_repaid."""
    fee = ceil_div(debt * pl_bps, BPS)
    fill = debt + fee
    row = {"case": case, "kind": "self", "units": units, "decimals": dec, "price_usd_e6": price, "debt_usd_e6": debt,
           "quote_remaining_usd_e6": remaining, "disc_bps": disc, "multiplier_e18": m, "pl_fee_bps": pl_bps,
           "pl_fee_usd_e6": fee, "fill_usd_e6": fill}
    if remaining >= fill:
        b, _ = seize(fill, price, dec, disc, 0, m)
        if b <= units:
            row.update({"repay_usd_e6": debt, "buyer_units": b, "units_kept": units - b})
    return row


def rows():
    out = []
    # --- sandbox demo scenario (tests/sandbox.rs) ---
    units, q1, q2, kfee = 100_000_000, 10_000_000_000, 5_000_000_000, 50
    demo = nv("demo_borrow", units, 180_000_000, q1 + q2, 0, 0, False, 0)
    borrow = demo["b_c_usd_e6"]  # borrow exactly at the limit
    out.append(nv("demo_borrow", units, 180_000_000, q1 + q2, 0, 0, False, borrow))
    out.append(nv("demo_price_155", units, 155_000_000, q1 + q2, 0, 0, False, borrow, debt=borrow))
    out.append(nv("demo_price_140", units, 140_000_000, q1 + q2, 0, 0, False, borrow, debt=borrow))
    l1 = leg(borrow, q1, units, 140_000_000, 6, 250, kfee)
    out.append(leg_row("demo_leg_1", units, 6, 140_000_000, borrow, q1, 250, kfee))
    units2 = units - l1[1] - l1[2]
    out.append(leg_row("demo_leg_2", units2, 6, 140_000_000, borrow - l1[0], q2, 400, kfee))

    # --- edge cases ---
    out.append(nv("open_session_counts_depth", units, 180_000_000, q1 + q2, 0, 5_000_000_000, True, 12_000_000_000))
    out.append(nv("zero_capacity", units, 180_000_000, 0, 0, 0, False, 1))
    out.append(nv("reserve_only_no_quotes", units, 180_000_000, 0, 9_000_000_000, 0, False, 6_000_000_000))
    out.append(nv("below_static_no_premium", units, 180_000_000, q1, 0, 0, False, 7_000_000_000))
    out.append(nv("above_pre_liq", units, 180_000_000, 100_000_000_000, 0, 0, True, 12_600_000_000, pre_liq=6500))
    out.append(nv("value_zero", 0, 180_000_000, q1, 0, 0, False, 1, debt=1))
    out.append(leg_row("leg_units_cap", 10_000_000, 6, 140_000_000, 10_000_000_000, 10_000_000_000, 250, 50))
    out.append(leg_row("leg_no_debt", 10_000_000, 6, 140_000_000, 0, 10_000_000_000, 250, 50))
    out.append(leg_row("leg_dust_units", 1, 6, 140_000_000, 10_000_000_000, 10_000_000_000, 250, 50))

    # --- deterministic pseudo-random grid ---
    seed = 0x6E656374
    def rnd(n):
        nonlocal seed
        seed = (seed * 6364136223846793005 + 1442695040888963407) % 2 ** 64
        return (seed >> 33) % n
    for i in range(24):
        u = 1 + rnd(1_000_000_000)
        price = 1_000_000 + rnd(1_000_000_000)
        q = rnd(50_000_000_000)
        r = rnd(5_000_000_000)
        d = rnd(5_000_000_000)
        so = rnd(2) == 1
        b = rnd(20_000_000_000)
        out.append(nv("grid_limit_%02d" % i, u, price, q, r, d, so, b, pre_liq=6500 + rnd(1501)))
    for i in range(16):
        u = rnd(500_000_000)
        price = 1_000_000 + rnd(500_000_000)
        out.append(leg_row("grid_leg_%02d" % i, u, 6, price, rnd(20_000_000_000), rnd(20_000_000_000),
                           rnd(2000), rnd(200)))

    # --- v2 A1 aggregate debt (tests/sandbox_v7.rs, closed session, Q = 15k -> capacity 11,250) ---
    q = q1 + q2
    out.append(nv("agg_a_borrow", units, 180_000_000, q, 0, 0, False, 10_500_000_000))
    out.append(nv("agg_b_full", units, 180_000_000, q, 0, 0, False, 11_250_000_000, total_debt=10_500_000_000))
    out.append(nv("agg_b_headroom", units, 180_000_000, q, 0, 0, False, 750_000_000, total_debt=10_500_000_000))
    out.append(nv("agg_b_one_more", units, 180_000_000, q, 0, 0, False, 1, total_debt=11_250_000_000))
    out.append(nv("agg_after_repay", units, 180_000_000, q, 0, 0, False, 500_000_000, total_debt=10_750_000_000))
    out.append(nv("agg_a_price_130", units, 130_000_000, q, 0, 0, False, 10_000_000_000, total_debt=11_250_000_000))
    a_leg = leg(10_000_000_000, q1, units, 130_000_000, 6, 250, kfee)
    out.append(leg_row("agg_a_leg_1", units, 6, 130_000_000, 10_000_000_000, q1, 250, kfee))
    out.append(nv("agg_after_settle", units, 130_000_000, q - a_leg[0], 0, 0, False, 0,
                  total_debt=11_250_000_000 - a_leg[0]))

    # --- v2 A3 multiplier: 2-for-1 split leaves V and LTV unchanged; +2 % dividend reinvestment ---
    out.append(nv("mult_pre_split", units, 180_000_000, q, 0, 0, False, 10_000_000_000))
    out.append(nv("mult_post_split", units, 90_000_000, q, 0, 0, False, 10_000_000_000, m=2 * E18,
                  total_debt=10_000_000_000))
    out.append(nv("mult_dividend_2pct", units, 180_000_000, q, 0, 0, False, 10_000_000_000,
                  m=1_020_000_000_000_000_000))
    out.append(leg_row("mult_leg_split", units, 6, 70_000_000, 10_000_000_000, q1, 250, kfee, m=2 * E18))
    out.append(leg_row("mult_leg_units_cap", 10_000_000, 6, 70_000_000, 10_000_000_000, q1, 250, kfee, m=2 * E18))
    for i in range(12):
        m = E18 // 2 + rnd(5 * E18 // 2)
        u = 1 + rnd(1_000_000_000)
        price = 1_000_000 + rnd(1_000_000_000)
        qq = rnd(50_000_000_000)
        cap_guess = qq * 7500 // BPS
        out.append(nv("grid_mult_%02d" % i, u, price, qq, rnd(5_000_000_000), rnd(5_000_000_000), rnd(2) == 1,
                      rnd(20_000_000_000), pre_liq=6500 + rnd(1501), m=m, total_debt=rnd(cap_guess + 1)))
    for i in range(8):
        m = E18 // 2 + rnd(5 * E18 // 2)
        out.append(leg_row("grid_mult_leg_%02d" % i, rnd(500_000_000), 6, 1_000_000 + rnd(500_000_000),
                           rnd(20_000_000_000), rnd(20_000_000_000), rnd(2000), rnd(200), m=m))

    # --- WO-23a Shields (tests/sandbox_v7b.rs: in session, D = 5k, Q = 15k) ---
    out.append(shield_row("shield_weekend_10k", units, 180_000_000, q, 5_000_000_000, True, 10_000_000_000, 15))
    out.append(shield_row("shield_weekend_over", units, 180_000_000, q, 5_000_000_000, True, 11_251_000_000, 15))
    out.append(shield_row("shield_min_5usd", 1_000_000, 180_000_000, q, 5_000_000_000, True, 5_000_000, 15,
                          total_debt=10_000_000_000))
    out.append(shield_row("shield_event_1k", units, 180_000_000, q, 5_000_000_000, True, 1_000_000_000, 25))
    for i in range(8):
        out.append(shield_row("grid_shield_%02d" % i, 1 + rnd(1_000_000_000), 1_000_000 + rnd(1_000_000_000),
                              rnd(50_000_000_000), rnd(5_000_000_000), rnd(2) == 1, rnd(20_000_000_000),
                              rnd(1001)))

    # --- WO-23a Profit-Lock (tests/sandbox_v7b.rs NEAR leg; tests/sandbox_p2.rs remote |kind=SELF) ---
    out.append(self_row("self_near_10k", units, 180_000_000, 10_000_000_000, 12_000_000_000, 200))
    out.append(self_row("self_remote_11250", units, 180_000_000, 11_250_000_000, 12_000_000_000, 200))
    out.append(self_row("self_no_capacity", units, 180_000_000, 10_000_000_000, 10_049_999_999, 200))
    out.append(self_row("self_split_m2", units, 90_000_000, 10_000_000_000, 12_000_000_000, 200, m=2 * E18))
    for i in range(12):
        m = E18 // 2 + rnd(5 * E18 // 2)
        out.append(self_row("grid_self_%02d" % i, rnd(500_000_000), 1_000_000 + rnd(500_000_000),
                            rnd(20_000_000_000), rnd(25_000_000_000), rnd(2000), m=m))

    # --- WO-23b Nectar Reserve (src/tests_reserve.rs + tests/sandbox_reserve.rs: Q 10k @250, R 5k @1000, $140) ---
    out.append(reserve_row("res_premium_split", q1, 5_000_000_000, 5_000_000_000, 121_500_000, 10_000_000))
    res_leg = reserve_row("res_leg_after_quote", 0, 5_000_000_000, 5_000_000_000, 0, 0, debt=1_250_000_000,
                          units=units - l1[1] - l1[2], price=140_000_000, disc=1000, kfee=kfee)
    out.append(res_leg)
    out.append(reserve_row("res_late_deposit", 0, 3_750_000_000, 5_000_000_000, 0, 3_750_000_000))
    out.append(reserve_row("res_reserve_only", 0, 9_000_000_000, 9_000_000_000, 121_500_000, 10_000_000))
    out.append(reserve_row("res_no_shares", q1, 5_000_000_000, 0, 121_500_000, 10_000_000))
    for i in range(12):
        sh = rnd(20_000_000_000)
        rr = rnd(20_000_000_000) if sh else 0
        out.append(reserve_row("grid_reserve_%02d" % i, rnd(50_000_000_000), rr, sh, rnd(500_000_000),
                               10_000_000 + rnd(5_000_000_000), debt=rnd(20_000_000_000), units=rnd(500_000_000),
                               price=1_000_000 + rnd(500_000_000), disc=1000 + rnd(2000), kfee=rnd(200)))
    return out



def render():
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    w.writeheader()
    for r in rows():
        w.writerow({k: r.get(k, "") for k in COLUMNS})
    return buf.getvalue()


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "model.csv")
    text = render()
    if "--check" in sys.argv:
        # model.csv must be exactly what this script produces; the contract side is checked by
        # `cargo test -p nectar-core model_csv_vectors_match_contract_math` (unit) and tests/sandbox.rs.
        with open(path) as f:
            on_disk = f.read()
        if on_disk != text:
            print("model.csv is stale or hand-edited: run python3 tests/model.py", file=sys.stderr)
            sys.exit(1)
        if "--v7" in sys.argv:
            # gates-v7 G11: the v7 kinds (shield, self, reserve) and the agg_/mult_ rows must be present
            for kind in (",shield,", ",self,", ",reserve,", "agg_a_borrow,", "mult_post_split,"):
                if kind not in on_disk:
                    print("model.csv lacks v7 rows: %s" % kind.strip(","), file=sys.stderr)
                    sys.exit(1)
        print("model.csv OK (%d rows)" % (text.count("\n") - 1))
        return
    with open(path, "w", newline="") as f:
        f.write(text)
    print("wrote", path)


if __name__ == "__main__":
    main()
