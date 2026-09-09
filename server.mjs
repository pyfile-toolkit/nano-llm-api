// Платный LLM API за Nano (nano:mainnet, HTTP 402).
// Путь X-Nano-Payment: buyer шлёт 0.001 XNO, ретраит с X-Nano-Payment: <send block hash>.
// Верификация через pursekeeper /v1/verify (для продавцов без своего Nano-нода).
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VAULT = path.join(process.cwd(), 'vault');
const wallet = JSON.parse(fs.readFileSync(path.join(VAULT, 'nano_wallet.json'), 'utf8'));
const frellmapiKey = fs.readFileSync(path.join(VAULT, 'frellmapi_key.txt'), 'utf8').trim();

const NANO_ADDRESS = wallet.address;
const PRICE_RAW = '1000000000000000000000000000'; // 0.001 XNO = 1e27 raw
const PRICE_NANO = '0.001';
const FRELLMAPI = 'http://localhost:3001/v1/chat/completions';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Персистентный журнал подтверждённых платежей (hash -> {paid_at, amount}).
// Файл в vault — переживает рестарты сервера. Без этого /v1/credit забывал бы оплату после перезапуска.
const PAID_LOG_PATH = path.join(VAULT, 'nano_paid_hashes.json');
function loadPaid() {
  try {
    return JSON.parse(fs.readFileSync(PAID_LOG_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function savePaid(map) {
  fs.writeFileSync(PAID_LOG_PATH, JSON.stringify(map, null, 2));
}
const paidHashes = loadPaid();

// Верификация Nano-платежа через pursekeeper.dev (продавцам без своего нода)
async function verifyNanoPayment(hash) {
  try {
    const r = await fetch(
      `https://pursekeeper.dev/v1/verify?hash=${encodeURIComponent(hash)}&to=${encodeURIComponent(NANO_ADDRESS)}&min_nano=${PRICE_NANO}`,
      { timeout: 15000 }
    );
    if (!r.ok) return { ok: false, reason: 'verify_http_' + r.status };
    const j = await r.json();
    return { ok: j.ok === true, reason: j.ok ? 'verified' : (j.reason || 'not_found') };
  } catch (e) {
    return { ok: false, reason: 'verify_err_' + e.message };
  }
}

// Quote: sha256 тела запроса — цена привязана к конкретному запросу
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

app.get('/v1/price', (_req, res) => {
  res.json({
    pay_to: NANO_ADDRESS,
    price_raw: PRICE_RAW,
    price_nano: PRICE_NANO,
    asset: 'XNO',
    network: 'nano:mainnet',
    scheme: 'exact',
  });
});

app.get('/health', (_req, res) => res.json({ ok: true, address: NANO_ADDRESS }));

// Статус оплаты: pursekeeper проверяет "status URL showed paid"
app.get('/v1/credit', (req, res) => {
  const h = (req.query.hash || '').toString().toLowerCase();
  if (!h) return res.status(400).json({ error: 'hash is required' });
  const rec = paidHashes[h];
  res.json(rec ? { hash: h, status: 'paid', ...rec } : { hash: h, status: 'unpaid' });
});

app.get('/v1/status', (req, res) => {
  const h = (req.query.hash || req.query.payment || '').toString().toLowerCase();
  if (!h) return res.status(400).json({ error: 'hash is required' });
  const rec = paidHashes[h];
  res.json(rec ? { status: 'paid', ...rec } : { status: 'unpaid' });
});

// LLM endpoint — платный
app.post('/v1/chat/completions', async (req, res) => {
  const payment = req.header('X-Nano-Payment');
  const bodyStr = JSON.stringify(req.body || {});

  function paymentRequired() {
    const quote = sha256(bodyStr);
    const payload = {
      pay_to: NANO_ADDRESS,
      price_raw: PRICE_RAW,
      price_nano: PRICE_NANO,
      asset: 'XNO',
      network: 'nano:mainnet',
      scheme: 'exact',
      quote,
      request_sha256: quote,
      detail: `Send ${PRICE_NANO} XNO to pay_to, retry with X-Nano-Payment: <send block hash>`,
    };
    res.status(402);
    res.set('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(payload)).toString('base64'));
    res.json({ type: 'payment_required', ...payload });
  }

  if (!payment) {
    return paymentRequired();
  }

  const h = payment.trim().toLowerCase();

  // Replay-защита: один send block hash = один вызов. До этого фикса один и тот же
  // hash проходил верификацию повторно и покупал ещё один вызов (отметил pursekeeper).
  if (paidHashes[h]) {
    return res.status(402).json({
      type: 'payment_reused',
      detail: 'This send block hash was already consumed.',
      pay_to: NANO_ADDRESS,
      price_nano: PRICE_NANO,
    });
  }

  // Проверить платеж: hash блока должен быть подтверждённым send на наш адрес
  const v = await verifyNanoPayment(h);
  if (!v.ok) {
    res.status(402).json({
      type: 'payment_invalid',
      detail: 'Payment not verified: ' + v.reason,
      pay_to: NANO_ADDRESS,
      price_nano: PRICE_NANO,
    });
    return;
  }

  // Платёж подтверждён — сохраняем персистентно и отдаём LLM-ответ
  paidHashes[h] = { paid_at: new Date().toISOString(), amount_nano: PRICE_NANO };
  savePaid(paidHashes);
  const body = req.body || {};
  const messages = body.messages || [{ role: 'user', content: body.prompt || 'hi' }];
  const model = body.model || 'gemini-3.6-flash';

  try {
    const r = await fetch(FRELLMAPI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + frellmapiKey },
      body: JSON.stringify({ model, messages }),
    });
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content || JSON.stringify(j);
    res.json({
      model,
      content: text,
      status: 'paid',
      payment,
      price_nano: PRICE_NANO,
    });
  } catch (e) {
    res.status(502).json({ error: 'upstream: ' + e.message });
  }
});

const PORT = 3003;
app.listen(PORT, () => console.log(`nano LLM API on :${PORT}, address ${NANO_ADDRESS}`));
