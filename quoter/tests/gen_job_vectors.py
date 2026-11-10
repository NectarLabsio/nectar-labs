#!/usr/bin/env python3
"""Generates tests/jobs_vectors.json for the v7 OutLayer jobs (WO-24), independently of the Rust code.

* vault_read: PDAs come from tests/pda_kit.json (@solana/kit); Position accounts are built byte by byte from the
  offsets in solana/deploy.md; getAccountInfo responses are JSON-RPC shaped like the live devnet answer
  (the missing-account case is a verbatim devnet response recorded 2026-11-10).
* calendar: local time from Python's zoneinfo (America/New_York, the system tz database), not our DST code.
* multiplier: eth_call responses with hand-built ABI words.
Each case: stdin, the HTTP request the job must make (url + exact body) with its recorded response (or null when
no request may be made), and the exact stdout. Usage: python3 quoter/tests/gen_job_vectors.py
"""
import base64
import json
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
PROGRAM = "ENZaNFHosYeNhsjC85K73feMFwX4w8i1dzuhQ3PzpubW"
DEVNET_RPC = "https://api.devnet.solana.com"
DISC = bytes([170, 188, 143, 228, 122, 64, 247, 208])
U64_MAX = 2**64 - 1


def b58enc(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    s = ""
    while n:
        n, r = divmod(n, 58)
        s = B58[r] + s
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + s


def b58dec(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + B58.index(c)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    return b"\0" * (len(s) - len(s.lstrip("1"))) + raw


def j(o) -> str:
    return json.dumps(o, separators=(",", ":"))


kit = json.load(open(os.path.join(HERE, "pda_kit.json")))
assert kit["program"] == PROGRAM
VAULTS = {v["mint"]: v for v in kit["vaults"]}
DEFAULT_MINT = "3Ve8GiDBtD7crfwUcKukpMigKQaU2aXtSCNgu661E8hT"
OTHER_MINT = "So11111111111111111111111111111111111111112"


def pos_pda(mint: str, pid: int) -> str:
    for p in VAULTS[mint]["positions"]:
        if int(p["id"]) == pid:
            return p["pda"]
    raise KeyError(pid)


def position_bytes(*, authority: bytes, depositor: bytes, amount: int, status: int, vault: bytes, pid: int,
                   bump: int = 255, version: int = 1, disc: bytes = DISC) -> bytes:
    d = (disc + bytes([version]) + authority + depositor + amount.to_bytes(8, "little") + bytes([status]) + vault
         + pid.to_bytes(8, "little") + bytes([bump]))
    assert len(d) == 123 or disc != DISC
    # deploy.md offsets
    assert d[9:41] == authority and d[41:73] == depositor and d[81] == status and d[82:114] == vault
    return d


def account_response(data: bytes, slot: int, owner: str = PROGRAM) -> str:
    return j({"jsonrpc": "2.0", "result": {"context": {"apiVersion": "4.4.0", "slot": slot}, "value": {
        "data": [base64.b64encode(data).decode(), "base64"], "executable": False, "lamports": 1747200,
        "owner": owner, "rentEpoch": U64_MAX, "space": len(data)}}, "id": 1})


def gai_body(pda: str) -> str:
    return j({"jsonrpc": "2.0", "id": 1, "method": "getAccountInfo",
              "params": [pda, {"encoding": "base64", "commitment": "finalized"}]})


def err(code: str) -> str:
    return '{"v":1,"error":"%s"}' % code


AUTH = b58dec("6QPGoVj8ZPndsvDsK3n1Sed4mwyZqD2YnPDSS8y9S1tV")  # an MPC-derived ed25519 key (config.yaml chainsig)
DEPOSITOR = bytes(range(1, 33))
VAULT = b58dec(VAULTS[DEFAULT_MINT]["vault"])
assert len(AUTH) == 32 and len(VAULT) == 32

cases = []


def case(name, stdin, http, expected):
    cases.append({"name": name, "stdin": stdin, "http": http, "expected_stdout": expected,
                  "stdout_bytes": len(expected)})


def vr_found(pid: int, amount: int, slot: int):
    return (f'{{"position_id":"{pid}","units":"{amount}","authority":"ed25519:{b58enc(AUTH)}",'
            f'"depositor":"{b58enc(DEPOSITOR)}","slot_or_block":{slot}}}')


def vr_http(pid: int, response: str, mint: str = DEFAULT_MINT, url: str = DEVNET_RPC):
    return {"url": url, "body": gai_body(pos_pda(mint, pid)), "response": response}


# ---- vault_read
# The exact stdin nectar-core builds (serde_json json! → keys sorted, U64 as a string).
std = lambda pid: j({"chain": "solana-devnet", "job": "vault_read", "position_id": str(pid), "program": PROGRAM})
ok = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=5_000_000, status=1, vault=VAULT, pid=7, bump=255)
case("vault_read_found_contract_input", std(7), vr_http(7, account_response(ok, 520755300)), vr_found(7, 5_000_000, 520755300))
ok0 = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=1, status=1, vault=VAULT, pid=0)
case("vault_read_found_numeric_id",
     j({"job": "vault_read", "chain": "solana-devnet", "program": PROGRAM, "position_id": 0}),
     vr_http(0, account_response(ok0, 1)), vr_found(0, 1, 1))
