import type { DomainEvent, ErrorResponseDto, ResponseDto } from "@easybank/contracts";

export const CORRELATION_HEADER = "eazybank-correlation-id";

export type CustomerChanged = {
  mobileNumber: string;
  eventType: string;
  correlationId: string | null;
};

type CustomerChangedListener = (event: CustomerChanged) => void;

const listeners = new Set<CustomerChangedListener>();

export function publishCustomerChanged(event: CustomerChanged): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeCustomerChanged(listener: CustomerChangedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createCorrelationId(): string {
  return crypto.randomUUID();
}

export type ApiFailure =
  | { kind: "response"; body: ResponseDto }
  | { kind: "error"; body: ErrorResponseDto }
  | { kind: "validation"; body: Record<string, string> }
  | { kind: "empty" }
  | { kind: "unknown"; body: unknown };

export type ApiResult<T> =
  | {
      ok: true;
      status: number;
      correlationId: string;
      data: T | null;
    }
  | {
      ok: false;
      status: number;
      correlationId: string;
      failure: ApiFailure;
    };

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  correlationId?: string;
  signal?: AbortSignal;
};

export type ApiClient = {
  request: <T>(path: string, options?: RequestOptions) => Promise<ApiResult<T>>;
};

export function createApiClient(config: {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
}): ApiClient {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
      const sentCorrelationId = options.correlationId ?? createCorrelationId();
      const headers = new Headers({
        Accept: "application/json",
        [CORRELATION_HEADER]: sentCorrelationId,
      });
      const accessToken = config.getAccessToken?.();
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
      let body: string | undefined;
      if (options.body !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(options.body);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: options.signal,
      });
      const echoed = response.headers.get(CORRELATION_HEADER);
      const correlationId = echoed && echoed.length > 0 ? echoed : sentCorrelationId;
      const parsed = parseBody(await response.text());
      const responseDto = asResponseDto(parsed);

      // 417 usa ResponseDto: il salvataggio non c'è stato, non è un ErrorResponseDto.
      if (response.ok && !(responseDto && responseDto.statusCode === "417")) {
        return {
          ok: true,
          status: response.status,
          correlationId,
          data: (parsed ?? null) as T | null,
        };
      }

      return {
        ok: false,
        status: response.status,
        correlationId,
        failure: classifyFailure(parsed, responseDto),
      };
    },
  };
}

function parseBody(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asResponseDto(value: unknown): ResponseDto | null {
  if (!isRecord(value) || typeof value.statusCode !== "string" || typeof value.statusMsg !== "string") {
    return null;
  }
  return { statusCode: value.statusCode, statusMsg: value.statusMsg };
}

function asErrorResponseDto(value: unknown): ErrorResponseDto | null {
  if (!isRecord(value) || typeof value.apiPath !== "string" || typeof value.errorMessage !== "string") {
    return null;
  }
  if (!("errorCode" in value) || !("errorTime" in value)) {
    return null;
  }
  return {
    apiPath: value.apiPath,
    errorCode: asText(value.errorCode),
    errorMessage: value.errorMessage,
    errorTime: asText(value.errorTime),
  };
}

function asValidationMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([, item]) => typeof item !== "string")) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

function classifyFailure(parsed: unknown, responseDto: ResponseDto | null): ApiFailure {
  if (parsed === null) {
    return { kind: "empty" };
  }
  if (responseDto) {
    return { kind: "response", body: responseDto };
  }
  const error = asErrorResponseDto(parsed);
  if (error) {
    return { kind: "error", body: error };
  }
  const validation = asValidationMap(parsed);
  if (validation) {
    return { kind: "validation", body: validation };
  }
  return { kind: "unknown", body: parsed };
}

const STATUS_LABELS: Record<string, string> = {
  "Account created successfully": "Cliente creato",
  "Card created successfully": "Carta creata",
  "Loan created successfully": "Prestito creato",
  "Request processed successfully": "Richiesta completata",
  "Update operation failed. Please try again or contact Dev team": "Aggiornamento non riuscito",
  "Delete operation failed. Please try again or contact Dev team": "Eliminazione non riuscita",
};

export function describeStatus(body: ResponseDto): string {
  const label = STATUS_LABELS[body.statusMsg];
  return label ? `${body.statusCode} · ${label} · ${body.statusMsg}` : `${body.statusCode} · ${body.statusMsg}`;
}

export function describeFailure(status: number, failure: ApiFailure): string {
  if (status === 401 || status === 403) {
    return `${status} · Permesso negato`;
  }
  switch (failure.kind) {
    case "response":
      return describeStatus(failure.body);
    case "error":
      return status >= 500
        ? `${status} · Errore del servizio · ${failure.body.errorMessage}`
        : `${status} · ${failure.body.errorMessage}`;
    case "validation":
      return `${status} · ${Object.entries(failure.body)
        .map(([field, message]) => `${field}: ${message}`)
        .join("; ")}`;
    case "empty":
      return `${status} · risposta vuota`;
    case "unknown":
      return status >= 500 ? `${status} · Errore del servizio · risposta non riconosciuta` : `${status} · risposta non riconosciuta`;
  }
}

export async function* subscribeCustomerEvents(
  baseUrl: string,
  mobileNumber: string,
  accessToken: string,
  signal: AbortSignal,
): AsyncGenerator<DomainEvent> {
  const correlationId = createCorrelationId();
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/eazybank/events/stream?mobileNumber=${encodeURIComponent(mobileNumber)}`,
    {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        [CORRELATION_HEADER]: correlationId,
      },
      signal,
    },
  );
  if (!response.ok || response.body == null) {
    throw new Error(`Event stream failed with status ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data.length > 0) {
        yield JSON.parse(data) as DomainEvent;
      }
    }
  }
}
