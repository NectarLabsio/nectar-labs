---
name: feedback-utc-dates-and-media-refs
description: The session's "today" is Kunal's local date (IST), not UTC; check date -u before stamping docs. Before calling a media file unreferenced, grep X_POST.md and scripts too
metadata:
  type: feedback
---

Stamp docs with UTC from `date -u`, not the environment's "Today's date". During WO-94 the environment said 2026-11-14 while UTC was 2026-11-13T21:30Z (Kunal's clock is about 5.5 h ahead).
**Why:** README/FACTS/EVIDENCE timestamps are all UTC; a local date would put "read 2026-11-14" on a check made on the 13th.
**How to apply:** print `datetime.utcnow()` in the first verification script and reuse that timestamp everywhere.

When a work order says a screenshot "then has no reference" after a README swap, grep docs/X_POST.md, docs/README.md and scripts/ before agreeing. In WO-94, X_POST post 2 still used 03-borrow-preview.png; it was moved to 03-borrow-weekend.png and the leftover script reference (scripts/demo/stills-now.mjs) was reported for the cleanup work order.
**Why:** a cleanup WO that deletes a file still named in X_POST breaks Kunal's posting checklist.
Related: [[bulk-edits-and-pending-records]], [[feedback-write-early]].
