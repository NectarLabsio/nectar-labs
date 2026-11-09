//! P1 entry points (feature `p1`), stubs until P1 opens (CLAUDE.md §1). Not in the default build.

use near_sdk::json_types::U64;
use near_sdk::{env, near};

use crate::{Nectar, NectarExt};

#[near]
impl Nectar {
    /// OutLayer quoter callback (PRD §6.5). P1 implements parse + clamp + settle.
    #[private]
    pub fn on_quoter_result(&mut self, position_id: U64) {
        let _ = position_id;
        env::panic_str("on_quoter_result: P1 not implemented");
    }
}
