import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { defaults, manualRoute, simulate } from "../src/core/model";
import { openDatabase, saveActivity } from "../src/core/storage";
import {
  createJourney,
  listJourneys,
  completeJourney,
  duplicateJourney,
  removeJourney,
  migrateLegacyActivities,
  arrivalError,
  exclusions,
  observedWh,
  journeyMetrics,
  type ObservedResult,
} from "../src/core/journeys";
import { createBackup, restoreBackup, parseBackup } from "../src/core/backup";
const route = manualRoute(40, 800, "compactado");
const actual: ObservedResult = {
  endSoc: 27,
  startSoc: 100,
  distanceKm: 40,
  mode: defaults.mode,
  charged: false,
  batterySwapped: false,
  configurationChanged: false,
  routeChanged: false,
  conditionsChanged: false,
  notes: "",
};
beforeEach(async () => {
  const d = await openDatabase(),
    tx = d.transaction(
      ["settings", "activities", "adjustments", "routes", "journeys"],
      "readwrite",
    );
  for (const key of [
    "settings",
    "activities",
    "adjustments",
    "routes",
    "journeys",
  ])
    await tx.objectStore(key).clear();
  await tx.done;
});
async function plan() {
  return createJourney(
    "Volta",
    "2026-10-29",
    route,
    defaults,
    simulate(route, defaults),
  );
}
describe("Plano → resultado real sem reescrever previsões", () => {
  it("guarda snapshot independente de alterações futuras", async () => {
    const settings = { ...defaults },
      r = structuredClone(route),
      p = simulate(r, settings),
      j = await createJourney("Volta", "2026-10-29", r, settings, p);
    settings.nominalWh = 1000;
    r.segments[0].riseM = 1;
    await completeJourney(j.id, actual);
    const saved = (await listJourneys())[0];
    expect(saved.forecast).toEqual(j.forecast);
    expect(saved.forecast.settings.nominalWh).toBe(800);
    expect(saved.status).toBe("completed");
    expect(saved.actualRevisions).toHaveLength(1);
  });
  it("nova observação cria revisão separada e duplicar não altera o original", async () => {
    const j = await plan();
    await completeJourney(j.id, actual);
    await completeJourney(j.id, { ...actual, endSoc: 30 });
    const saved = (await listJourneys())[0];
    expect(saved.actualRevisions.map((r) => r.value.endSoc)).toEqual([27, 30]);
    const copy = await duplicateJourney(saved);
    expect(copy.id).not.toBe(j.id);
    expect(copy.parentId).toBe(j.id);
    expect(copy.forecast).toEqual(j.forecast);
    expect(copy.actual).toBeNull();
    expect(copy.status).toBe("planned");
  });
  it("35% previstos e 27% observados dão 8 p.p. de otimismo", () =>
    expect(arrivalError(35, 27)).toBe(8));
  it("resultado ausente não equivale a zero e não entra nas métricas", async () => {
    const j = await plan();
    expect(observedWh(j)).toBeNull();
    expect(journeyMetrics([j]).count).toBe(0);
    expect(journeyMetrics([j]).mae).toBeNull();
  });
  it("exclui recarga, troca, condições, percurso, modo e início incompatíveis", async () => {
    const j = await plan();
    for (const patch of [
      { charged: true },
      { batterySwapped: true },
      { configurationChanged: true },
      { routeChanged: true },
      { conditionsChanged: true },
      { mode: "Turbo" as const },
      { startSoc: 80 },
      { distanceKm: 60 },
    ]) {
      await completeJourney(j.id, { ...actual, ...patch });
      expect(exclusions((await listJourneys())[0]).length).toBeGreaterThan(0);
    }
  });
  it("SOC convertido é estimativa; energia medida é identificada como tal", async () => {
    const j = await plan();
    await completeJourney(j.id, actual);
    let saved = (await listJourneys())[0];
    expect(observedWh(saved)).toEqual({
      wh: j.forecast.capacityWh * 0.73,
      measured: false,
    });
    await completeJourney(j.id, { ...actual, measuredWh: 500 });
    saved = (await listJourneys())[0];
    expect(observedWh(saved)).toEqual({ wh: 500, measured: true });
  });
  it("valida percentagens e recarga quando SOC final sobe", async () => {
    const j = await plan();
    await expect(
      completeJourney(j.id, { ...actual, endSoc: 101 }),
    ).rejects.toThrow();
    await expect(
      completeJourney(j.id, { ...actual, startSoc: 20, endSoc: 30 }),
    ).rejects.toThrow("recarga");
    expect((await listJourneys())[0].actual).toBeNull();
  });
  it("backup v2 reabre percursos, previsões e revisões sem duplicar nem substituir conflitos", async () => {
    const j = await plan();
    await completeJourney(j.id, actual);
    const b = parseBackup(JSON.stringify(await createBackup()));
    expect(b.version).toBe(2);
    expect(b.journeys).toHaveLength(1);
    await removeJourney(j.id);
    await restoreBackup(b);
    await restoreBackup(b);
    const restored = await listJourneys();
    expect(restored).toHaveLength(1);
    expect(restored[0].forecast).toEqual(j.forecast);
    expect(restored[0].actual?.endSoc).toBe(27);
  });
  it("backup v1 continua suportado", async () => {
    const b = await createBackup();
    const legacy = { ...b, version: 1 as const };
    delete legacy.journeys;
    await restoreBackup(legacy);
    expect(await listJourneys()).toEqual([]);
  });
  it("migra atividades antigas uma única vez e preserva a previsão numérica", async () => {
    const p = simulate(route, defaults);
    await saveActivity({
      id: "old",
      name: "Anterior",
      date: "2026-10-01",
      createdAt: "2026-10-01T00:00:00Z",
      distanceKm: 40,
      ascentM: 800,
      durationH: 2.5,
      startSoc: 100,
      endSoc: 50,
      observedWh: 380,
      predictedWh: 321,
      motorInputWh: 311,
      auxWh: 10,
      source: "percentagem",
      settings: defaults,
      route,
      notes: "nota",
    });
    expect(await migrateLegacyActivities()).toBe(1);
    expect(await migrateLegacyActivities()).toBe(0);
    const j = (await listJourneys())[0];
    expect(j.forecast.requiredWh).toBe(321);
    expect(j.forecast.energy).toEqual([]);
    expect(j.legacyActivityId).toBe("old");
    await removeJourney(j.id);
    expect(await migrateLegacyActivities()).toBe(0);
  });
});