okmax = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=U64_MAX, status=1, vault=VAULT, pid=U64_MAX)
case("vault_read_u64_max_widest_output", std(U64_MAX), vr_http(U64_MAX, account_response(okmax, U64_MAX)),
     vr_found(U64_MAX, U64_MAX, U64_MAX))
# Verbatim devnet answer for position 0 (no deposit yet), recorded 2026-11-10.
MISSING = '{"jsonrpc":"2.0","result":{"context":{"apiVersion":"4.4.0","slot":520755252},"value":null},"id":1}'
case("vault_read_missing_account_live_recording", std(0), vr_http(0, MISSING), '{"position_id":"0","found":false}')
case("vault_read_wrong_owner", std(7), vr_http(7, account_response(ok, 5, owner="11111111111111111111111111111111")),
     err("wrong_owner"))
bad_disc = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=5, status=1, vault=VAULT, pid=7, disc=bytes(8))
case("vault_read_bad_discriminator", std(7), vr_http(7, account_response(bad_disc, 5)), err("bad_discriminator"))
case("vault_read_short_account", std(7), vr_http(7, account_response(ok[:122], 5)), err("bad_account_len"))
closed = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=5, status=0, vault=VAULT, pid=7)
case("vault_read_status_not_open", std(7), vr_http(7, account_response(closed, 5)), err("position_not_open"))
other_vault = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=5, status=1,
                             vault=b58dec(VAULTS[OTHER_MINT]["vault"]), pid=7)
case("vault_read_vault_mismatch", std(7), vr_http(7, account_response(other_vault, 5)), err("vault_mismatch"))
wrong_id = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=5, status=1, vault=VAULT, pid=8)
case("vault_read_position_id_mismatch", std(7), vr_http(7, account_response(wrong_id, 5)), err("position_mismatch"))
case("vault_read_rpc_error", std(7),
     vr_http(7, j({"jsonrpc": "2.0", "error": {"code": -32005, "message": "Node is behind"}, "id": 1})), err("rpc_error"))
case("vault_read_bad_base64", std(7),
     vr_http(7, j({"jsonrpc": "2.0", "result": {"context": {"slot": 1}, "value": {"data": ["!!!!", "base64"],
                                                                                     "owner": PROGRAM}}, "id": 1})),
     err("bad_base64"))
other = position_bytes(authority=AUTH, depositor=DEPOSITOR, amount=42, status=1,
                       vault=b58dec(VAULTS[OTHER_MINT]["vault"]), pid=3)
case("vault_read_custom_rpc_and_mint",
     j({"job": "vault_read", "chain": "solana-devnet", "program": PROGRAM, "position_id": "3", "mint": OTHER_MINT,
        "rpc_url": "https://devnet.helius-rpc.com/?api-key=x"}),
     vr_http(3, account_response(other, 9), mint=OTHER_MINT, url="https://devnet.helius-rpc.com/?api-key=x"),
     vr_found(3, 42, 9))
