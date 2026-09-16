// nano_courier.mjs — доставка ЧУЖОГО подписанного Nano state-блока в сеть.
//
// Зачем: hosted-агенты (ChatGPT GPT, Coze, Codex-sandbox) могут ПОДПИСАТЬ блок
// своим ключом, но не имеют сетевого egress к Nano RPC. Услуга: принять
// подписанный блок → проверить (hash, signature, work при необходимости) →
// broadcast через наш RPC → вернуть hash.
//
// НЕ кастодия: подпись делается ВЛАДЕЛЬЦЕМ ключа; мы не распоряжаемся средствами,
// только доставляем уже подписанный блок. Мы не можем его изменить (подпись не сойдётся).
//
// Использование как модуль:
//   import { courierBlock, validateSignedBlock } from './nano_courier.mjs';
//   const r = await courierBlock(signedBlockJson);
//
// CLI (для теста): node nano_courier.mjs <block.json>
//   block.json = {type:"state", account, previous, representative, balance, link|link_as_account, signature, work?}

import fs from 'fs';
import path from 'path';
import { VAULT } from '../root.mjs';

const nano = (await import('nanocurrency')).default ?? (await import('nanocurrency'));
const { hashBlock, verifyBlock, validateWork, checkWork, computeWork, derivePublicKey } = nano;

const RPC = 'https://rpc.nano.to';
const WORK_RPC = 'https://rainstorm.city/api';
const SEND_THRESHOLD = 'fffffff800000000';

async function rpc(base, action, params = {}) {
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  });
  return await res.json();
}

// Нормализуем блок: process хочет 'link' (hex) И 'link_as_account' (адрес).
function normalizeLink(block) {
  // если link_as_account задан — оставляем, link = hex от него
  if (block.link_as_account && !block.link) {
    block.link = derivePublicKey(block.link_as_account); // address -> pubkey hex
  } else if (block.link && !block.link_as_account) {
    // link — либо 64-hex pubkey, либо адрес
    try { block.link_as_account = nano.deriveAddress(block.link); } catch {}
  }
  return block;
}

// Проверка подписанного блока БЕЗ доверия отправителю.
export async function validateSignedBlock(input) {
  const b = { ...input };
  if (b.type !== 'state') return { ok: false, error: 'only state blocks' };
  for (const f of ['account', 'previous', 'representative', 'balance', 'signature']) {
    if (!b[f]) return { ok: false, error: 'missing field: ' + f };
  }
  normalizeLink(b);
  if (!b.link) return { ok: false, error: 'missing link/link_as_account' };

  let hash;
  try { hash = hashBlock({ account: b.account, previous: b.previous, representative: b.representative, balance: b.balance, link: b.link }); }
  catch (e) { return { ok: false, error: 'hashBlock: ' + e.message }; }

  // подпись проверяем публичным ключом САМОГО аккаунта (не нашим)
  let pk;
  try { pk = derivePublicKey(b.account); } catch (e) { return { ok: false, error: 'bad account: ' + e.message }; }
  if (!verifyBlock({ hash, signature: b.signature, publicKey: pk })) {
    return { ok: false, error: 'signature does not match account', hash };
  }
  return { ok: true, hash, block: b };
}

// Доставка: принять подписанный блок, прикрепить work, broadcast.
export async function courierBlock(input) {
  const v = await validateSignedBlock(input);
  if (!v.ok) return { ok: false, stage: 'validate', error: v.error };
  const b = v.block;

  // work: если нет или невалиден — считаем (send-порог). Платим своим CPU/бесплатным RPC.
  let work = b.work;
  if (!work || !checkWork(work) || !validateWork({ blockHash: v.hash, work, threshold: SEND_THRESHOLD })) {
    const w = await rpc(WORK_RPC, 'work_generate', { hash: v.hash, difficulty: SEND_THRESHOLD });
    if (!w.work) return { ok: false, stage: 'work', error: 'work_generate: ' + JSON.stringify(w) };
    work = w.work;
  }

  const wire = {
    type: 'state',
    account: b.account,
    previous: b.previous,
    representative: b.representative,
    balance: b.balance,
    link: b.link,
    link_as_account: b.link_as_account,
    work,
    signature: b.signature,
  };
  const r = await rpc(RPC, 'process', { json_block: 'true', block: wire });
  if (r.hash) return { ok: true, hash: r.hash, work };
  return { ok: false, stage: 'process', error: JSON.stringify(r).slice(0, 300) };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node nano_courier.mjs <signed-block.json>'); process.exit(1); }
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = await courierBlock(input);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
