import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { defaults, manualRoute, simulate } from "../src/core/model";
import {
  openDatabase,
  saveWorkspace,
  getWorkspace,
  getSettings,
  saveActivity,
  listActivities,
  saveAdjustment,
  adjustments,
  saveSimulation,
  listSimulations,
  saveRoute,
  listRoutes,
  renameRoute,
  deleteRoute,
  type Activity,
} from "../src/core/storage";
import {
  createBackup,
  parseBackup,
  restoreBackup,
  MAX_BACKUP_BYTES,
  type Backup,
} from "../src/core/backup";
import {
  validateRoute,
  validateWorkspace,
  routeIdentity,
  routeHash,
  type Workspace,
} from "../src/core/workspace";
const route = manualRoute(10, 200, "compactado");
const workspace: Workspace = {
  tab: "Planeador GPX",
  distance: 10,
  ascent: 200,
  gpx: route,
  useGpx: true,
  days: 2,
  recharge: false,
  stageSoc: { 0: 60 },
  activity: {
    name: "Rascunho",
    date: "2026-10-27",
    durationH: 1,
    startSoc: 80,
    endSoc: 50,
    measuredWh: 0,
    notes: "Ainda não concluído",
  },
  dark: true,
  advanced: true,
};
function activity(): Activity {
  const p = simulate(route, defaults),
    auxWh = p.hours * defaults.auxiliaryW;
  return {
    id: "ride-1",
    date: "2026-10-27",
    name: "Teste sintético",
    distanceKm: 10,
    ascentM: 200,
    durationH: p.hours,
    startSoc: 100,
    endSoc: 50,
    observedWh: 100,
    measuredWh: 100,
    predictedWh: p.requiredWh,
    motorInputWh: p.requiredWh - auxWh,
    auxWh,
    source: "medido",
    settings: { ...defaults },
    route,
    notes: "",
    createdAt: "2026-10-27T00:00:00Z",
  };
}
beforeEach(async () => {
  const d = await openDatabase(),
    tx = d.transaction(
      ["settings", "activities", "routes", "adjustments"],
      "readwrite",
    );
  await Promise.all(
    ["settings", "activities", "routes", "adjustments"].map((s) =>
      tx.objectStore(s).clear(),
    ),
  );
  await tx.done;
});
describe("Biblioteca e recuperação da sessão", () => {
  it("persiste GPX, piso, etapas, rascunho e preferências de forma atómica", async () => {
    await saveWorkspace({ ...defaults, riderKg: 85 }, workspace);
    expect(await getWorkspace()).toEqual(workspace);
    expect((await getSettings()).riderKg).toBe(85);
  });
  it("sessão inválida não substitui último estado válido", async () => {
    await saveWorkspace(defaults, workspace);
    await expect(
      saveWorkspace({ ...defaults, riderKg: 90 }, { ...workspace, days: NaN }),
    ).rejects.toThrow();
    expect(await getWorkspace()).toEqual(workspace);
    expect((await getSettings()).riderKg).toBe(defaults.riderKg);
  });
  it("deduplica geometria idêntica mesmo com nome e ordem de propriedades diferentes", async () => {
    const a = await saveRoute(route),
      b = await saveRoute({
        ...route,
        name: "Outro ficheiro",
        segments: route.segments.map((s) => ({
          riseM: s.riseM,
          distanceM: s.distanceM,
          terrain: s.terrain,
          elevationM: s.elevationM,
        })),
      });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(await listRoutes()).toHaveLength(1);
  });
  it("colisão de hash não substitui geometria diferente", async () => {
    const candidate = {
      ...route,
      name: "Segunda rota",
      segments: route.segments.map((s) => ({
        ...s,
        distanceM: s.distanceM + 1,
      })),
    };
    const id = routeHash(routeIdentity(candidate));
    await (
      await openDatabase()
    ).put("routes", {
      id,
      route,
      createdAt: "2026-10-27",
      updatedAt: "2026-10-27",
    });
    const result = await saveRoute(candidate);
    expect(result.entry.id).toBe(`${id}-1`);
    expect(await listRoutes()).toHaveLength(2);
  });
  it("renomear mantém identidade; remover não apaga sessão ou snapshots", async () => {
    const saved = await saveRoute(route);
    await saveWorkspace(defaults, workspace);
    await saveActivity(activity());
    await renameRoute(saved.entry.id, "Costa");
    expect((await listRoutes())[0].route.name).toBe("Costa");
    await deleteRoute(saved.entry.id);
    expect(await listRoutes()).toHaveLength(0);
    expect((await getWorkspace())?.gpx).toEqual(route);
    expect(await listActivities()).toHaveLength(1);
  });
  it("rejeita pontos inválidos, pisos herdados e sessão sem GPX", () => {
    expect(() =>
      validateRoute({ ...route, points: [{ lat: NaN, lon: 0 }] }),
    ).toThrow();
    expect(() =>
      validateRoute({
        ...route,
        segments: [{ distanceM: 100, riseM: 0, terrain: "__proto__" as never }],
      }),
    ).toThrow();
    expect(() => validateWorkspace({ ...workspace, gpx: null })).toThrow();
    expect(() =>
      validateWorkspace({ ...workspace, stageSoc: { "30": 100 } }),
    ).toThrow();
  });
});
describe("Backup completo versionado", () => {
  it("exporta todos os grupos e restaura num armazenamento vazio", async () => {
    await saveWorkspace({ ...defaults, riderKg: 85 }, workspace);
    await saveRoute(route);
    await saveActivity(activity());
    await saveAdjustment({
      at: "2026-10-27",
      factor: 1.05,
      trainingIds: ["ride-1"],
      validationIds: [],
      reason: "Teste",
    });
    await saveSimulation({
      at: "2026-10-27",
      name: "Teste",
      distanceKm: 10,
      wh: 100,
      arrivalSoc: 70,
    });
    const backup = parseBackup(JSON.stringify(await createBackup()));
    const d = await openDatabase();
    const tx = d.transaction(
      ["settings", "activities", "routes", "adjustments"],
      "readwrite",
    );
    for (const s of ["settings", "activities", "routes", "adjustments"])
      await tx.objectStore(s).clear();
    await tx.done;
    const result = await restoreBackup(backup, true);
    expect(result.added).toBe(3);
    expect((await getSettings()).riderKg).toBe(85);
    expect(await getWorkspace()).toEqual(workspace);
    expect(await listActivities()).toEqual(backup.activities);
    expect(await listRoutes()).toEqual(backup.routes);
    expect(await adjustments()).toEqual(backup.adjustments);
    expect(await listSimulations()).toEqual(backup.simulations);
  });
  it("reimportação idempotente e conflitos preservam registos locais", async () => {
    await saveActivity(activity());
    const backup = await createBackup();
    backup.activities[0].name = "Nome vindo de outro dispositivo";
    const first = await restoreBackup(backup),
      second = await restoreBackup(backup);
    expect(first.kept).toBe(1);
    expect(second.added).toBe(0);
    expect((await listActivities())[0].name).toBe("Teste sintético");
  });
  it("definições e sessão só são substituídas mediante opção explícita", async () => {
    await saveWorkspace(defaults, workspace);
    const backup = await createBackup();
    backup.settings.riderKg = 95;
    backup.workspace = { ...workspace, distance: 20, tab: "Simulador rápido" };
    await restoreBackup(backup);
    expect((await getSettings()).riderKg).toBe(defaults.riderKg);
    expect((await getWorkspace())?.distance).toBe(10);
    await restoreBackup(backup, true);
    expect((await getSettings()).riderKg).toBe(95);
    expect((await getWorkspace())?.distance).toBe(20);
  });
  it("dados inválidos e versões futuras não provocam gravações parciais", async () => {
    await saveActivity(activity());
    const backup = await createBackup();
    const bad = {
      ...backup,
      activities: [
        { ...activity(), id: "ride-2" },
        { ...activity(), id: "ride-3", observedWh: Infinity },
      ],
    };
    await expect(restoreBackup(bad)).rejects.toThrow();
    expect(await listActivities()).toHaveLength(1);
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, version: 999 })),
    ).toThrow("versão");
  });
  it("rejeita IDs duplicados, validação contaminada e coordenadas não finitas", async () => {
    const backup = await createBackup();
    expect(() =>
      parseBackup(
        JSON.stringify({ ...backup, activities: [activity(), activity()] }),
      ),
    ).toThrow("repetidos");
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...backup,
          adjustments: [
            {
              at: "2026-10-27",
              factor: 1,
              reason: "Teste",
              trainingIds: ["a"],
              validationIds: ["a"],
            },
          ],
        }),
      ),
    ).toThrow("sobrepostos");
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...backup,
          routes: [
            {
              id: "x",
              createdAt: "2026-10-27",
              updatedAt: "2026-10-27",
              route: { ...route, points: [{ lat: 91, lon: 0 }] },
            },
          ],
        }),
      ),
    ).toThrow();
  });
  it("ficheiro acima do limite e JSON incorreto são rejeitados", () => {
    expect(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow(
      "50 MB",
    );
    expect(() => parseBackup("{")).toThrow();
    expect(() => parseBackup("null")).toThrow();
  });
});
it("falha de escrita durante o restauro aborta também os registos já inseridos", async () => {
  const backup = await createBackup();
  backup.activities = [activity()];
  backup.routes = [
    {
      id: "route-failure-test",
      route,
      createdAt: "2026-10-27",
      updatedAt: "2026-10-27",
    },
  ];
  backup.settings.riderKg = 95;
  const original = IDBObjectStore.prototype.add;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "add")
    .mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "routes")
        throw new DOMException(
          "Falha de espaço simulada",
          "QuotaExceededError",
        );
      return original.call(this, value, key);
    });
  try {
    await expect(restoreBackup(backup, true)).rejects.toThrow("simulada");
  } finally {
    spy.mockRestore();
  }
  expect(await listActivities()).toEqual([]);
  expect(await listRoutes()).toEqual([]);
  expect((await getSettings()).riderKg).toBe(defaults.riderKg);
});
