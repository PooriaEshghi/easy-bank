import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CardsApp from "./App";

const mobileNumber = "4356700001";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("rifiuta un disponibile incoerente e invia l'aggiornamento solo se torna il plafond meno l'utilizzato", async () => {
  const calls: string[] = [];
  const updates: unknown[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (method === "PUT") {
      updates.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ statusCode: "200", statusMsg: "Request processed successfully" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        mobileNumber,
        cardNumber: "100305134327",
        cardType: "Credit Card",
        totalLimit: 100000,
        amountUsed: 0,
        availableAmount: 100000,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  render(
    <CardsApp
      mobileNumber={mobileNumber}
      roles={["CARDS"]}
      authReady
      refreshSession={() => Promise.resolve()}
    />,
  );

  const used = await screen.findByRole("textbox", { name: /^Utilizzato/ });
  fireEvent.change(used, { target: { value: "1000" } });
  const available = screen.getByRole("textbox", { name: /^Disponibile/ }) as HTMLInputElement;
  expect(available.value).toBe("99000");

  fireEvent.change(available, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));

  expect(screen.getByRole("alert").textContent).toBe(
    "Il disponibile deve essere il plafond meno l'utilizzato.",
  );
  expect(updates).toEqual([]);

  fireEvent.change(screen.getByRole("textbox", { name: /^Disponibile/ }), { target: { value: "99000" } });
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));

  expect(await screen.findByText(/Richiesta completata/)).toBeTruthy();
  expect(calls.filter((call) => call.startsWith("PUT"))).toEqual([
    "PUT http://localhost:8072/eazybank/cards/api/update",
  ]);
  expect(updates).toEqual([
    {
      mobileNumber,
      cardNumber: "100305134327",
      cardType: "Credit Card",
      totalLimit: 100000,
      amountUsed: 1000,
      availableAmount: 99000,
    },
  ]);
});
