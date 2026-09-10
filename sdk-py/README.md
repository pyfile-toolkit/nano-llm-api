# pyfile-agent-api

Thin, **dependency-free** Python client for a pay-per-call **LLM + data API for AI agents**. Pay in **USDC on Base, Polygon, or Arbitrum** via [x402](https://www.x402.org/), or over Lightning (L402).

No accounts. No API keys. The server answers unpaid requests with HTTP `402`; your code pays.

- **LLM chat** — `gemini-3.6-flash` / `gpt-oss-120b` ($0.005 / call)
- **Composite analyst brief** — live market data + an LLM summary ($0.03 / call)
- **Data tools** — DNS, whois, crypto prices, FX, Base gas, abi, BOLT11 decode, hashing/encoding, BTC fees, IP geo ($0.01 / call)

## Install

```bash
pip install git+https://github.com/pyfile-toolkit/nano-llm-api#subdirectory=sdk-py
```

Stdlib only (`urllib`) — no `httpx`/`requests` required.

## Quick start

```python
from pyfile_agent_api import AgentApi

def pay(payment_required, ctx):
    # payment_required["accepts"] tells you asset/network/amount/payTo.
    signed = my_wallet.sign_x402(payment_required["accepts"][0])  # your wallet code
    return {"headers": {"X-PAYMENT": signed}}

api = AgentApi(on_payment_required=pay)

print(api.crypto("bitcoin,nano"))          # $0.01
print(api.brief(topic="defi"))             # $0.03
print(api.chat([{"role": "user", "content": "hi"}]))  # $0.005
```

## Handling payment yourself

If you omit `on_payment_required`, a `402` raises `PaymentRequiredError` carrying the decoded terms:

```python
from pyfile_agent_api import AgentApi, PaymentRequiredError

api = AgentApi()
try:
    api.chat([{"role": "user", "content": "hi"}])
except PaymentRequiredError as e:
    print(e.payment_required["accepts"])  # pay, then retry with X-PAYMENT
```

## API

| Method | Cost | Notes |
|---|---|---|
| `discovery()`, `openapi()`, `price()` | free | discovery surfaces |
| `chat(messages, model=?, max_tokens=?)` | $0.005 | LLM completion |
| `brief(topic=?, focus=?)` | $0.03 | composite analyst brief |
| `data(name, **params)` | $0.01 | generic `/data/<name>` |
| `dns/crypto/fx/whois/wikipedia/weather/base_gas/abi/wallet_balance/bolt11_decode/btc_fees/ip_info` | $0.01 | convenience wrappers |

## Design

No private keys inside. No third-party dependencies. Safe to drop into any agent runtime (LangChain, CrewAI, AutoGen, plain scripts).

Live discovery: `https://pyfile-agent.taile3ff35.ts.net/.well-known/x402`

## License

MIT
