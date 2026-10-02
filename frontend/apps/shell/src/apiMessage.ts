import type { ApiFailure } from "@easybank/api-client";

export function describeFailure(status: number, failure: ApiFailure): string {
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
