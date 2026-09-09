// Отправка Nano с нашего кошелька. Использование: node nano_send.mjs <to_address> <amount_raw>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(__dirname, '..', 'vault');
const nano = (await import('nanocurrency')).default ?? (await import('nanocurrency'));
const { computeWork, createBlock, derivePublicKey } = nano;

const RPC = 'https://rpc.nano.to';
const wallet = JSON.parse(fs.readFileSync(path.join(VAULT, 'nano_wallet.json'), 'utf8'));
const SECRET_KEY = wallet.secretKey;
const ADDRESS = wallet.address;
const REPRESENTATIVE = ADDRESS; // self-rep

async function rpc(action, params = {}) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  return await res.json();
}

const toAddress = process.argv[2];
const amountRaw = process.argv[3];

if (!toAddress || !amountRaw) {
  console.error('Usage: node nano_send.mjs <to_address> <amount_raw>');
  process.exit(1);
}

// получить pubkey получателя
const pubKey = derivePublicKey(toAddress);
console.log('to pubkey:', pubKey);

// текущий frontier и баланс
const info = await rpc('account_info', { account: ADDRESS });
console.log('frontier:', info.frontier);
console.log('current balance:', info.balance);
const previous = info.frontier;

const currentBalance = BigInt(info.balance);
const amount = BigInt(amountRaw);
const newBalance = (currentBalance - amount).toString();

// PoW: nanocurrency на старой сложности даёт multiplier <1 и нода отклоняет.
// Используем бесплатный work_generate от rainstorm.city (send-порог fffffff800000000).
async function generateWork(hash) {
  const d = await rpcRaw('https://rainstorm.city/api', 'work_generate', { hash, difficulty: 'fffffff800000000' });
  if (!d.work) throw new Error('work_generate failed: ' + JSON.stringify(d));
  return d.work;
}

async function rpcRaw(base, action, params = {}) {
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  return await res.json();
}

const work = await generateWork(previous);
console.log('work:', work);

const blockData = {
  balance: newBalance,
  representative: REPRESENTATIVE,
  previous,
  link: pubKey,        // получатель (link as account public key)
  work,
};

const signed = createBlock(SECRET_KEY, blockData);
console.log('send block hash:', signed.hash);
console.log('signature:', signed.block.signature.slice(0, 24) + '...');

const res = await rpc('process', { json_block: 'true', block: signed.block });
console.log('process result:', JSON.stringify(res));
if (res.hash) {
  console.log('\nSEND BLOCK HASH:', res.hash);
  console.log('Use this in the x402 complete call and bounty claim.');
}
