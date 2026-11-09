import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';
const sidebars: SidebarsConfig = {
  docs: [
    { type: 'category', label: 'Start here', items: ['start/what-is-nectar-labs', 'start/quick-start', 'start/live-on-testnet'] },
    { type: 'category', label: 'Concepts', items: ['concepts/pappus-quotes', 'concepts/cramer-limits', 'concepts/exit-gap', 'concepts/premium-and-fee-index', 'concepts/notice-periods', 'concepts/pre-liquidation', 'concepts/whitepaper'] },
    { type: 'category', label: 'Protocol', items: ['protocol/contract-reference', 'protocol/storage-and-gas', 'protocol/settlement-flow', 'protocol/preimage-format', 'protocol/oracle-policy', 'protocol/quoter-tee', 'protocol/solana-vault', 'protocol/chain-signatures'] },
    { type: 'category', label: 'Integrate', items: ['integrate/feed-rest', 'integrate/feed-mcp', 'integrate/sdk', 'integrate/run-a-keeper', 'integrate/post-quotes'] },
    { type: 'category', label: 'Security', items: ['security/trust-model', 'security/threats', 'security/keys-and-roles', 'security/audits', 'security/report-a-bug'] },
    { type: 'category', label: 'Operations', items: ['operations/runbook', 'operations/incidents', 'operations/upgrades', 'operations/monitoring'] },
    { type: 'category', label: 'Project', items: ['project/evidence', 'project/prior-work', 'project/roadmap', 'project/team', 'project/brand'] },
    { type: 'category', label: 'Legal', items: ['legal/privacy', 'legal/cookies', 'legal/terms', 'legal/disclaimers'] },
  ],
};
export default sidebars;
