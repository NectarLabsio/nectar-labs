#!/usr/bin/env python3
# H-GUARD-V7 (addendum v7 §2). Kunal runs this in his own shell from the repo root (the auto-mode classifier refuses to let
# an agent edit its own guard/settings, correctly):   python3 scripts/v7-install-claude-config.py && bash scripts/test-guard-v7.sh
# Adds the v7 guard rules (Base mainnet 8453 but not 84532, --private-key in any mode, POSTs to market.near.ai), allows
# forge/cast/anvil/avm, sets BASE_CHAIN_ID=84532, and installs .claude/agents/evm.md from docs/process/work/agent-evm.md. Idempotent.
# New agent files load at the next Claude Code session start.
import json, os, shutil

g = '.claude/hooks/guard.sh'
s = open(g).read()
if 'v7 (addendum' not in s:
    anchor = 'account deletion"\n'
    assert s.count(anchor) == 1, 'guard.sh layout changed; apply by hand'
    s = s.replace(anchor, anchor + r"""  # v7 (addendum §2): Base mainnet (8453, not 84532), market.near.ai posts
  echo "$cmd" | grep -Eq '(cast|forge|anvil)' && echo "$cmd" | grep -Eq '(^|[^0-9])8453([^0-9]|$)|--chain +base( |$)' && block "Base mainnet (8453)"
  echo "$cmd" | grep -Eq 'mainnet\.base\.org'                                  && block "Base mainnet RPC"
  echo "$cmd" | grep -Eq 'curl .*market\.near\.ai' && echo "$cmd" | grep -Eq '(-X *POST|--data|-d |-F )' && block "posting on market.near.ai"
""", 1)
    a2 = '# Secrets never go into the repo in any mode.\n'
    assert s.count(a2) == 1
    s = s.replace(a2, a2 + """# EVM keys live in Foundry keystores (--account + --password-file); a --private-key argument is refused in every mode (addendum §9).
echo "$cmd" | grep -Eq -- '--private-key([ =]|$)' && block "--private-key argument (use a Foundry keystore with --account)"
""", 1)
    open(g, 'w').write(s)
    print('guard.sh: v7 rules added')
else:
    print('guard.sh: already v7')

p = '.claude/settings.json'
j = json.load(open(p))
for r in ["Bash(forge *)", "Bash(cast *)", "Bash(anvil *)", "Bash(avm *)"]:
    if r not in j['permissions']['allow']:
        j['permissions']['allow'].append(r)
j.setdefault('env', {})['BASE_CHAIN_ID'] = '84532'
with open(p, 'w') as f:
    json.dump(j, f, indent=2)
    f.write('\n')
print('settings.json: forge/cast/anvil/avm allowed, BASE_CHAIN_ID=84532')

os.makedirs('.claude/agents', exist_ok=True)
shutil.copy('docs/process/work/agent-evm.md', '.claude/agents/evm.md')
print('.claude/agents/evm.md installed (loads at next session start)')
