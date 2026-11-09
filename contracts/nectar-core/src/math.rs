//! Pure integer maths for the Cramér limit, premium split, fee index and P0 static settlement.
//! No floats. Every multiplication is checked. Rounding is always against the borrower:
//! value / limits round down, premium and seized units round up.
//! `tests/model.py` mirrors these functions line by line and writes `tests/model.csv`.

pub const BPS: u128 = 10_000;
pub const E18: u128 = 1_000_000_000_000_000_000;

pub type MathResult<T> = Result<T, &'static str>;

pub const ERR_OVERFLOW: &str = "math overflow";

pub fn pow10(decimals: u8) -> MathResult<u128> {
    10u128.checked_pow(decimals as u32).ok_or(ERR_OVERFLOW)
}

pub fn mul_div_floor(a: u128, b: u128, d: u128) -> MathResult<u128> {
    if d == 0 {
        return Err("division by zero");
    }
    Ok(a.checked_mul(b).ok_or(ERR_OVERFLOW)? / d)
}

pub fn mul_div_ceil(a: u128, b: u128, d: u128) -> MathResult<u128> {
    if d == 0 {
        return Err("division by zero");
    }
    Ok(a.checked_mul(b).ok_or(ERR_OVERFLOW)?.div_ceil(d))
}

pub fn add(a: u128, b: u128) -> MathResult<u128> {
    a.checked_add(b).ok_or(ERR_OVERFLOW)
}

pub fn sub(a: u128, b: u128) -> MathResult<u128> {
    a.checked_sub(b).ok_or("math underflow")
}

