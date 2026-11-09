#!/usr/bin/env python3
"""Reference model for nectar-core P0 maths. Writes tests/model.csv (do not edit the CSV by hand).

Integer arithmetic only, mirroring contracts/nectar-core/src/math.rs. Rounding (against the borrower):
  value_usd_e6 (V)     = floor(units * price / 10^decimals)
  static_limit_usd_e6  = floor(V * base_ltv_bps / 1e4)
  capacity_usd_e6      = floor((Q + R + D_eff) * (1e4 - h) / 1e4), D_eff = 0 and h = weekend when closed
  b_c_usd_e6           = min(floor(V * max_nectar_ltv_bps / 1e4), capacity)
  premium_usd_e6       = ceil(max(0, borrow - static) * limit_premium_bps / 1e4)
  buyers/lenders fee   = floor(premium * bps / 1e4); treasury = remainder; buyers -> treasury when Q == 0
  acc_increment_e18    = floor(buyers * 1e18 / Q)
  ltv_bps              = ceil(debt * 1e4 / V); u32::MAX (4294967295) when V == 0 and debt > 0
  triggerable          = debt * 1e4 > V * pre_liq_ltv_bps
  leg: repay = min(debt, quote_remaining); buyer_units = ceil(repay * 1e4 * 10^dec / (price * (1e4 - disc)));
       keeper_units = ceil(buyer_units * keeper_fee_bps / 1e4); capped by position units (see settle_leg).

Columns (header row of model.csv):
  case, kind                       row id; kind in {limit, leg}
  inputs (limit): units, decimals, price_usd_e6, q_usd_e6, r_usd_e6, d_usd_e6, session_open (0/1),
                  base_ltv_bps, max_nectar_ltv_bps, base_haircut_bps, weekend_haircut_bps, limit_premium_bps,
                  buyers_bps, lenders_bps, borrow_usd_e6, pre_liq_ltv_bps, debt_usd_e6
  inputs (leg):   units, decimals, price_usd_e6, debt_usd_e6, quote_remaining_usd_e6, disc_bps, keeper_fee_bps
  outputs (limit): value_usd_e6, haircut_bps, capacity_usd_e6, static_limit_usd_e6, b_c_usd_e6, borrow_ok (0/1),
                   premium_usd_e6, buyers_fee_usd_e6, lenders_fee_usd_e6, treasury_fee_usd_e6, acc_increment_e18,
                   ltv_bps, triggerable (0/1)
  outputs (leg):  repay_usd_e6, buyer_units, keeper_units (empty repay => no leg)
Cells that do not apply to a kind are empty.

Rows named demo_* are the sandbox scenario in tests/sandbox.rs (closed session, NVDAx $180 -> $155 -> $140).
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
]


def ceil_div(a, b):
    return -(-a // b)


def value(units, price, dec):
    return units * price // 10 ** dec


def ltv_bps(debt, v):
    if v == 0:
        return 0 if debt == 0 else U32_MAX
    return min(ceil_div(debt * BPS, v), U32_MAX)


def limit_row(case, units, dec, price, q, r, d, session_open, base_ltv, max_ltv, base_h, weekend_h,
              prem_bps, buyers_bps, lenders_bps, borrow, pre_liq, debt):
    v = value(units, price, dec)
    h = base_h if session_open else weekend_h
    d_eff = d if session_open else 0
    cap = (q + r + d_eff) * (BPS - h) // BPS
    static = v * base_ltv // BPS
    b_c = min(v * max_ltv // BPS, cap)
    premium = ceil_div(max(0, borrow - static) * prem_bps, BPS)
    buyers = premium * buyers_bps // BPS
    lenders = premium * lenders_bps // BPS
    if q == 0:
        buyers, acc = 0, 0
    else:
        acc = buyers * E18 // q
    treasury = premium - buyers - lenders
    ok = 1 if (0 < borrow <= b_c and borrow * BPS <= v * pre_liq) else 0
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
    }


def seize(repay, price, dec, disc, kfee):
    buyer = ceil_div(repay * BPS * 10 ** dec, price * (BPS - disc))
    keeper = ceil_div(buyer * kfee, BPS)
    return buyer, keeper


def leg(debt, remaining, units, price, dec, disc, kfee):
    repay = min(debt, remaining)
    if repay == 0 or units == 0:
        return None
    b, k = seize(repay, price, dec, disc, kfee)
    if b + k > units:
        cap_b = units * BPS // (BPS + kfee)
        covered = cap_b * price * (BPS - disc) // (BPS * 10 ** dec)
        repay = min(repay, covered)
        if repay == 0:
            return None
        b, k = seize(repay, price, dec, disc, kfee)
        assert b + k <= units
    return repay, b, k


def leg_row(case, units, dec, price, debt, remaining, disc, kfee):
    out = leg(debt, remaining, units, price, dec, disc, kfee)
    row = {
        "case": case, "kind": "leg", "units": units, "decimals": dec, "price_usd_e6": price,
        "debt_usd_e6": debt, "quote_remaining_usd_e6": remaining, "disc_bps": disc, "keeper_fee_bps": kfee,
    }
    if out is not None:
        row.update({"repay_usd_e6": out[0], "buyer_units": out[1], "keeper_units": out[2]})
    return row


NVDAX = dict(dec=6, base_ltv=4000, max_ltv=7000, base_h=1000, weekend_h=2500, prem_bps=300)
SPLIT = dict(buyers_bps=7000, lenders_bps=2000)


def nv(case, units, price, q, r, d, session_open, borrow, pre_liq=7500, debt=None):
    return limit_row(case, units, NVDAX["dec"], price, q, r, d, session_open, NVDAX["base_ltv"], NVDAX["max_ltv"],
                     NVDAX["base_h"], NVDAX["weekend_h"], NVDAX["prem_bps"], SPLIT["buyers_bps"],
                     SPLIT["lenders_bps"], borrow, pre_liq, borrow if debt is None else debt)


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
