# @pyfile-toolkit/agent-api

Tiny client for a **pay-per-call LLM + data API** for AI agents. Pay in **USDC on Base, Polygon, or Arbitrum** via [x402](https://www.x402.org/), or in **sats over Lightning (L402)**.

No accounts. No API keys. No subscriptions. The server answers unpaid requests with HTTP `402`, and your code pays.

- **LLM chat** — `gemini-3.6-flash` or `gpt-oss-120b` ($0.005 / call)
- **Data tools** — DNS, whois, crypto prices, FX rates, Base gas, abi lookup, BOLT11 decode, hashing/encoding, BTC fees, IP geo, cert transparency, URL metadata ($0.003 / call)

Live discovery: `https://pyfile-agent.taile3ff35.ts.net/.well-known/x402`

## Install

```bash
npm i @pyfile-toolkit/agent-api
# or, straight from GitHub while the npm package is pending:
npm i github:pyfile-toolkit/nano-llm-api
```

## Quick start

```js
import { AgentApi } from '@pyfile-toolkit/agent-api';

const api = new AgentApi({
  // Called whenever the server replies 402. Return headers for the retry.
  async onPaymentRequired(paymentRequired, req) {
    // paymentRequired.accepts[] tells you: asset, network, amount, payTo.
    const signed = await myWallet.signX402(paymentRequired.accepts[0]); // your wallet code
    return { headers: { 'X-PAYMENT': signed } };
  },
});

// Free:
const { prices } = await api.price();

// Paid ($0.005):
const answer = await api.chat({ messages: [{ role: 'user', content: 'Explain x402 in one line.' }] });

// Paid ($0.003):
const { prices: coins } = await api.crypto('bitcoin,nano');
```

## Handling payment yourself

If you omit `onPaymentRequired`, a `402` throws a `PaymentRequiredError` carrying the decoded terms — inspect and pay manually:

```js
import { AgentApi, PaymentRequiredError } from '@pyfile-toolkit/agent-api';

const api = new AgentApi();
try {
  await api.chat({ messages: [{ role: 'user', content: 'hi' }] });
} catch (e) {
  if (e instanceof PaymentRequiredError) {
    console.log(e.paymentRequired.accepts); // pay, then retry with X-PAYMENT
  }
}
```

## API

| Method | Cost | Notes |
|---|---|---|
| `discovery()` | free | x402 resource manifest |
| `openapi()` | free | OpenAPI 3.1 spec |
| `price()` | free | current prices |
| `chat({ messages, model?, max_tokens? })` | $0.005 | LLM completion |
| `data(name, params)` | $0.003 | generic `/data/<name>` |
| `dns(name, type?)`, `crypto(ids?)`, `fx(base?)`, `whois(domain)`, `wikipedia(title)`, `weather(lat, lon)`, `baseGas()`, `abi(selector)`, `walletBalance(address, chain?)`, `bolt11Decode(invoice)`, `btcFees()`, `ipInfo(ip)` | $0.003 | convenience wrappers |

## Payment rails

- **x402** — server returns `402` + a `payment-required` header (base64 JSON with `accepts[]`). Sign a USDC transfer, retry with `X-PAYMENT`.
- **Lightning L402** — the same resources are available over Lightning; GET returns a `WWW-Authenticate: L402` challenge with an invoice; retry with `Authorization: L402 <macaroon>:<preimage>`.

## Design

The SDK holds **no private keys** and does no signing. That is your wallet's job. This keeps the package small and safe to drop into any agent runtime.

## License

MIT
