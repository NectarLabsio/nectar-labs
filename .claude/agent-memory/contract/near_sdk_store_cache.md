---
name: near-sdk-store-cache
description: near_sdk::store maps cache writes until Drop, so env::storage_usage needs flush() first; unit-test mock storage and raw keys outlive Nectar::new inside one test
metadata:
  type: project
---

`near_sdk::store::LookupMap` holds writes in memory and writes them on `Drop` (near-sdk 5.30.1 store/lookup_map/mod.rs). A
`env::storage_usage()` delta taken inside a method misses them unless the map is `flush()`ed first (WO-34b SR-14, SR-27).

**Why:** in unit tests one contract object lives across "calls", so a `flush()` also writes entries from earlier calls and
inflates the delta (mock-ft `setup()` flushes for this reason). Also, `testing_env!` keeps storage, so raw keys survive a
second `Nectar::new` / `open_remote` in the same `#[test]`: pending legs, confirm budgets and reservation counts carry over.

**How to apply:** measure storage with flush + delta; write one scenario per `#[test]` when raw keys are involved, or call
as the owner to skip per-keeper counters. Related: [[feedback-turn-budget]].
