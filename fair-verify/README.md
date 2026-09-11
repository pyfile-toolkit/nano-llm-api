# Provably-fair draws — reference verifier

This repository publishes the exact algorithm behind the `pyfile-fair` endpoints
(`/data/fair/commit`, `/data/fair/draw`, `/data/fair/pick`, `/data/fair/pick-many`,
`/data/fair/reveal`, `/data/fair/verify`) so anyone can independently verify a result
without trusting the operator.

## Scheme (commit–reveal)

1. For a given round id, the server derives a secret seed:

   ```
   server_seed = HMAC_SHA256(master_secret, "round:" + round_id)
   ```

2. It publishes a commitment before any draw:

   ```
   commit = SHA256(server_seed)
   ```

3. A draw for a client seed and nonce is:

   ```
   h     = HMAC_SHA256(server_seed, client_seed + ":" + nonce)
   n     = int(h[0:13], 16)            # first 52 bits
   value = min + (n mod (max - min + 1))
   ```

4. The server later reveals `server_seed`. Anyone can check
   `SHA256(server_seed) == commit` and recompute the same `value`.

For `pick`, the winner index is `n mod len(candidates)`. For `pick-many`, a
deterministic Fisher–Yates shuffle is driven from the same HMAC stream using
`nonce + ":" + k` for the k-th swap, so the selection is reproducible and has no
repeats.

## Verify

```sh
node verify.mjs --seed <server_seed> --commit <commit> \
  --client-seed <client_seed> --nonce <nonce> --min 1 --max 100
```

or, against the live service:

```sh
curl "https://pyfile-agent.taile3ff35.ts.net:10000/data/fair/verify?round=1&client_seed=s&nonce=1&min=1&max=100"
```

The response includes `commit_ok` (whether `SHA256(server_seed) == commit`) and the
recomputed `value`.

## Why commit–reveal

The commitment is published before the draw, so the operator cannot change the seed
after seeing the client seed. The client seed is chosen by the caller, so the operator
cannot grind the result. Revealing the seed afterwards makes every past draw auditable.

This is a general-purpose verifiable randomness primitive. It is intended for fair
winner selection in bounties and raffles, allocation, sampling and testing — not for
gambling.

## Scope and honesty

- The scheme is only as trustworthy as the commitment being published *before* the
  draw. The `/data/fair/commit` endpoint returns the commitment for a round; record it
  (or anchor it) before drawing if you need strong guarantees.
- `master_secret` is never disclosed; only per-round `server_seed`s are revealed.
- This verifier is a reference implementation of the published algorithm, not an audit
  of the operator's infrastructure.
