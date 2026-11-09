//! P2 entry points (feature `p2`), stubs until P2 opens (CLAUDE.md §1). Not in the default build.

use near_sdk::json_types::U64;
use near_sdk::{env, near};

use crate::{Nectar, NectarExt};

#[near]
impl Nectar {
    /// Keeper records the Solana settlement tx (PRD §6.5). P2 implements.
    pub fn relay_settlement_result(&mut self, position_id: U64, solana_tx_sig: String) {
        let _ = (position_id, solana_tx_sig);
        env::panic_str("relay_settlement_result: P2 not implemented");
    }

    /// MPC signer callback (PRD §6.5). P2 implements.
    #[private]
    pub fn on_signature(&mut self, position_id: U64) {
        let _ = position_id;
        env::panic_str("on_signature: P2 not implemented");
    }
}
