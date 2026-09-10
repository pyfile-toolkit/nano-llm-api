// @pyfile-toolkit/agent-api — тонкий клиент для платного LLM+data API.
// Работает в любом Node 18+. Оплата: x402 (USDC на Base/Polygon/Arbitrum) или Lightning L402.
//
// Дизайн: SDK не держит приватных ключей. Он делает запрос, и если сервер отвечает
// 402 (payment required) — вызывает ваш onPaymentRequired(paymentRequiredObject) и
// ожидает, что вы вернёте заголовки для повтора. Если обработчик не задан, SDK
// бросает PaymentRequiredError с готовым paymentRequired (его можно оплатить вручную).

export const DEFAULT_BASE_URL = 'https://pyfile-agent.taile3ff35.ts.net';

export class PaymentRequiredError extends Error {
  constructor(paymentRequired, response) {
    super('Payment required (HTTP 402). Provide an onPaymentRequired handler or pay manually.');
    this.name = 'PaymentRequiredError';
    this.status = 402;
    this.paymentRequired = paymentRequired;
    this.response = response;
  }
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function decodePaymentRequired(headerValue) {
  if (!headerValue) return null;
  try {
    const padded = headerValue + '='.repeat((4 - (headerValue.length % 4)) % 4);
    const json = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return { raw: headerValue };
  }
}

export class AgentApi {
  /**
   * @param {object} [opts]
   * @param {string} [opts.baseUrl] Базовый URL API (без завершающего слэша).
   * @param {number} [opts.timeoutMs] Таймаут запроса (default 30000).
   * @param {(paymentRequired: object, request: object) => Promise<object>|object} [opts.onPaymentRequired]
   *        Обработчик 402: верните объект с заголовками для повтора, например
   *        { headers: { 'X-PAYMENT': '<signed>' } } или { headers: { 'X-Nano-Payment': '<blockhash>' } }.
   * @param {object} [opts.headers] Доп. заголовки для всех запросов.
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs || 30000;
    this.onPaymentRequired = opts.onPaymentRequired || null;
    this.headers = opts.headers || {};
  }

  /** Сырой запрос с автоматическим ретраем после оплаты. */
  async request(path, { method = 'GET', query, body, headers } = {}) {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const doFetch = async (extraHeaders = {}) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        return await fetch(url, {
          method,
          signal: ctrl.signal,
          headers: {
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...this.headers,
            ...headers,
            ...extraHeaders,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let res = await doFetch();
    if (res.status === 402) {
      const paymentRequired = decodePaymentRequired(res.headers.get('payment-required'));
      if (!this.onPaymentRequired) {
        throw new PaymentRequiredError(paymentRequired, res);
      }
      const reqCtx = { url: url.toString(), method, path, paymentRequired };
      const paid = await this.onPaymentRequired(paymentRequired, reqCtx);
      const extraHeaders = (paid && paid.headers) || {};
      res = await doFetch(extraHeaders);
      if (res.status === 402) {
        const pr2 = decodePaymentRequired(res.headers.get('payment-required'));
        throw new PaymentRequiredError(pr2, res);
      }
    }

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status, data);
    return data;
  }

  /** Бесплатно: список ресурсов и условия оплаты. */
  discovery() { return this.request('/.well-known/x402'); }

  /** Бесплатно: OpenAPI 3.1 спека. */
  openapi() { return this.request('/openapi.json'); }

  /** Бесплатно: цены. */
  price() { return this.request('/v1/price'); }

  /** Платно ($0.001): чат-комплит. */
  chat({ model = 'gemini-3.6-flash', messages, max_tokens } = {}) {
    if (!Array.isArray(messages) || !messages.length) {
      throw new Error('messages[] is required');
    }
    return this.request('/v1/chat/completions', {
      method: 'POST',
      body: { model, messages, ...(max_tokens ? { max_tokens } : {}) },
    });
  }

  /** Обобщённый вызов data-эндпоинта ($0.002): /data/<name>?<params>. */
  data(name, params = {}) {
    return this.request(`/data/${name}`, { query: params });
  }

  // --- Удобные обёртки над data-эндпоинтами ---
  dns(name, type = 'A')            { return this.data('dns', { name, type }); }
  crypto(ids = 'bitcoin,nano')     { return this.data('crypto', { ids }); }
  fx(base = 'USD')                 { return this.data('fx', { base }); }
  whois(domain)                    { return this.data('whois', { domain }); }
  wikipedia(title)                 { return this.data('wiki', { title }); }
  weather(lat, lon)                { return this.data('weather', { lat, lon }); }
  baseGas()                        { return this.data('gas/base'); }
  abi(selector)                    { return this.data('abi', { selector }); }
  walletBalance(address, chain = 'base') { return this.data('wallet/balance', { address, chain }); }
  bolt11Decode(invoice)            { return this.data('bolt11/decode', { invoice }); }
  btcFees()                        { return this.data('btc/fees'); }
  ipInfo(ip)                       { return this.data('ip', { ip }); }
}

export default AgentApi;
