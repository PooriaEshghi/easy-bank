import { describeFailure, type ApiResult } from "@easybank/api-client";

export function describeResult(result: ApiResult<unknown>): string {
  return result.ok ? "" : describeFailure(result.status, result.failure);
}

export function validationFields(result: ApiResult<unknown>): Record<string, string> {
  if (!result.ok && result.failure.kind === "validation") {
    return result.failure.body;
  }
  return {};
}
