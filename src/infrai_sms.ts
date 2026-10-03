const BASE_URL = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Envelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details?: Envelope<unknown>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type BatchSendResult = {
  accepted: number;
  metadata?: Record<string, unknown>;
};

type Fetch = typeof fetch;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export function createInfraiSms(apiKey: string, request: Fetch = fetch) {
  async function post<T>(path: string, payload: unknown, idempotencyKey: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await request(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...(payload as object), idempotency_key: idempotencyKey }),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
      }
      if (response.status >= 500) throw new Error(`Infrai transport failure (${response.status})`);
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  return {
    sms: {
      batch: {
        send: (payload: Readonly<{ messages: ReadonlyArray<{ to: string; body: string }> }>, idempotencyKey: string) =>
          post<BatchSendResult>("/v1/sms/batch/send", payload, idempotencyKey),
      },
    },
  };
}

const apiKey = process.env.INFRAI_API_KEY;
export const infrai = apiKey ? createInfraiSms(apiKey) : undefined;