case("vault_read_http_rpc_rejected",
     j({"job": "vault_read", "chain": "solana-devnet", "program": PROGRAM, "position_id": "3", "rpc_url": "http://x"}),
     None, err("bad_rpc_url"))
case("vault_read_unsupported_chain",
     j({"job": "vault_read", "chain": "base-sepolia", "program": PROGRAM, "position_id": "3"}), None,
     err("unsupported_chain"))
case("vault_read_bad_program",
     j({"job": "vault_read", "chain": "solana-devnet", "program": "0xdead", "position_id": "3"}), None,
     err("bad_program"))
case("vault_read_bad_position_id",
     j({"job": "vault_read", "chain": "solana-devnet", "program": PROGRAM, "position_id": "007"}), None,
     err("bad_position_id"))

# ---- calendar (expected from zoneinfo)
NY = ZoneInfo("America/New_York")
cal = json.load(open(os.path.join(HERE, "..", "data", "nyse-calendar.json")))
HOL = set(cal["holidays"])
EARLY = {e["date"]: e["close"] for e in cal["early_closes"]}
YEARS = {int(h[:4]) for h in HOL}


def cal_expected(ts: int) -> str:
    lt = datetime.fromtimestamp(ts, timezone.utc).astimezone(NY)
    if lt.year not in YEARS:
        return err("calendar_out_of_range")
    d = lt.strftime("%Y-%m-%d")
    if lt.weekday() >= 5:
        r = "weekend"
    elif d in HOL:
        r = "holiday"
    elif d in EARLY and lt.strftime("%H:%M") >= EARLY[d]:
        r = "early_close"
    else:
        r = "open"
    return '{"force_closed":%s,"reason":"%s"}' % ("false" if r == "open" else "true", r)