/// `V = units * price_usd_e6 / 10^decimals`, rounded down.
pub fn value_usd_e6(units: u128, price_usd_e6: u128, decimals: u8) -> MathResult<u128> {
    mul_div_floor(units, price_usd_e6, pow10(decimals)?)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LimitParams {
    pub decimals: u8,
    pub price_usd_e6: u128,
    pub q_usd_e6: u128,
    pub r_usd_e6: u128,
    pub d_usd_e6: u128,
    pub session_open: bool,
    pub base_ltv_bps: u16,
    pub max_nectar_ltv_bps: u16,
    pub base_haircut_bps: u16,
    pub weekend_haircut_bps: u16,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Limit {
    pub value_usd_e6: u128,
    pub haircut_bps: u16,
    /// D_c after the session rule (0 when the session is closed).
    pub d_eff_usd_e6: u128,
    /// (1e4 - h_c) * (Q_c + R_c + D_c) / 1e4, rounded down.
    pub capacity_usd_e6: u128,
    /// max_nectar_ltv_bps * V / 1e4, rounded down.
    pub ltv_cap_usd_e6: u128,
    /// base_ltv_bps * V / 1e4, rounded down (what the market lends without Nectar).
    pub static_limit_usd_e6: u128,
    /// B_c = min(ltv_cap, capacity).
    pub b_c_usd_e6: u128,
}

pub fn haircut_bps(session_open: bool, base: u16, weekend: u16) -> u16 {
    if session_open { base } else { weekend }
}

/// Exit capacity `(1e4 - h_c)(Q_c + R_c + D_c)/1e4`, with `D_c = 0` when the session is closed.
pub fn capacity(p: &LimitParams) -> MathResult<(u16, u128, u128)> {
    let h = haircut_bps(p.session_open, p.base_haircut_bps, p.weekend_haircut_bps);
    let d_eff = if p.session_open { p.d_usd_e6 } else { 0 };
    let sum = add(add(p.q_usd_e6, p.r_usd_e6)?, d_eff)?;
    let cap = mul_div_floor(sum, sub(BPS, h as u128)?, BPS)?;
    Ok((h, d_eff, cap))
}

/// Cramér limit for `units` of collateral (interface-p0.md, D-009).
pub fn limit(units: u128, p: &LimitParams) -> MathResult<Limit> {
    let value = value_usd_e6(units, p.price_usd_e6, p.decimals)?;
    let (h, d_eff, cap) = capacity(p)?;
    let ltv_cap = mul_div_floor(value, p.max_nectar_ltv_bps as u128, BPS)?;
    let static_limit = mul_div_floor(value, p.base_ltv_bps as u128, BPS)?;
    Ok(Limit {
        value_usd_e6: value,
        haircut_bps: h,
        d_eff_usd_e6: d_eff,
        capacity_usd_e6: cap,
        ltv_cap_usd_e6: ltv_cap,
        static_limit_usd_e6: static_limit,
        b_c_usd_e6: ltv_cap.min(cap),
    })
}

/// `max(0, borrow - static) * limit_premium_bps / 1e4`, rounded up.
pub fn premium_usd_e6(borrow: u128, static_limit: u128, limit_premium_bps: u16) -> MathResult<u128> {
    let above = borrow.saturating_sub(static_limit);
    mul_div_ceil(above, limit_premium_bps as u128, BPS)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct PremiumSplit {
    /// Buyer share credited to the fee index (0 when Q_c == 0; then it goes to treasury).
    pub buyers_usd_e6: u128,
    pub lenders_usd_e6: u128,
    pub treasury_usd_e6: u128,
    pub acc_increment_e18: u128,
}

/// Split per fee_split; treasury takes the rounding remainder. If no quote weight exists,
/// the buyers' share goes to treasury so no USDC is orphaned in the index.
pub fn split_premium(premium: u128, buyers_bps: u16, lenders_bps: u16, q_usd_e6: u128) -> MathResult<PremiumSplit> {
    let mut buyers = mul_div_floor(premium, buyers_bps as u128, BPS)?;
    let lenders = mul_div_floor(premium, lenders_bps as u128, BPS)?;
    let acc_inc = if q_usd_e6 == 0 {
        buyers = 0;
        0
    } else {
        mul_div_floor(buyers, E18, q_usd_e6)?
    };
    let treasury = sub(sub(premium, buyers)?, lenders)?;
    Ok(PremiumSplit { buyers_usd_e6: buyers, lenders_usd_e6: lenders, treasury_usd_e6: treasury, acc_increment_e18: acc_inc })
}

/// MasterChef debt: `weight * acc / 1e18`, rounded UP so a checkpoint can never pay more than
/// the exact entitlement (the index never over-distributes; see fee_index_matches_reference_loop).
pub fn fee_debt(weight_usd_e6: u128, acc_e18: u128) -> MathResult<u128> {
    mul_div_ceil(weight_usd_e6, acc_e18, E18)
}

/// Fees accrued since the last checkpoint: `floor(weight * acc / 1e18) - debt`, floored at 0
/// (the ceil/floor pair can differ by at most 1 µUSDC).
pub fn pending_fees(weight_usd_e6: u128, acc_e18: u128, debt_e6: u128) -> MathResult<u128> {
    Ok(mul_div_floor(weight_usd_e6, acc_e18, E18)?.saturating_sub(debt_e6))
}

/// LTV in bps, rounded up; u32::MAX when value is 0 and debt > 0.
pub fn ltv_bps(debt: u128, value: u128) -> u32 {
    if value == 0 {
        return if debt == 0 { 0 } else { u32::MAX };
    }
    match mul_div_ceil(debt, BPS, value) {
        Ok(v) if v <= u32::MAX as u128 => v as u32,
        _ => u32::MAX,
    }
}

/// Pre-liquidation trigger: `debt * 1e4 > V * pre_liq_ltv_bps`.
pub fn triggerable(debt: u128, value: u128, pre_liq_ltv_bps: u16) -> MathResult<bool> {
    let lhs = debt.checked_mul(BPS).ok_or(ERR_OVERFLOW)?;
    let rhs = value.checked_mul(pre_liq_ltv_bps as u128).ok_or(ERR_OVERFLOW)?;
    Ok(lhs > rhs)
}

/// Units the buyer receives for `repay` at `disc_bps`, plus the keeper's cut (both rounded up):
/// buyer = repay * 1e4 * 10^dec / (price * (1e4 - disc)); keeper = buyer * keeper_fee_bps / 1e4.
pub fn seize_units(repay: u128, price_usd_e6: u128, decimals: u8, disc_bps: u16, keeper_fee_bps: u16) -> MathResult<(u128, u128)> {
    let denom = price_usd_e6.checked_mul(sub(BPS, disc_bps as u128)?).ok_or(ERR_OVERFLOW)?;
    let num = repay.checked_mul(BPS).ok_or(ERR_OVERFLOW)?;
    let buyer = mul_div_ceil(num, pow10(decimals)?, denom)?;
    let keeper = mul_div_ceil(buyer, keeper_fee_bps as u128, BPS)?;
    Ok((buyer, keeper))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Leg {
    pub repay_usd_e6: u128,
    pub buyer_units: u128,
    pub keeper_units: u128,
}

/// One settlement leg against one quote. Repays `min(debt, quote_remaining)`; if the position's
/// units cannot cover that at the quote's discount, repays only what the units cover.
pub fn settle_leg(
    debt: u128,
    quote_remaining: u128,
    units: u128,
    price_usd_e6: u128,
    decimals: u8,
    disc_bps: u16,
    keeper_fee_bps: u16,
) -> MathResult<Option<Leg>> {
    let mut repay = debt.min(quote_remaining);
    if repay == 0 || units == 0 {
        return Ok(None);
    }
    let (mut b, mut k) = seize_units(repay, price_usd_e6, decimals, disc_bps, keeper_fee_bps)?;
    if add(b, k)? > units {
        let cap_b = mul_div_floor(units, BPS, add(BPS, keeper_fee_bps as u128)?)?;
        let px_disc = price_usd_e6.checked_mul(sub(BPS, disc_bps as u128)?).ok_or(ERR_OVERFLOW)?;
        let covered = mul_div_floor(cap_b, px_disc, BPS.checked_mul(pow10(decimals)?).ok_or(ERR_OVERFLOW)?)?;
        repay = repay.min(covered);
        if repay == 0 {
            return Ok(None);
        }
        (b, k) = seize_units(repay, price_usd_e6, decimals, disc_bps, keeper_fee_bps)?;
        if add(b, k)? > units {
            return Err("seize exceeds units");
        }
    }
    Ok(Some(Leg { repay_usd_e6: repay, buyer_units: b, keeper_units: k }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nvdax(price: u128, q: u128, session_open: bool) -> LimitParams {
        LimitParams {
            decimals: 6,
            price_usd_e6: price,
            q_usd_e6: q,
            r_usd_e6: 0,
            d_usd_e6: 5_000_000_000,
            session_open,
            base_ltv_bps: 4000,
            max_nectar_ltv_bps: 7000,
            base_haircut_bps: 1000,
            weekend_haircut_bps: 2500,
        }
    }

    #[test]
    fn limit_closed_session_ignores_depth_and_uses_weekend_haircut() {
        let l = limit(100_000_000, &nvdax(180_000_000, 15_000_000_000, false)).unwrap();
        assert_eq!(l.value_usd_e6, 18_000_000_000);
        assert_eq!(l.haircut_bps, 2500);
        assert_eq!(l.d_eff_usd_e6, 0);
        assert_eq!(l.capacity_usd_e6, 11_250_000_000);
        assert_eq!(l.ltv_cap_usd_e6, 12_600_000_000);
        assert_eq!(l.static_limit_usd_e6, 7_200_000_000);
        assert_eq!(l.b_c_usd_e6, 11_250_000_000);
    }

    #[test]
    fn limit_open_session_counts_depth() {
        let l = limit(100_000_000, &nvdax(180_000_000, 15_000_000_000, true)).unwrap();
        assert_eq!(l.haircut_bps, 1000);
        assert_eq!(l.capacity_usd_e6, 18_000_000_000);
        assert_eq!(l.b_c_usd_e6, 12_600_000_000);
    }

    #[test]
    fn limit_zero_capacity_is_zero() {
        let l = limit(100_000_000, &nvdax(180_000_000, 0, false)).unwrap();
        assert_eq!(l.b_c_usd_e6, 0);
    }

    #[test]
    fn premium_rounds_up_and_is_zero_below_static() {
        assert_eq!(premium_usd_e6(7_200_000_000, 7_200_000_000, 300).unwrap(), 0);
        assert_eq!(premium_usd_e6(1, 7_200_000_000, 300).unwrap(), 0);
        assert_eq!(premium_usd_e6(11_250_000_000, 7_200_000_000, 300).unwrap(), 121_500_000);
        assert_eq!(premium_usd_e6(7_200_000_001, 7_200_000_000, 300).unwrap(), 1);
    }

    #[test]
    fn split_sends_buyer_share_to_treasury_without_quotes() {
        let s = split_premium(121_500_000, 7000, 2000, 0).unwrap();
        assert_eq!(s.buyers_usd_e6, 0);
        assert_eq!(s.lenders_usd_e6, 24_300_000);
        assert_eq!(s.treasury_usd_e6, 97_200_000);
        let s = split_premium(121_500_000, 7000, 2000, 15_000_000_000).unwrap();
        assert_eq!(s.buyers_usd_e6, 85_050_000);
        assert_eq!(s.treasury_usd_e6, 12_150_000);
        assert_eq!(s.acc_increment_e18, 5_670_000_000_000_000);
    }

    #[test]
    fn fee_index_matches_reference_loop() {
        // Deterministic LCG; O(1) index vs O(n) pro-rata loop over 1,000 ops.
        let mut seed: u64 = 0x5eed;
        let mut next = || {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            seed >> 33
        };
        let n = 5usize;
        let mut weight = [0u128; 5];
        let mut debt = [0u128; 5];
        let mut claim_idx = [0u128; 5];
        let mut claim_loop = [0u128; 5];
        let mut acc = 0u128;
        let mut distributed = 0u128;
        for _ in 0..1000 {
            let op = next() % 3;
            let i = (next() as usize) % n;
            match op {
                0 => {
                    // deposit
                    claim_idx[i] += pending_fees(weight[i], acc, debt[i]).unwrap();
                    weight[i] += 100_000_000 + (next() as u128 % 1_000_000_000);
                    debt[i] = fee_debt(weight[i], acc).unwrap();
                }
                1 => {
                    // withdraw half
                    claim_idx[i] += pending_fees(weight[i], acc, debt[i]).unwrap();
                    weight[i] /= 2;
                    debt[i] = fee_debt(weight[i], acc).unwrap();
                }
                _ => {
                    let q: u128 = weight.iter().sum();
                    if q == 0 {
                        continue;
                    }
                    let fee = 1_000 + next() as u128 % 50_000_000;
                    let inc = mul_div_floor(fee, E18, q).unwrap();
                    acc += inc;
                    distributed += fee;
                    for j in 0..n {
                        claim_loop[j] += weight[j] * fee / q;
                    }
                }
            }
        }
        let mut total_idx = 0u128;
        for j in 0..n {
            let c = claim_idx[j] + pending_fees(weight[j], acc, debt[j]).unwrap();
            total_idx += c;
            // index result within 1 µUSDC per distribution event of the loop result
            let diff = c.abs_diff(claim_loop[j]);
            assert!(diff <= 1000, "quote {j}: idx {c} loop {}", claim_loop[j]);
        }
        assert!(total_idx <= distributed, "index never over-distributes");
    }

    #[test]
    fn seize_rounds_up_and_keeper_cut() {
        let (b, k) = seize_units(10_000_000_000, 140_000_000, 6, 250, 50).unwrap();
        // 10000e6*1e4*1e6 / (140e6*9750) = 73_260_073.26... -> 73_260_074
        assert_eq!(b, 73_260_074);
        assert_eq!(k, 366_301);
    }

    #[test]
    fn settle_leg_caps_on_units() {
        let leg = settle_leg(10_000_000_000, 10_000_000_000, 10_000_000, 140_000_000, 6, 250, 50).unwrap().unwrap();
        assert!(leg.buyer_units + leg.keeper_units <= 10_000_000);
        assert!(leg.repay_usd_e6 < 10_000_000_000);
        assert!(settle_leg(0, 1, 1, 1, 6, 0, 0).unwrap().is_none());
        assert!(settle_leg(1, 1, 0, 1, 6, 0, 0).unwrap().is_none());
    }

    #[test]
    fn ltv_and_trigger() {
        assert_eq!(ltv_bps(11_250_000_000, 14_000_000_000), 8036);
        assert_eq!(ltv_bps(1, 0), u32::MAX);
        assert_eq!(ltv_bps(0, 0), 0);
        assert!(triggerable(11_250_000_000, 14_000_000_000, 7500).unwrap());
        assert!(!triggerable(11_250_000_000, 15_500_000_000, 7500).unwrap());
        assert!(!triggerable(7500, 10_000, 7500).unwrap());
    }

    #[test]
    fn overflow_is_an_error_not_a_wrap() {
        assert_eq!(mul_div_floor(u128::MAX, 2, 1), Err(ERR_OVERFLOW));
        assert_eq!(pow10(39), Err(ERR_OVERFLOW));
        assert!(mul_div_ceil(1, 1, 0).is_err());
    }
}
