#!/usr/bin/env node
// Reference verifier for pyfile-fair (commit–reveal provably-fair draws).
// No dependencies. Usage:
//   node verify.mjs --seed <hex> --commit <hex> [--client-seed s] [--nonce n] [--min 1] [--max 100]
//   node verify.mjs --commit <hex> --client-seed s --nonce n --min 1 --max 100 --url <base>
import crypto from 'node:crypto';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const seed = arg('seed', null);
const commit = arg('commit', null);
const clientSeed = arg('client-seed', 'client');
const nonce = arg('nonce', '1');
const min = parseInt(arg('min', '1'), 10);
const max = parseInt(arg('max', '100'), 10);
const url = arg('url', null);

function value(seed, clientSeed, nonce, min, max) {
  const h = crypto.createHmac('sha256', seed).update(`${clientSeed}:${nonce}`).digest('hex');
  const n = parseInt(h.slice(0, 13), 16);
  return min + (n % (max - min + 1));
}

if (url) {
  // Verify against the live service: pass the commitment, let the service reveal the seed.
  const q = new URLSearchParams({ round: arg('round', '1'), client_seed: clientSeed, nonce, min, max });
  const r = await fetch(url.replace(/\/$/, '') + '/data/fair/verify?' + q);
  const j = await r.json();
  const recomputed = value(j.server_seed, clientSeed, nonce, min, max);
  console.log(JSON.stringify({ ...j, recomputed, matches: recomputed === j.value }, null, 2));
  process.exit(j.commit_ok && recomputed === j.value ? 0 : 1);
}

if (!seed) {
  console.error('need --seed (or --url to verify against the live service)');
  process.exit(2);
}

const recomputed = value(seed, clientSeed, nonce, min, max);
const out = { client_seed: clientSeed, nonce, min, max, value: recomputed };
if (commit) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  out.commit_provided = commit;
  out.commit_computed = hash;
  out.commit_ok = hash === commit;
}
console.log(JSON.stringify(out, null, 2));
process.exit(commit && !out.commit_ok ? 1 : 0);
