import { test, expect, type Page } from "@playwright/test";
const fixture = "fixtures/coastal-synthetic.gpx";
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
}
async function synced(page: Page) {
  await expect
    .poll(
      async () =>
        (await page.getByTestId("map-marker").getAttribute("data-distance")) ===
        (await page
          .getByTestId("profile-marker")
          .getAttribute("data-distance")),
    )
    .toBe(true);
}
test("mapa ↔ perfil, fixação, zoom e controlo por teclado usam a mesma seleção", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole("status")).toContainText("GPX importado");
  const map = page.getByRole("img", {
      name: "Mapa interativo do percurso",
      exact: true,
    }),
    profile = page.getByRole("img", {
      name: "Perfil altimétrico interativo",
      exact: true,
    });
  const mb = await map.boundingBox(),
    pb = await profile.boundingBox();
  expect(Math.abs(mb!.width - pb!.width)).toBeLessThan(2);
  await map.scrollIntoViewIfNeeded();
  const p = await page
    .getByTestId("route-line")
    .evaluate((line: SVGPathElement) => {
      const p = line.getPointAtLength(line.getTotalLength() * 0.25),
        q = new DOMPoint(p.x, p.y).matrixTransform(line.getScreenCTM()!);
      return { x: q.x, y: q.y };
    });
  await page.mouse.move(p.x, p.y);
  await synced(page);
  await page.mouse.click(p.x, p.y);
  const fixed = await page
    .getByTestId("map-marker")
    .getAttribute("data-distance");
  await page.mouse.move(p.x + 30, p.y + 25);
  await expect(page.getByTestId("map-marker")).toHaveAttribute(
    "data-distance",
    fixed!,
  );
  await page
    .getByRole("button", { name: "Libertar seleção", exact: true })
    .click();
  await profile.hover({
    position: { x: pb!.width * 0.6, y: pb!.height * 0.5 },
  });
  await synced(page);
  expect(
    await page.getByTestId("map-marker").getAttribute("data-distance"),
  ).not.toBe(fixed);
  await page.getByRole("button", { name: "Aumentar zoom do mapa" }).click();
  const view = await map.getAttribute("viewBox");
  const slider = page.getByRole("slider", {
    name: "Posição no percurso",
    exact: true,
  });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("map-marker")).toHaveAttribute(
    "data-distance",
    "0.000",
  );
  await page.keyboard.press("End");
  await synced(page);
  await expect(map).toHaveAttribute("viewBox", view!);
});
test("cotas ausentes não viram zero; sobreposições permitem escolher outra passagem", async ({
  page,
}) => {
  await ready(page);
  const pt = (lat: number, lon: number, ele?: number) =>
    `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? "" : `<ele>${ele}</ele>`}</trkpt>`;
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles({
    name: "missing.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(
      `<gpx><trk><trkseg>${pt(0, 0) + pt(0, 0.001) + pt(0, 0.002)}</trkseg></trk></gpx>`,
    ),
  });
  await expect(
    page.getByText("Altitude indisponível neste GPX", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("position-readout")).toContainText(
    "Altitude indisponível",
  );
  await expect(
    page.getByText("Altimetria incompleta", { exact: true }),
  ).toBeVisible();
  const overlap = `<gpx><trk><trkseg>${pt(0, 0, 0) + pt(0, 0.002, 2) + pt(0.001, 0.002, 3) + pt(0.001, 0, 2) + pt(0, 0, 0) + pt(0, 0.002, 2)}</trkseg></trk></gpx>`;
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles({
    name: "loop.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(overlap),
  });
  await expect(page.getByTestId("position-readout")).toContainText(
    "Altitude processada 0 m",
  );
  await page
    .getByRole("img", { name: "Mapa interativo do percurso", exact: true })
    .scrollIntoViewIfNeeded();
  const pos = await page
    .getByTestId("route-line")
    .evaluate((line: SVGPathElement) => {
      const p = line.getPointAtLength(100),
        q = new DOMPoint(p.x, p.y).matrixTransform(line.getScreenCTM()!);
      return { x: q.x, y: q.y };
    });
  await page.mouse.move(pos.x, pos.y);
  await expect(
    page.getByText("Sobreposição: escolha o trecho", { exact: true }),
  ).toBeVisible();
  await page.mouse.click(pos.x, pos.y);
  await expect(
    page.getByRole("button", { name: "Libertar seleção", exact: true }),
  ).toBeVisible();
  const first = Number(
    await page.getByTestId("map-marker").getAttribute("data-distance"),
  );
  await page.locator(".alternatives button").last().click();
  await expect
    .poll(async () =>
      Number(
        await page.getByTestId("map-marker").getAttribute("data-distance"),
      ),
    )
    .toBeGreaterThan(first + 100);
});
test("backup v2 transfere planos e resultados entre contextos sem sobrescrever registos locais", async ({
  page,
  browser,
}) => {
  await ready(page);
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole("status")).toContainText("GPX importado");
  await page.getByLabel("Nome do plano", { exact: true }).fill("Origem");
  await page
    .getByRole("button", { name: "Guardar plano", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Os meus passeios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir passeio Origem", exact: true })
    .click();
  await page
    .getByLabel("Bateria final observada · %", { exact: true })
    .fill("70");
  await page
    .getByRole("button", { name: "Guardar resultado real", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A minha bicicleta", exact: true })
    .click();
  await page.getByLabel("Massa do ciclista · kg", { exact: true }).fill("85");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar backup completo", exact: true })
    .click();
  const path = await (await event).path();
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
    }),
    target = await context.newPage();
  try {
    await ready(target);
    await target.getByLabel("Nome do plano", { exact: true }).fill("Local");
    await target
      .getByRole("button", { name: "Guardar plano", exact: true })
      .click();
    await target
      .getByRole("button", { name: "A minha bicicleta", exact: true })
      .click();
    await target
      .getByLabel("Massa do ciclista · kg", { exact: true })
      .fill("95");
    await target
      .getByLabel("Selecionar backup", { exact: true })
      .setInputFiles(path!);
    await target
      .getByRole("button", { name: "Restaurar backup", exact: true })
      .click();
    await expect(target.getByRole("status")).toContainText("Backup restaurado");
    await expect(
      target.getByLabel("Massa do ciclista · kg", { exact: true }),
    ).toHaveValue("95");
    await target
      .getByLabel("Selecionar backup", { exact: true })
      .setInputFiles(path!);
    await target
      .getByLabel(
        "Restaurar também definições e sessão (substitui as atuais)",
        { exact: true },
      )
      .check();
    await target
      .getByRole("button", { name: "Restaurar backup", exact: true })
      .click();
    await expect(
      target.getByLabel("Massa do ciclista · kg", { exact: true }),
    ).toHaveValue("85");
    await target
      .getByRole("button", { name: "Os meus passeios", exact: true })
      .click();
    await expect(target.locator(".journey-card")).toHaveCount(2);
    await target
      .getByRole("button", { name: "Abrir passeio Origem", exact: true })
      .click();
    await expect(
      target
        .locator(".journey-detail .comparison-grid>div")
        .nth(2)
        .locator("strong"),
    ).toHaveText("70%");
  } finally {
    await context.close();
  }
});
test("PWA prepara também o worker para importação e reabertura sem Internet", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole("status")).toContainText("GPX importado");
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("map-marker")).toBeVisible();
  await synced(page);
  await context.setOffline(false);
});
test("GPX com 50 mil pontos usa worker, não recalcula em hover e uma importação antiga não vence a nova", async ({
  page,
}) => {
  test.setTimeout(60000);
  await ready(page);
  const xml = `<gpx><trk><name>GPX grande de teste</name><trkseg>${Array.from({ length: 50000 }, (_, i) => `<trkpt lat="${(i * 0.0001).toFixed(5)}" lon="0"><ele>${(100 + i * 0.001).toFixed(3)}</ele></trkpt>`).join("")}</trkseg></trk></gpx>`,
    file = {
      name: "large.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(xml),
    };
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles(file);
  await page
    .getByRole("button", { name: "A minha bicicleta", exact: true })
    .click({ timeout: 2000 });
  await page.getByRole("button", { name: "Planear", exact: true }).click();
  await expect(page.locator(".route-heading h2")).toHaveText(
    "GPX grande de teste",
    { timeout: 30000 },
  );
  await expect(
    page.getByText("Sessão guardada", { exact: true }),
  ).toBeVisible();
  const count = await page.evaluate(
      () => performance.getEntriesByName("bosch-range:simulate").length,
    ),
    box = await page
      .getByRole("img", { name: "Perfil altimétrico interativo", exact: true })
      .boundingBox();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(
      box!.x + (box!.width * i) / 14,
      box!.y + box!.height / 2,
    );
  await synced(page);
  expect(
    await page.evaluate(
      () => performance.getEntriesByName("bosch-range:simulate").length,
    ),
  ).toBe(count);
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles(file);
  await page.getByLabel("Importar GPX", { exact: true }).setInputFiles(fixture);
  await expect(page.locator(".route-heading h2")).toHaveText(
    "Percurso sintético — não é um passeio real",
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);
  await expect(page.locator(".route-heading h2")).toHaveText(
    "Percurso sintético — não é um passeio real",
  );
});
