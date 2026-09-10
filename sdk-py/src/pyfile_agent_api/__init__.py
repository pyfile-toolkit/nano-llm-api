"""pyfile-agent-api — thin, dependency-free client for a pay-per-call LLM + data API.

Payment: x402 (USDC on Base/Polygon/Arbitrum) or Lightning (L402). No accounts, no API keys.
Uses only the Python standard library. The client holds NO private keys. On HTTP 402 it calls
your `on_payment_required` handler (or raises PaymentRequiredError) so you can pay and retry.

Example::

    from pyfile_agent_api import AgentApi

    api = AgentApi(on_payment_required=my_pay_fn)
    print(api.crypto("bitcoin,nano"))
    print(api.chat([{"role": "user", "content": "hi"}]))
"""
from __future__ import annotations

import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional

DEFAULT_BASE_URL = "https://pyfile-agent.taile3ff35.ts.net"


class PaymentRequiredError(Exception):
    """Raised on HTTP 402 when no on_payment_required handler is set."""

    def __init__(self, payment_required: Optional[dict], status: int = 402):
        super().__init__("Payment required (HTTP 402).")
        self.status = status
        self.payment_required = payment_required


class ApiError(Exception):
    def __init__(self, message: str, status: int, body: Any):
        super().__init__(message)
        self.status = status
        self.body = body


def _decode_payment_required(header_value: Optional[str]) -> Optional[dict]:
    if not header_value:
        return None
    try:
        padded = header_value + "=" * (-len(header_value) % 4)
        return json.loads(base64.b64decode(padded).decode("utf-8"))
    except Exception:
        return {"raw": header_value}


class AgentApi:
    """Thin pay-per-call client (stdlib only)."""

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        on_payment_required: Optional[Callable[[dict, dict], dict]] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.on_payment_required = on_payment_required
        self.headers = headers or {}

    def _do(self, url: str, method: str, body: Optional[bytes], headers: dict):
        req = urllib.request.Request(url, data=body, method=method)
        for k, v in {**self.headers, **headers}.items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
                status = resp.status
                hdrs = dict(resp.headers)
        except urllib.error.HTTPError as e:
            raw = e.read()
            status = e.code
            hdrs = dict(e.headers)
        # Normalize header names to lowercase for reliable lookup.
        hdrs = {k.lower(): v for k, v in hdrs.items()}
        return status, hdrs, raw

    def request(self, path: str, method: str = "GET", query: Optional[dict] = None,
                body: Optional[dict] = None, headers: Optional[dict] = None) -> Any:
        url = self.base_url + path
        if query:
            clean = {k: v for k, v in query.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        base_headers = {"Content-Type": "application/json"} if body is not None else {}

        status, hdrs, raw = self._do(url, method, payload, {**base_headers, **(headers or {})})
        if status == 402:
            pr = _decode_payment_required(hdrs.get("payment-required"))
            if not self.on_payment_required:
                raise PaymentRequiredError(pr)
            paid = self.on_payment_required(pr or {}, {"url": url, "method": method, "path": path})
            extra = (paid or {}).get("headers", {})
            status, hdrs, raw = self._do(url, method, payload, {**base_headers, **extra})
            if status == 402:
                raise PaymentRequiredError(_decode_payment_required(hdrs.get("payment-required")))
        try:
            data = json.loads(raw.decode("utf-8")) if raw else None
        except Exception:
            data = raw.decode("utf-8", "ignore")
        if status >= 400:
            raise ApiError(f"HTTP {status}", status, data)
        return data

    # --- free ---
    def discovery(self) -> Any:
        return self.request("/.well-known/x402")

    def openapi(self) -> Any:
        return self.request("/openapi.json")

    def price(self) -> Any:
        return self.request("/v1/price")

    # --- paid ---
    def chat(self, messages: List[dict], model: str = "gemini-3.6-flash",
             max_tokens: Optional[int] = None) -> Any:
        body: Dict[str, Any] = {"model": model, "messages": messages}
        if max_tokens:
            body["max_tokens"] = max_tokens
        return self.request("/v1/chat/completions", method="POST", body=body)

    def brief(self, topic: str = "crypto", focus: Optional[str] = None) -> Any:
        return self.request("/v1/brief", query={"topic": topic, "focus": focus})

    def data(self, name: str, **params) -> Any:
        return self.request(f"/data/{name}", query=params)

    # convenience
    def dns(self, name: str, type: str = "A") -> Any:
        return self.data("dns", name=name, type=type)

    def crypto(self, ids: str = "bitcoin,nano") -> Any:
        return self.data("crypto", ids=ids)

    def fx(self, base: str = "USD") -> Any:
        return self.data("fx", base=base)

    def whois(self, domain: str) -> Any:
        return self.data("whois", domain=domain)

    def wikipedia(self, title: str) -> Any:
        return self.data("wiki", title=title)

    def weather(self, lat, lon) -> Any:
        return self.data("weather", lat=lat, lon=lon)

    def base_gas(self) -> Any:
        return self.data("gas/base")

    def abi(self, selector: str) -> Any:
        return self.data("abi", selector=selector)

    def wallet_balance(self, address: str, chain: str = "base") -> Any:
        return self.data("wallet/balance", address=address, chain=chain)

    def bolt11_decode(self, invoice: str) -> Any:
        return self.data("bolt11/decode", invoice=invoice)

    def btc_fees(self) -> Any:
        return self.data("btc/fees")

    def ip_info(self, ip: str) -> Any:
        return self.data("ip", ip=ip)
