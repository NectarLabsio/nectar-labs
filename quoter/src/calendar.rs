//! `calendar` job (WO-24, PRD §4.7, F-342): NYSE weekend / holiday / early-close check for a UTC second.
//! The table is a build-time copy of packages/config/nyse-calendar.json (a test asserts the copy is identical).
//! The answer can only ever ask to close (`force_closed: true`); regular hours stay the contract's own check.
//! US DST (Energy Policy Act 2005): from the 2nd Sunday of March 02:00 EST to the 1st Sunday of November 02:00 EDT.

use serde_json::Value;

pub const CALENDAR_JSON: &str = include_str!("../data/nyse-calendar.json");
const DAY: i64 = 86_400;
const EST_S: i64 = -5 * 3_600;
const EDT_S: i64 = -4 * 3_600;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    Weekend,
    Holiday,
    EarlyClose,
    Open,
}

impl Reason {
    pub fn as_str(self) -> &'static str {
        match self {
            Reason::Weekend => "weekend",
            Reason::Holiday => "holiday",
            Reason::EarlyClose => "early_close",
            Reason::Open => "open",
        }
    }
    pub fn force_closed(self) -> bool {
        self != Reason::Open
    }
}

/// Days since 1970-01-01 (H. Hinnant's `days_from_civil`).
pub fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// (year, month, day) of a day number.
pub fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday).
pub fn weekday(days: i64) -> i64 {
    (days + 4).rem_euclid(7)
}

/// Day number of the n-th (1-based) Sunday of a month.
fn nth_sunday(y: i64, m: i64, n: i64) -> i64 {
    let first = days_from_civil(y, m, 1);
    first + (7 - weekday(first)) % 7 + 7 * (n - 1)
}

/// UTC offset of America/New_York at a UTC second.
pub fn ny_offset_s(utc_s: i64) -> i64 {
    let (y, _, _) = civil_from_days(utc_s.div_euclid(DAY));
    let start = nth_sunday(y, 3, 2) * DAY + 2 * 3_600 - EST_S; // 02:00 EST = 07:00 UTC
    let end = nth_sunday(y, 11, 1) * DAY + 2 * 3_600 - EDT_S; // 02:00 EDT = 06:00 UTC
    if (start..end).contains(&utc_s) { EDT_S } else { EST_S }
}

pub struct Calendar {
    holidays: Vec<i64>,
    early: Vec<(i64, i64)>, // (day, close second of day, local)
    first_year: i64,
    last_year: i64,
}

fn parse_date(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let num = |r: std::ops::Range<usize>| -> Option<i64> {
        let t = &s[r];
        t.bytes().all(|c| c.is_ascii_digit()).then(|| t.parse().ok())?
    };
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let days = days_from_civil(y, m, d);
    (civil_from_days(days) == (y, m, d)).then_some(days)
}

fn parse_hhmm(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() != 5 || b[2] != b':' || !b[..2].iter().chain(&b[3..]).all(u8::is_ascii_digit) {
        return None;
    }
    let (h, m): (i64, i64) = (s[..2].parse().ok()?, s[3..].parse().ok()?);
    (h < 24 && m < 60).then_some(h * 3_600 + m * 60)
}

impl Calendar {
    pub fn embedded() -> Result<Calendar, &'static str> {
        Self::parse(CALENDAR_JSON)
    }

    pub fn parse(raw: &str) -> Result<Calendar, &'static str> {
        let v: Value = serde_json::from_str(raw).map_err(|_| "calendar_data")?;
        if v["timezone"].as_str() != Some("America/New_York") {
            return Err("calendar_data");
        }
        let mut holidays = Vec::new();
        for h in v["holidays"].as_array().ok_or("calendar_data")? {
            holidays.push(h.as_str().and_then(parse_date).ok_or("calendar_data")?);
        }
        let mut early = Vec::new();
        for e in v["early_closes"].as_array().ok_or("calendar_data")? {
            let day = e["date"].as_str().and_then(parse_date).ok_or("calendar_data")?;
            let close = e["close"].as_str().and_then(parse_hhmm).ok_or("calendar_data")?;
            early.push((day, close));
        }
        let years = holidays.iter().map(|d| civil_from_days(*d).0);
        let first_year = years.clone().min().ok_or("calendar_data")?;
        let last_year = years.max().ok_or("calendar_data")?;
        Ok(Calendar { holidays, early, first_year, last_year })
    }

    /// Weekend > holiday > early close (from the close time to local midnight) > open.
    pub fn check(&self, now_s: u64) -> Result<Reason, &'static str> {
        // Bound keeps every i64 product far from overflow (year ≤ ~36812).
        let utc = i64::try_from(now_s).ok().filter(|t| *t < (1i64 << 40)).ok_or("bad_now_s")?;
        let local = utc + ny_offset_s(utc);
        let day = local.div_euclid(DAY);
        let sod = local.rem_euclid(DAY);
        let (y, _, _) = civil_from_days(day);
        if y < self.first_year || y > self.last_year {
            return Err("calendar_out_of_range");
        }
        let wd = weekday(day);
        if wd == 0 || wd == 6 {
            return Ok(Reason::Weekend);
        }
        if self.holidays.contains(&day) {
            return Ok(Reason::Holiday);
        }
        if self.early.iter().any(|(d, close)| *d == day && sod >= *close) {
            return Ok(Reason::EarlyClose);
        }
        Ok(Reason::Open)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_round_trip() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(weekday(days_from_civil(2026, 11, 10)), 2); // Tuesday
        for z in [-1_000_000i64, -1, 0, 1, 20_000, 20_768, 1_000_000] {
            let (y, m, d) = civil_from_days(z);
            assert_eq!(days_from_civil(y, m, d), z);
        }
    }

    #[test]
    fn dst_dates() {
        assert_eq!(civil_from_days(nth_sunday(2026, 3, 2)), (2026, 3, 8));
        assert_eq!(civil_from_days(nth_sunday(2026, 11, 1)), (2026, 11, 1));
        assert_eq!(civil_from_days(nth_sunday(2027, 3, 2)), (2027, 3, 14));
        assert_eq!(civil_from_days(nth_sunday(2027, 11, 1)), (2027, 11, 7));
    }

    #[test]
    fn embedded_parses() {
        let c = Calendar::embedded().unwrap();
        assert_eq!((c.first_year, c.last_year), (2026, 2027));
        assert_eq!(c.holidays.len(), 20);
        assert_eq!(c.early.len(), 3);
    }
}
