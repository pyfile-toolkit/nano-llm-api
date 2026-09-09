// Приём входящих Nano (receive pending blocks) для кошелька из vault/nano_wallet.json
// Использует nanocurrency для локального PoW + подписи, RPC rpc.nano.to для broadcast.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(__dirname, '..', 'vault');

const nano = (await import('nanocurrency')).default ?? (await import('nanocurrency'));
const { computeWork, validateWork, createBlock, derivePublicKey, checkWork } = nano;

const RPC = 'https://rpc.nano.to';
const wallet = JSON.parse(fs.readFileSync(path.join(VAULT, 'nano_wallet.json'), 'utf8'));
const SECRET_KEY = wallet.secretKey;      // hex (64 chars)
const PUBLIC_KEY = wallet.publicKey;      // hex
const ADDRESS = wallet.address;

async function rpc(action, params = {}) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  return await res.json();
}

// Получить входящие (pending) блоки
async function getReceivable() {
  const d = await rpc('receivable', { account: ADDRESS, count: 20, source: true });
  return d.blocks || {};
}

// Получить текущий frontier (previous). Если аккаунт не открыт — null.
async function getFrontier() {
  const d = await rpc('account_info', { account: ADDRESS, representative: true });
  return d.frontier || null;
}

async function receiveBlock(hash, amountRaw, previous) {
  // PoW: base = previous (frontier) или публичный ключ при открытии
  const workBase = previous || PUBLIC_KEY;
  const work = await computeWork(workBase);
  console.log('  work computed:', work, 'base:', workBase.slice(0, 16));

  const blockData = {
    balance: amountRaw.toString(),
    representative: ADDRESS, // self-rep (наш собственный адрес)
    previous: previous || '0000000000000000000000000000000000000000000000000000000000000000',
    link: hash,                 // источник (send block hash)
    work,
    // account подставляется автоматически из secret key
  };

  const signed = createBlock(SECRET_KEY, blockData);
  console.log('  signed block hash:', signed.hash);
  console.log('  signature:', signed.block.signature.slice(0, 24) + '...');

  const res = await rpc('process', { json_block: 'true', block: signed.block });
  console.log('  process result:', JSON.stringify(res).slice(0, 300));
  return res;
}

async function main() {
  console.log('wallet:', ADDRESS);
  console.log('public key:', PUBLIC_KEY);

  const frontier = await getFrontier();
  console.log('frontier:', frontier || '(none — account not open)');

  const receivable = await getReceivable();
  const hashes = Object.keys(receivable);
  console.log('pending blocks:', hashes.length);

  if (hashes.length === 0) {
    console.log('Nothing to receive. Exit.');
    return;
  }

  let previous = frontier;
  let total = BigInt(frontier ? (await rpc('account_info', { account: ADDRESS })).balance : 0);

  for (const hash of hashes) {
    // receivable: { [hash]: { amount, source } }
    const entry = receivable[hash];
    const amountRaw = typeof entry === 'string' ? entry : entry.amount;
    console.log('\nReceiving block', hash);
    console.log('  amount raw:', amountRaw);
    console.log('  amount XNO:', Number(amountRaw) / 1e30);

    const newBalance = (BigInt(amountRaw) + total).toString();
    const res = await receiveBlock(hash, newBalance, previous);
    if (res.error) {
      console.error('  ERROR receiving:', res.error, res.message || '');
      // попробовать с другим threshold? nanocurrency computeWork по умолчанию 0xffffffc000000000
      // если ошибка work invalid — попробуем ещё раз с явным threshold
      continue;
    }
    previous = res.hash || (await getFrontier());
    total = total + BigInt(amountRaw);
  }

  // итоговый баланс
  const info = await rpc('account_info', { account: ADDRESS });
  console.log('\nFINAL account_info:', JSON.stringify(info).slice(0, 300));
  const bal = await rpc('account_balance', { account: ADDRESS });
  console.log('FINAL balance:', JSON.stringify(bal));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
