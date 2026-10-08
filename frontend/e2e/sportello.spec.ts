import { expect, test } from "@playwright/test";

// La stack (gateway, Keycloak, frontend) non è nel runner. In CI il job resta spento
// finché la variabile di repository EASYBANK_E2E non è true. In locale: EASYBANK_E2E=1 pnpm test:e2e
test.skip(process.env.EASYBANK_E2E !== "1", "Stack locale non disponibile nel runner");

test("sportello crea cliente, carta e prestito, poi aggiorna ed elimina la carta", async ({ page }) => {
  const mobile = `4${String(Date.now()).slice(-9)}`;

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Entra" })).toBeEnabled();
  await page.getByRole("button", { name: "Entra" }).click();
  await page.locator("#username").fill("sportello");
  await page.locator("#password").fill("easybank");
  await page.locator("#kc-login").click();
  await expect(page.getByText("sportello")).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { __easybank?: number }).__easybank = 1;
  });

  await page.getByRole("link", { name: "Nuovo cliente" }).click();
  await page.getByRole("textbox", { name: /^Nome/ }).fill("Cliente Fase Otto");
  await page.getByRole("textbox", { name: /^Email/ }).fill("fase8@easybank.test");
  await page.getByRole("textbox", { name: /^Cellulare/ }).fill(mobile);
  await page.getByRole("button", { name: "Crea cliente" }).click();

  await expect(page.getByRole("heading", { name: `Cliente ${mobile}` })).toBeVisible();
  await expect(page.getByText("Savings")).toBeVisible();

  const cards = page.locator("#remote-cards");
  const loans = page.locator("#remote-loans");
  await cards.getByRole("button", { name: "Crea carta" }).click();
  await expect(cards.getByText("Carta creata")).toBeVisible();
  await loans.getByRole("button", { name: "Crea prestito" }).click();
  await expect(loans.getByText("Prestito creato")).toBeVisible();

  await cards.getByRole("textbox", { name: /^Utilizzato/ }).fill("1000");
  await expect(cards.getByRole("textbox", { name: /^Disponibile/ })).toHaveValue("99000");
  await cards.getByRole("button", { name: "Salva" }).click();
  await expect(cards.getByText("Richiesta completata")).toBeVisible();

  await cards.getByRole("button", { name: "Elimina" }).click();
  await cards.getByRole("button", { name: "Conferma eliminazione" }).click();
  await expect(cards.getByText("Carta assente")).toBeVisible();
  await expect(loans.getByText("Prestito creato")).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __easybank?: number }).__easybank)).toBe(1);
});
