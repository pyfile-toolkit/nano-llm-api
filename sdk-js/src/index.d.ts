export type PaymentRequiredHandler = (
  paymentRequired: Record<string, unknown>,
  request: { url: string; method: string; path: string; paymentRequired: Record<string, unknown> }
) => Promise<{ headers?: Record<string, string> }> | { headers?: Record<string, string> };

export interface AgentApiOptions {
  baseUrl?: string;
  timeoutMs?: number;
  onPaymentRequired?: PaymentRequiredHandler;
  headers?: Record<string, string>;
}

export class PaymentRequiredError extends Error {
  status: 402;
  paymentRequired: Record<string, unknown>;
  response: Response;
}
export class ApiError extends Error {
  status: number;
  body: unknown;
}

export class AgentApi {
  constructor(opts?: AgentApiOptions);
  baseUrl: string;
  request(path: string, opts?: { method?: string; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> }): Promise<any>;
  discovery(): Promise<any>;
  openapi(): Promise<any>;
  price(): Promise<any>;
  chat(args: { model?: string; messages: Array<{ role: string; content: string }>; max_tokens?: number }): Promise<any>;
  data(name: string, params?: Record<string, unknown>): Promise<any>;
  dns(name: string, type?: string): Promise<any>;
  crypto(ids?: string): Promise<any>;
  fx(base?: string): Promise<any>;
  whois(domain: string): Promise<any>;
  wikipedia(title: string): Promise<any>;
  weather(lat: number | string, lon: number | string): Promise<any>;
  baseGas(): Promise<any>;
  abi(selector: string): Promise<any>;
  walletBalance(address: string, chain?: string): Promise<any>;
  bolt11Decode(invoice: string): Promise<any>;
  btcFees(): Promise<any>;
  ipInfo(ip: string): Promise<any>;
}

export default AgentApi;
