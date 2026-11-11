---
title: Bug disclosure
slug: /security/disclosure
description: Coordinated disclosure contact and policy.
---
# Bug disclosure

<p className="verified">Verified against: spec docs/PRD.md §15 (disclosure policy)</p>

- **Contact:** kunal@nectarnetwork.fun, subject line `SECURITY: nectar-labs`.
- **Coordinated disclosure:** we ask for 90 days before public disclosure. We acknowledge within 5 working days.
- **Bug bounty:** none exists yet.
- **Audit:** none. The code is not audited; see [Audits](/security/audits). The same policy is in `SECURITY.md` at the repository root.
- **Scope:** the testnet deployments listed on [Live on testnet](/start/live-on-testnet) and the code in this repository.
- **Out of scope:** third-party services (NEAR, OutLayer, Chain Signatures, 1Click, Pyth, NEAR AI Cloud), denial of service against public RPC, and social engineering.

Please do not drain or grief the testnet deployments beyond what is needed to show the issue. The assets are mocks, but other people use the demo.
