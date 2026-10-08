import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AccountsApp from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("blocca nome, email e cellulare prima del gateway e invia solo il cliente valido", async () => {
  const calls: string[] = [];
  const onCreated = vi.fn();
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return new Response(
      JSON.stringify({ statusCode: "201", statusMsg: "Account created successfully" }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });

  render(
    <AccountsApp
      mode="create"
      roles={["ACCOUNTS"]}
      authReady
      refreshSession={() => Promise.resolve()}
      onCreated={onCreated}
    />,
  );

  fireEvent.change(screen.getByRole("textbox", { name: /^Nome/ }), { target: { value: "Ada" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "non-valida" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^Cellulare/ }), { target: { value: "12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Crea cliente" }));

  expect(screen.getByText("Il nome deve avere tra 5 e 30 caratteri.")).toBeTruthy();
  expect(screen.getByText("L'email non è valida.")).toBeTruthy();
  expect(screen.getByText("Il cellulare deve avere 10 cifre.")).toBeTruthy();
  expect(calls).toEqual([]);

  fireEvent.change(screen.getByRole("textbox", { name: /^Nome/ }), { target: { value: "Cliente Fase Otto" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "fase8@easybank.test" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^Cellulare/ }), { target: { value: "4356700001" } });
  fireEvent.click(screen.getByRole("button", { name: "Crea cliente" }));

  expect(await screen.findByText(/Cliente creato/)).toBeTruthy();
  expect(calls).toEqual(["POST http://localhost:8072/eazybank/accounts/api/create"]);
  expect(onCreated).toHaveBeenCalledWith("4356700001");
});
