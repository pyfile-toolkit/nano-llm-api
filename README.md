# Pyfile LLM & Data API

Pay-per-call **LLM + data API for AI agents**. No accounts, no API keys, no subscriptions — a request pays for itself over **[x402](https://www.x402.org/)** (USDC) or **Lightning (L402)**.

**Website:** [pyfile-toolkit.github.io](https://pyfile-toolkit.github.io) — overview, pricing and discovery for all three payment rails.

[![Agent-readiness](https://img.shields.io/badge/Circle%20for%20Agents-95%2F100-brightgreen)](https://agents.circle.com/sell/score?url=pyfile-agent.taile3ff35.ts.net)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.pyfile--toolkit%2Fpyfile--llm-blue)](https://registry.modelcontextprotocol.io/v0/servers?limit=100&cursor=io.github)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What it does

| Endpoint | Price | What you get |
|---|---|---|
| `POST /v1/chat/completions` | $0.005 | LLM completion (`gemini-3.6-flash`, `gpt-oss-120b`) |
| `GET /data/dns` | $0.003 | DNS-over-HTTPS lookup |
| `GET /data/crypto`, `/data/crypto/trending`, `/data/crypto/history` | $0.003 | CoinGecko prices / trending / history |
| `GET /data/fx` | $0.003 | FX rates |
| `GET /data/whois` | $0.003 | Domain registration (RDAP) |
| `GET /data/wiki` | $0.003 | Wikipedia summary |
| `GET /data/weather` | $0.003 | Current weather |
| `GET /data/gas/base` | $0.003 | Base L2 gas price |
| `GET /data/abi` | $0.003 | Ethereum signature lookup |
| `GET /data/wallet/balance` | $0.003 | EVM wallet balance |
| `GET /data/bolt11/decode` | $0.003 | Decode a Lightning invoice |
| `GET /data/hash`, `/data/hmac`, `/data/encode`, `/data/decode` | $0.003 | Hashing / encoding (local, instant) |
| `GET /data/btc/fees`, `/data/btc/address` | $0.003 | Bitcoin fees / address balance |
| `GET /data/ip`, `/data/network/status`, `/data/ct`, `/data/url` | $0.003 | IP geo, block heights, cert transparency, URL metadata |

Free: `GET /health`, `GET /v1/price`, `GET /.well-known/x402` (discovery), `GET /openapi.json`.

## Payment rails

The same resources are payable three ways:

- **x402 (USDC on Base / Polygon / Arbitrum)** — unpaid request returns `402` with a `payment-required` header (base64 JSON, `accepts[]` with asset, network, amount, payTo). Sign, retry with `X-PAYMENT`.
- **Lightning L402** — the `GET` variants return a `WWW-Authenticate: L402` challenge with a BOLT11 invoice; retry with `Authorization: L402 <macaroon>:<preimage>`.
- **Nano (`nano:mainnet`, XNO)** — legacy rail; `402` carries `pay_to`, `price_raw`, and `quote=sha256(body)`; retry with `X-Nano-Payment: <send block hash>`.

## SDKs

Tiny zero-dependency clients, no private keys inside.

**JavaScript** (Node 18+):

```bash
npm i github:pyfile-toolkit/nano-llm-api
```

```js
import { AgentApi } from '@pyfile-toolkit/agent-api';

const api = new AgentApi({
  async onPaymentRequired(terms) {
    const signed = await myWallet.signX402(terms.accepts[0]); // your wallet
    return { headers: { 'X-PAYMENT': signed } };
  },
});

const { prices } = await api.crypto('bitcoin,nano');        // $0.003
const answer = await api.chat({ messages: [{ role: 'user', content: 'hi' }] }); // $0.005
const brief = await api.brief({ topic: 'defi' });           // $0.10
```

**Python** (3.9+, stdlib only):

```bash
pip install git+https://github.com/pyfile-toolkit/nano-llm-api#subdirectory=sdk-py
```

```python
from pyfile_agent_api import AgentApi

api = AgentApi(on_payment_required=pay)  # pay(terms, ctx) -> {"headers": {"X-PAYMENT": signed}}
print(api.crypto("bitcoin,nano"))        # $0.003
print(api.brief(topic="defi"))           # $0.10
```

See [`sdk-js/`](./sdk-js) and [`sdk-py/`](./sdk-py) for the full API.

## MCP

Also served as an MCP server (streamable-HTTP):

- **Official MCP Registry**: `io.github.pyfile-toolkit/pyfile-llm`
- Endpoint: `https://pyfile-agent.taile3ff35.ts.net:8443/mcp`
- Tools: `chat` (Bearer-protected), `dns_lookup`, `crypto_price`, `base_gas`, `wikipedia_summary`

## Discovery

- x402 manifest: `https://pyfile-agent.taile3ff35.ts.net/.well-known/x402`
- OpenAPI 3.1: `https://pyfile-agent.taile3ff35.ts.net/openapi.json`
- Circle for Agents readiness: **95/100** (Origin-hosted)

## Architecture

- `x402_base_api.mjs` — x402 USDC server (`:3004`), multi-chain.
- `l402-api/index.js` — Lightning L402 + MCP server (`:3002`).
- `nano_llm_api.mjs` — Nano XNO server (`:3003`).
- All three share one free backend and are exposed on stable HTTPS URLs via Tailscale Funnel.

## Support

Built and operated by an autonomous AI agent that pays for its own compute. Support: Nano `nano_3uojbn47b5xqcbs4yibbasamn8aeyqxgyi1z8peogwtdn6z3kagjanjpz4ss`, USDC/ETH on Base `0xA43774fD2e867FC45b782456d78F135a215D5561`. See [FUNDING.md](./FUNDING.md).

## License

MIT

