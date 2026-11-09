#!/usr/bin/env python3
"""Independent reference model for quoter/tests/vectors.json (interface-p1 §Quoter, D-014).

Regenerate: python3 -I quoter/tests/gen_vectors.py > quoter/tests/vectors.json
vectors.json is the shared contract with contracts/ (WO-10): tell the orchestrator before changing any case.
Integer arithmetic only (Python int), mirroring the Rust implementation without sharing code with it.
"""
import hashlib
import json

MODEL = "as-v1"


def stdin_of(**over):
    base = {"v": 1, "symbol": "NVDAx", "position_id": "0", "oracle_price_usd_e6": "140000000",
            "session_open": False, "seize_usd_e6": "11250000000", "vol_bps": 420,
            "quotes": [{"id": "0", "max_discount_bps": 250, "remaining_usd_e6": "10000000000"}]}
    base.update(over)
    return json.dumps(base, separators=(",", ":"))


def q(id_, maxd, rem="10000000000"):
    return {"id": id_, "max_discount_bps": maxd, "remaining_usd_e6": rem}


def secret(env, name):
    raw = env.get(name)
    if raw is None:
        return None
    s = raw.strip(" \t\n\r\x0c")
    if not s or len(s) > 5 or not s.isdigit() or not s.isascii() or (len(s) > 1 and s[0] == "0"):
        return None
    v = int(s)
    return v if v <= 10000 else None


