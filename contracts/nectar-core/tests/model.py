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
]
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
    buyers = premium * buyers_bps // BPS
    lenders = premium * lenders_bps // BPS
    if q == 0:
        buyers, acc = 0, 0
    else:
        acc = buyers * E18 // q
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
    }


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
        print("model.csv OK (%d rows)" % (text.count("\n") - 1))
        return
    with open(path, "w", newline="") as f:
        f.write(text)
    print("wrote", path)


if __name__ == "__main__":
    main()
