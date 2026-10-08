import { afterEach, describe, expect, it, vi } from "vitest";
import { CORRELATION_HEADER, createApiClient } from "./index";

const baseUrl = "http://gateway.test";

afterEach(() => {
  vi.unstubAllGlobals();
});

function client() {
  return createApiClient({ baseUrl, getAccessToken: () => "token-1" });
}

describe("createApiClient", () => {
  it("accetta ResponseDto e usa il correlation id restituito dal gateway", async () => {
    const seen = new Headers();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://gateway.test/eazybank/accounts/api/create");
      new Headers(init?.headers).forEach((value, key) => seen.set(key, value));
      return new Response(
        JSON.stringify({ statusCode: "201", statusMsg: "Account created successfully" }),
        {
          status: 201,
          headers: { "Content-Type": "application/json", [CORRELATION_HEADER]: "dal-gateway" },
        },
      );
    });

    const result = await client().request("/eazybank/accounts/api/create", {
      method: "POST",
      body: { name: "Cliente Fase Otto", email: "fase8@easybank.test", mobileNumber: "4356700001" },
      correlationId: "dal-client",
    });

    expect(seen.get(CORRELATION_HEADER)).toBe("dal-client");
    expect(seen.get("Authorization")).toBe("Bearer token-1");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.status).toBe(201);
    expect(result.correlationId).toBe("dal-gateway");
    expect(result.data).toEqual({ statusCode: "201", statusMsg: "Account created successfully" });
  });

  it("tratta il ResponseDto 417 come esito negativo anche con HTTP 200", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(url).toBe("http://gateway.test/eazybank/accounts/api/update");
      return new Response(
        JSON.stringify({
          statusCode: "417",
          statusMsg: "Update operation failed. Please try again or contact Dev team",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client().request("/eazybank/accounts/api/update", {
      method: "PUT",
      correlationId: "update-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(200);
    expect(result.correlationId).toBe("update-1");
    expect(result.failure).toEqual({
      kind: "response",
      body: {
        statusCode: "417",
        statusMsg: "Update operation failed. Please try again or contact Dev team",
      },
    });
  });

  it("legge ErrorResponseDto e conserva il correlation id inviato se il gateway non lo riecheggia", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://gateway.test/eazybank/accounts/api/create");
      expect(new Headers(init?.headers).get(CORRELATION_HEADER)).toBe("gia-registrato");
      return new Response(
        JSON.stringify({
          apiPath: "uri=/api/create",
          errorCode: "400 BAD_REQUEST",
          errorMessage: "Customer already registered with given mobileNumber 3284489754",
          errorTime: "2026-10-06T12:43:55",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client().request("/eazybank/accounts/api/create", {
      method: "POST",
      correlationId: "gia-registrato",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(400);
    expect(result.correlationId).toBe("gia-registrato");
    expect(result.failure.kind).toBe("error");
    if (result.failure.kind !== "error") {
      return;
    }
    expect(result.failure.body.errorMessage).toBe(
      "Customer already registered with given mobileNumber 3284489754",
    );
  });
});
