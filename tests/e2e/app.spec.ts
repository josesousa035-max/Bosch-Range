import { test, expect } from "@playwright/test";
const fixture = "fixtures/coastal-synthetic.gpx";
async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
}
test("fluxo manual completo guarda snapshot, conclui e preserva previsão após mudar a bicicleta", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(4);
  await page
    .getByLabel("Nome do plano", { exact: true })
    .fill("Volta de regressão");
  const predicted = await page
    .locator(".forecast-summary>div")
    .first()
    .locator("strong")
    .innerText();
  await page
    .getByRole("button", { name: "Guardar plano", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Plano guardado");
  await page
    .getByRole("button", { name: "Os meus passeios", exact: true })
    .click();
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Abrir passeio Volta de regressão",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Abrir passeio Volta de regressão",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Bateria final observada · %", { exact: true })
    .fill("27");
  await page
    .getByRole("button", { name: "Guardar resultado real", exact: true })
    .click();
  await expect(page.locator(".journey-card .state-badge")).toHaveText(
    "Concluído",
  );
  await expect(
    page
      .locator(".journey-detail .comparison-grid>div")
      .nth(1)
      .locator("strong"),
  ).toHaveText(predicted);
  await expect(
    page.getByText("Previsão otimista", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "A minha bicicleta", exact: true })
    .click();
  await page
    .getByLabel("Capacidade nominal principal · Wh", { exact: true })
    .fill("1000");
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Os meus passeios", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Abrir passeio Volta de regressão",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".journey-detail .comparison-grid>div")
      .nth(1)
      .locator("strong"),
  ).toHaveText(predicted);
  await expect(page.getByText(/nominal principal 800 Wh/)).toBeVisible();
  await page
    .getByRole("button", { name: "Duplicar plano", exact: true })
    .click();
  await expect(page.locator(".journey-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  await expect(page.getByText(/Amostra ainda pequena/)).toBeVisible();
  expect(errors).toEqual([]);
});
test("formulários inválidos não guardam plano e GPX inválido preserva o anterior", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Distância · km", { exact: true }).fill("0");
  await expect(
    page.getByRole("button", { name: "Guardar plano", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Distância · km", { exact: true }).fill("40");
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole("status")).toContainText("GPX importado");
  const title = await page.locator(".route-heading h2").innerText();
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles({
    name: "invalid.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from("<gpx>"),
  });
  await expect(page.getByRole("alert")).toContainText("inválido");
  await expect(page.locator(".route-heading h2")).toHaveText(title);
});
test("fluxo completo em 390 px com toque no mapa, perfil e teclado", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  try {
    await open(page);
    await page
      .getByLabel("Importar GPX", { exact: true })
      .setInputFiles(fixture);
    await expect(page.getByRole("status")).toContainText("GPX importado");
    const profile = page.getByRole("img", {
      name: "Perfil altimétrico interativo",
      exact: true,
    });
    await profile.scrollIntoViewIfNeeded();
    const box = await profile.boundingBox();
    await page.touchscreen.tap(
      box!.x + box!.width * 0.55,
      box!.y + box!.height * 0.5,
    );
    await expect(page.getByTestId("map-marker")).not.toHaveAttribute(
      "data-distance",
      "0.000",
    );
    await expect
      .poll(
        async () =>
          (await page
            .getByTestId("map-marker")
            .getAttribute("data-distance")) ===
          (await page
            .getByTestId("profile-marker")
            .getAttribute("data-distance")),
      )
      .toBe(true);
    const slider = page.getByRole("slider", {
      name: "Posição no percurso",
      exact: true,
    });
    await slider.focus();
    await page.keyboard.press("End");
    await expect(page.getByTestId("position-readout")).toContainText(
      "Altitude processada 10 m",
    );
    const point = await page
      .getByTestId("route-line")
      .evaluate((line: SVGPathElement) => {
        const p = line.getPointAtLength(line.getTotalLength() * 0.3),
          q = new DOMPoint(p.x, p.y).matrixTransform(line.getScreenCTM()!);
        return { x: q.x, y: q.y };
      });
    await page
      .getByRole("img", { name: "Mapa interativo do percurso", exact: true })
      .scrollIntoViewIfNeeded();
    const adjusted = await page
      .getByTestId("route-line")
      .evaluate((line: SVGPathElement) => {
        const p = line.getPointAtLength(line.getTotalLength() * 0.3),
          q = new DOMPoint(p.x, p.y).matrixTransform(line.getScreenCTM()!);
        return { x: q.x, y: q.y };
      });
    await page.touchscreen.tap(adjusted.x, adjusted.y);
    await page
      .getByLabel("Nome do plano", { exact: true })
      .fill("Passeio móvel");
    await page
      .getByRole("button", { name: "Guardar plano", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Os meus passeios", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abrir passeio Passeio móvel", exact: true })
      .click();
    await page
      .getByLabel("Bateria final observada · %", { exact: true })
      .fill("50");
    await page
      .getByRole("button", { name: "Guardar resultado real", exact: true })
      .click();
    await expect(page.locator(".journey-card .state-badge")).toHaveText(
      "Concluído",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
test("comparação A/B, etapas, preferências e tema persistem", async ({
  page,
}) => {
  await open(page);
  await page.getByText("Comparação A/B e cenários", { exact: true }).click();
  await page
    .getByLabel("Modo do cenário B", { exact: true })
    .selectOption("Turbo");
  await expect(
    page.getByText("Cenário B · Turbo", { exact: true }),
  ).toBeVisible();
  await page.getByText("Viagem por etapas", { exact: true }).click();
  await expect(page.getByText("Etapa 1", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "A minha bicicleta", exact: true })
    .click();
  await page.getByLabel("Massa do ciclista · kg", { exact: true }).fill("86");
  await page.locator(".theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Massa do ciclista · kg", { exact: true }),
  ).toHaveValue("86");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
