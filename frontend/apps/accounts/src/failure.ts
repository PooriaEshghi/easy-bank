import type { ApiFailure, ApiResult } from "@easybank/api-client";

export function describeFailure(status: number, failure: ApiFailure): string {
  if (status === 401 || status === 403) {
    return `${status} · Permesso negato`;
  }
  switch (failure.kind) {
    case "response":
      return `${status} · ${failure.body.statusCode} ${failure.body.statusMsg}`;
    case "error":
      return `${status} · ${failure.body.errorMessage}`;
    case "validation":
      return `${status} · ${Object.entries(failure.body)
        .map(([field, message]) => `${field}: ${message}`)
        .join("; ")}`;
    case "empty":
      return `${status} · risposta vuota`;
    case "unknown":
      return `${status} · risposta non riconosciuta`;
  }
}

export function describeResult(result: ApiResult<unknown>): string {
  return result.ok ? "" : describeFailure(result.status, result.failure);
}

export function validationFields(result: ApiResult<unknown>): Record<string, string> {
  if (!result.ok && result.failure.kind === "validation") {
    return result.failure.body;
  }
  return {};
}