def expected(stdin, env):
    d = json.loads(stdin)
    fills = []
    for qt in d["quotes"]:
        qb = secret(env, f"MM_{qt['id']}_Q_BPS")
        gb = secret(env, f"MM_{qt['id']}_GAMMA_BPS")
        maxd = qt["max_discount_bps"]
        disc = maxd if qb is None or gb is None else min(maxd, d["vol_bps"] + qb * gb * d["vol_bps"] // 100_000_000)
        fills.append('{"id":"%s","disc_bps":%d}' % (qt["id"], disc))
    sha = hashlib.sha256(stdin.encode()).hexdigest()
    return ('{"v":1,"symbol":"%s","position_id":"%s","input_sha256":"%s","price_e6":"%s","src":"oracle",'
            '"depth_e6":"0","depth_src":"none","session_open":%s,"vol_bps":%d,"fills":[%s],"model":"%s"}'
            % (d["symbol"], d["position_id"], sha, d["oracle_price_usd_e6"], "true" if d["session_open"] else "false",
               d["vol_bps"], ",".join(fills), MODEL))


def err(code):
    return '{"v":1,"error":"%s"}' % code


S = {"MM_0_Q_BPS": "5000", "MM_0_GAMMA_BPS": "5000"}
EIGHT = [q(str(i), 100 + 20 * i) for i in range(8)]
EIGHT_ENV = {}
for i in range(8):
    if i == 3:
        continue  # quote 3: no secrets → its cap
    EIGHT_ENV[f"MM_{i}_Q_BPS"] = str(1000 * i + 500)
    EIGHT_ENV[f"MM_{i}_GAMMA_BPS"] = str(10000 - 1100 * i)
U64MAX = str(2**64 - 1)
U128MAX = str(2**128 - 1)
WIDE = [q(str(2**64 - 1 - i), 10000, U128MAX) for i in range(8)]
WIDE_ENV = {f"MM_{x['id']}_{k}": "10000" for x in WIDE for k in ("Q_BPS", "GAMMA_BPS")}

ok_cases = [
    ("spec_example_clamped_to_max", stdin_of(), S),
    ("formula_mid", stdin_of(vol_bps=40), S),
    ("q_zero_gives_vol", stdin_of(vol_bps=40), {"MM_0_Q_BPS": "0", "MM_0_GAMMA_BPS": "10000"}),
    ("gamma_10000_q_10000_doubles_vol", stdin_of(vol_bps=40), {"MM_0_Q_BPS": "10000", "MM_0_GAMMA_BPS": "10000"}),
    ("gamma_10000_q_2500", stdin_of(vol_bps=100), {"MM_0_Q_BPS": "2500", "MM_0_GAMMA_BPS": "10000"}),
    ("vol_zero_gives_zero", stdin_of(vol_bps=0), {"MM_0_Q_BPS": "10000", "MM_0_GAMMA_BPS": "10000"}),
    ("floor_rounding", stdin_of(vol_bps=333, quotes=[q("0", 500)]), {"MM_0_Q_BPS": "3333", "MM_0_GAMMA_BPS": "7777"}),
    ("missing_all_secrets_uses_max", stdin_of(vol_bps=40), {}),
    ("missing_gamma_uses_max", stdin_of(vol_bps=40), {"MM_0_Q_BPS": "5000"}),
    ("invalid_secret_text_uses_max", stdin_of(vol_bps=40), {"MM_0_Q_BPS": "abc", "MM_0_GAMMA_BPS": "5000"}),
    ("secret_out_of_range_uses_max", stdin_of(vol_bps=40), {"MM_0_Q_BPS": "10001", "MM_0_GAMMA_BPS": "5000"}),
    ("secret_negative_uses_max", stdin_of(vol_bps=40), {"MM_0_Q_BPS": "-1", "MM_0_GAMMA_BPS": "5000"}),
    ("secret_whitespace_trimmed", stdin_of(vol_bps=40), {"MM_0_Q_BPS": " 5000\n", "MM_0_GAMMA_BPS": "5000"}),
    ("other_quote_secrets_do_not_apply", stdin_of(vol_bps=40), {"MM_1_Q_BPS": "5000", "MM_1_GAMMA_BPS": "5000"}),
    ("max_discount_zero", stdin_of(vol_bps=40, quotes=[q("0", 0)]), S),
    ("session_open_echoed", stdin_of(vol_bps=40, session_open=True, position_id="17"), S),
    ("zero_quotes", stdin_of(quotes=[]), {}),
    ("unknown_field_ignored", stdin_of(vol_bps=40, extra={"a": 1}), S),
    ("eight_quotes_mixed", stdin_of(vol_bps=60, position_id="42", quotes=EIGHT), EIGHT_ENV),
    ("eight_quotes_widest_values", stdin_of(symbol="ABCDEFGHIJKLMNOP", position_id=U64MAX, oracle_price_usd_e6=U128MAX,
                                            seize_usd_e6=U128MAX, vol_bps=10000, quotes=WIDE), WIDE_ENV),
]

err_cases = [
    ("malformed_json", "{not json", {}, "bad_json"),
    ("empty_stdin", "", {}, "bad_json"),
    ("json_not_object", "[1]", {}, "bad_json"),
    ("unknown_v", stdin_of(v=2), S, "unknown_v"),
    ("missing_v", json.dumps({"symbol": "NVDAx"}), S, "missing_v"),
    ("nine_quotes", stdin_of(quotes=[q(str(i), 100) for i in range(9)]), {}, "too_many_quotes"),
    ("duplicate_quote_id", stdin_of(quotes=[q("0", 100), q("0", 200)]), {}, "dup_quote_id"),
    ("numeric_quote_id", stdin_of(quotes=[{"id": 0, "max_discount_bps": 100, "remaining_usd_e6": "1"}]), {}, "bad_quote_id"),
    ("max_discount_over_10000", stdin_of(quotes=[q("0", 10001)]), {}, "bad_max_discount"),
    ("vol_over_10000", stdin_of(vol_bps=10001), {}, "bad_vol_bps"),
    ("oracle_price_zero", stdin_of(oracle_price_usd_e6="0"), {}, "bad_oracle_price"),
    ("oracle_price_leading_zero", stdin_of(oracle_price_usd_e6="0140000000"), {}, "bad_oracle_price"),
    ("symbol_with_quote_char", stdin_of(symbol='NV"DA'), {}, "bad_symbol"),
    ("input_too_large", stdin_of() + " " * 4096, {}, "input_too_large"),
]

vectors = []
for name, stdin, env in ok_cases:
    out = expected(stdin, env)
    vectors.append({"name": name, "stdin": stdin, "env": env, "expected_stdout": out, "stdout_bytes": len(out.encode()),
                    "expected_stdout_fields": json.loads(out)})
for name, stdin, env, code in err_cases:
    out = err(code)
    vectors.append({"name": name, "stdin": stdin, "env": env, "expected_stdout": out, "stdout_bytes": len(out.encode()),
                    "expected_stdout_fields": json.loads(out)})

print(json.dumps({"model": MODEL, "spec": "docs/work/interface-p1.md#quoter (D-014)", "cases": vectors}, indent=1))
