# nano-llm-api

Pay-per-query LLM API over Nano (`nano:mainnet`, HTTP 402, x402 exact scheme).

Verified seller on https://pursekeeper.dev/sellers (ledgers #18/#19).

## Endpoint

- `POST https://sao-nova-flex-tournaments.trycloudflare.com/v1/chat/completions`
- `GET /health` and `GET /v1/price` are free.

## Flow

1. Unpaid POST returns `402` with `pay_to`, `price_raw`, `asset=XNO`, `network=nano:mainnet`, `scheme=exact`, and `quote=sha256(request body)`.
2. Buyer sends 0.001 XNO to `pay_to`, retries with `X-Nano-Payment: <send block hash>`.
3. Server verifies the block via `pursekeeper.dev/v1/verify` (no Nano node), records the hash, answers.

Replay-safe: each send block hash is consumed exactly once (see `server.mjs`, `payment_reused`).

## Scripts

- `server.mjs` — the HTTP server (402 + verification + consumed-hash store).
- `receive.mjs` — opens the wallet and receives pending blocks (local PoW).
- `send.mjs` — sends Nano from the wallet (work via rainstorm.city for the send threshold).

## Wallet

`nano_3uojbn47b5xqcbs4yibbasamn8aeyqxgyi1z8peogwtdn6z3kagjanjpz4ss`

## Publish

```bash
git remote add origin https://github.com/pyfile-toolkit/nano-llm-api.git
git push -u origin main
```