def utc(s: str) -> int:
    return int(datetime.strptime(s, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp())


for name, when, reason in [
    ("calendar_weekday_open", "2026-11-10T15:00:00", "open"),
    ("calendar_weekday_overnight_not_forced", "2026-11-11T02:00:00", "open"),
    ("calendar_saturday", "2026-11-14T15:00:00", "weekend"),
    ("calendar_thanksgiving_holiday", "2026-11-26T15:00:00", "holiday"),
    ("calendar_holiday_starts_local_midnight_edt", "2026-07-03T04:00:00", "holiday"),
    ("calendar_day_before_holiday_2359_edt", "2026-07-03T03:59:59", "open"),
    ("calendar_early_close_before_1300_est", "2026-11-27T17:59:59", "open"),
    ("calendar_early_close_at_1300_est", "2026-11-27T18:00:00", "early_close"),
    ("calendar_christmas_eve_early_close", "2026-12-24T20:00:00", "early_close"),
    ("calendar_2027_early_close", "2027-11-26T18:00:00", "early_close"),
    ("calendar_2027_good_friday", "2027-03-26T14:00:00", "holiday"),
    ("calendar_dst_spring_sunday_2359_edt", "2026-03-09T03:59:59", "weekend"),
    ("calendar_dst_spring_monday_0000_edt", "2026-03-09T04:00:00", "open"),
    ("calendar_dst_fall_friday_2359_edt", "2026-10-31T03:59:59", "open"),
    ("calendar_dst_fall_saturday_0000_edt", "2026-10-31T04:00:00", "weekend"),
    ("calendar_dst_fall_sunday_2359_est", "2026-11-02T04:59:59", "weekend"),
    ("calendar_dst_fall_monday_0000_est", "2026-11-02T05:00:00", "open"),
    ("calendar_new_year_2027_holiday", "2027-01-01T15:00:00", "holiday"),
]:
    ts = utc(when)
    exp = cal_expected(ts)
    assert f'"{reason}"' in exp, (name, exp)
    case(name, j({"job": "calendar", "symbol": "NVDAx", "now_s": ts}), None, exp)
ts = utc("2026-11-27T18:00:00")
case("calendar_now_s_as_string", j({"job": "calendar", "symbol": "NVDAx", "now_s": str(ts)}), None, cal_expected(ts))
for name, when in [("calendar_before_table", "2025-12-31T15:00:00"), ("calendar_after_table", "2028-01-03T15:00:00")]:
    exp = cal_expected(utc(when))
    assert exp == err("calendar_out_of_range")
    case(name, j({"job": "calendar", "symbol": "NVDAx", "now_s": utc(when)}), None, exp)
case("calendar_bad_symbol", j({"job": "calendar", "symbol": "NV DA", "now_s": utc("2026-11-10T15:00:00")}), None,
     err("bad_symbol"))
case("calendar_bad_now_s", j({"job": "calendar", "symbol": "NVDAx", "now_s": -1}), None, err("bad_now_s"))

# ---- multiplier
BASE_RPC = "https://sepolia.base.org"
TOKEN = "0x00000000000000000000000000000000000b2020"


def mreq(token=TOKEN, decimals=18):
    return j({"job": "multiplier", "rpc_url": BASE_RPC, "token": token, "decimals": decimals})


def mhttp(result, token=TOKEN):
    body = j({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
              "params": [{"to": token.lower(), "data": "0x1b3ed722"}, "latest"]})
    return {"url": BASE_RPC, "body": body, "response": j({"jsonrpc": "2.0", "id": 1, "result": result})}


word = lambda n: "0x%064x" % n
case("multiplier_wad_one", mreq(), mhttp(word(10**18)), '{"multiplier_e18":"1000000000000000000"}')
case("multiplier_dividend_1_02", mreq(), mhttp(word(102 * 10**16)), '{"multiplier_e18":"1020000000000000000"}')
case("multiplier_split_2_for_1", mreq(decimals=6), mhttp(word(2 * 10**18)), '{"multiplier_e18":"2000000000000000000"}')
case("multiplier_u128_max", mreq(), mhttp(word(2**128 - 1)), '{"multiplier_e18":"%d"}' % (2**128 - 1))
case("multiplier_overflow_u128", mreq(), mhttp(word(2**128)), err("multiplier_overflow"))
case("multiplier_zero", mreq(), mhttp(word(0)), err("zero_multiplier"))
case("multiplier_reverted_empty", mreq(), mhttp("0x"), err("bad_abi_word"))
UP = "0x00000000000000000000000000000000000B2020"
case("multiplier_token_lowercased", mreq(token=UP), mhttp(word(10**18), token=UP), '{"multiplier_e18":"1000000000000000000"}')
case("multiplier_rpc_error", mreq(),
     {"url": BASE_RPC, "body": mhttp("0x")["body"],
      "response": j({"jsonrpc": "2.0", "id": 1, "error": {"code": 3, "message": "execution reverted"}})},
     err("rpc_error"))
case("multiplier_bad_token", mreq(token="0x1234"), None, err("bad_token"))
case("multiplier_missing_decimals", j({"job": "multiplier", "rpc_url": BASE_RPC, "token": TOKEN}), None,
     err("bad_decimals"))
case("multiplier_missing_rpc_url", j({"job": "multiplier", "token": TOKEN, "decimals": 18}), None, err("bad_rpc_url"))

# ---- dispatch
case("unknown_job", j({"job": "price"}), None, err("unknown_job"))
case("job_not_a_string", j({"job": 1}), None, err("unknown_job"))

doc = {
    "spec": "docs/work/wo-24-quoter-jobs.md; contracts/nectar-core/src/remote.rs parse_vault_read; solana/deploy.md",
    "generator": "quoter/tests/gen_job_vectors.py",
    "cases": cases,
}
with open(os.path.join(HERE, "jobs_vectors.json"), "w") as f:
    json.dump(doc, f, indent=1)
    f.write("\n")
print(f"{len(cases)} cases, max stdout {max(c['stdout_bytes'] for c in cases)} bytes")
