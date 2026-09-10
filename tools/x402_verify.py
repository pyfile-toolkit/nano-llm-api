#!/usr/bin/env python3
"""x402 payment verification script (Base mainnet).

Verifies a USDC (x402 `exact` scheme) payment on Base:
  1) takes a transaction hash,
  2) queries Base RPC to confirm the tx succeeded and find the USDC Transfer,
  3) checks the recipient (payTo) address,
  4) checks the USDC amount is >= the expected value,
  5) returns JSON with a verification result.

Standard library only (urllib) — no web3/requests needed.

Usage:
  python3 x402_verify.py --tx 0x... --pay-to 0x... --min-usdc 0.002 [--rpc URL]

JSON output:
  {"verified": bool, "reason": str, "tx": str, "from": str, "to": str,
   "amount_usdc": float, "block": int, "network": "eip155:8453"}
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

BASE_RPC = "https://mainnet.base.org"
BASE_RPC_FALLBACKS = [
    "https://base-rpc.publicnode.com",
    "https://1rpc.io/base",
    "https://base.drpc.org",
]
USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913".lower()
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
USDC_DECIMALS = 6


def rpc(method: str, params: list, url: str = BASE_RPC):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    last_err = None
    for endpoint in [url] + ([u for u in BASE_RPC_FALLBACKS if u != url] if url == BASE_RPC else []):
        try:
            req = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json", "User-Agent": "pyfile-x402-verify/1.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.loads(r.read())
            if "error" in data:
                raise RuntimeError(data["error"].get("message", "rpc error"))
            return data["result"]
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue
    raise RuntimeError(str(last_err))


def topic_to_address(topic: str) -> str:
    return "0x" + topic[-40:].lower()


def verify(tx_hash: str, pay_to: str, min_usdc: float, rpc_url: str = BASE_RPC) -> dict:
    pay_to = pay_to.lower()
    tx = rpc("eth_getTransactionReceipt", [tx_hash], rpc_url)
    if not tx:
        return {"verified": False, "reason": "tx_not_found", "tx": tx_hash, "network": "eip155:8453"}
    if tx.get("status") != "0x1":
        return {"verified": False, "reason": "tx_failed", "tx": tx_hash, "network": "eip155:8453"}

    expected = int(round(min_usdc * 10 ** USDC_DECIMALS))
    for log in tx.get("logs", []):
        if log["address"].lower() != USDC_BASE:
            continue
        topics = log.get("topics", [])
        if not topics or topics[0].lower() != TRANSFER_TOPIC:
            continue
        frm = topic_to_address(topics[1])
        to = topic_to_address(topics[2])
        amount = int(log["data"], 16)
        if to == pay_to and amount >= expected:
            return {
                "verified": True,
                "reason": "ok",
                "tx": tx_hash,
                "from": frm,
                "to": to,
                "amount_usdc": amount / 10 ** USDC_DECIMALS,
                "block": int(tx["blockNumber"], 16),
                "network": "eip155:8453",
            }
    return {
        "verified": False,
        "reason": "no_matching_usdc_transfer",
        "tx": tx_hash,
        "expected_to": pay_to,
        "min_usdc": min_usdc,
        "network": "eip155:8453",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify an x402 (USDC on Base) payment")
    ap.add_argument("--tx", required=True, help="Transaction hash (0x...)")
    ap.add_argument("--pay-to", required=True, help="Expected recipient (payTo) address")
    ap.add_argument("--min-usdc", type=float, required=True, help="Minimum USDC amount expected")
    ap.add_argument("--rpc", default=BASE_RPC, help="Base RPC URL")
    args = ap.parse_args()
    try:
        result = verify(args.tx, args.pay_to, args.min_usdc, args.rpc)
    except Exception as e:  # noqa: BLE001
        result = {"verified": False, "reason": "error: " + str(e), "tx": args.tx, "network": "eip155:8453"}
    print(json.dumps(result, indent=2))
    return 0 if result.get("verified") else 1


if __name__ == "__main__":
    sys.exit(main())
