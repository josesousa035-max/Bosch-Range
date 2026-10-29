import { test, expect } from "@playwright/test";
test("bundle desktop sem service worker mantém GPX, planos e resultados", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4174/") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Importar GPX", { exact: true })
    .setInputFiles("fixtures/coastal-synthetic.gpx");
  await expect(page.getByRole("status")).toContainText("GPX importado");
  await page.getByLabel("Nome do plano", { exact: true }).fill("Plano desktop");
  await page
    .getByRole("button", { name: "Guardar plano", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Os meus passeios", exact: true })
    .click();
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Abrir passeio Plano desktop", exact: true })
    .click();
  await page
    .getByLabel("Bateria final observada · %", { exact: true })
    .fill("60");
  await page
    .getByRole("button", { name: "Guardar resultado real", exact: true })
    .click();
  await expect(page.locator(".journey-card .state-badge")).toHaveText(
    "Concluído",
  );
  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
  ).toBe(0);
  expect(external).toEqual([]);
});
