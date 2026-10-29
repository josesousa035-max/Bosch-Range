import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { defaults, manualRoute, simulate } from "../src/core/model";
import {
  saveActivity,
  listActivities,
  saveSettings,
  getSettings,
  importActivities,
  parseActivities,
  saveAdjustment,
  adjustments,
  type Activity,
} from "../src/core/storage";
import { calibrate, metrics } from "../src/core/calibration";
const r = manualRoute(30, 600, "compactado"),
  p = simulate(r, defaults),
  auxWh = p.hours * defaults.auxiliaryW;
function row(i: number, factor = 1.15): Activity {
  return {
    id: `test-${i}`,
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    createdAt: "2026-01-01T00:00:00Z",
    name: "Teste",
    distanceKm: 30,
    ascentM: 600,
    durationH: p.hours,
    startSoc: 100,
    endSoc: 50,
    observedWh: (p.requiredWh - auxWh) * factor + auxWh,
    measuredWh: (p.requiredWh - auxWh) * factor + auxWh,
    predictedWh: p.requiredWh,
    motorInputWh: p.requiredWh - auxWh,
    auxWh,
    source: "medido",
    settings: { ...defaults },
    route: r,
    notes: "",
  };
}
describe("Persistência e calibração", () => {
  it("guarda e recupera preferências em IndexedDB", async () => {
    await saveSettings({ ...defaults, riderKg: 91 });
    expect((await getSettings()).riderKg).toBe(91);
  });
  it("guarda atividade completa e importação repetida é idempotente", async () => {
    const a = row(0);
    await saveActivity(a);
    await importActivities(parseActivities(JSON.stringify([a])));
    expect((await listActivities()).filter((r) => r.id === a.id)).toHaveLength(
      1,
    );
    expect((await listActivities())[0].route).toEqual(a.route);
  });
  it("valida importação antes da transação; rejeita dados não finitos", async () => {
    expect(() => parseActivities("[{}]")).toThrow();
    await expect(
      importActivities([row(1), { ...row(2), observedWh: NaN }]),
    ).rejects.toThrow();
    expect((await listActivities()).some((r) => r.id === "test-1")).toBe(false);
  });
  it("sem dados não anuncia calibração", () => {
    expect(calibrate([]).factor).toBe(1);
    expect(calibrate([row(1)]).status).toContain("insuficientes");
  });
  it("ajusta perdas com regularização e limites plausíveis", () => {
    const c = calibrate(Array.from({ length: 7 }, (_, i) => row(i, 1.2)));
    expect(c.factor).toBeGreaterThan(1);
    expect(c.factor).toBeLessThan(1.2);
    const out = calibrate(Array.from({ length: 8 }, (_, i) => row(i, 10)));
    expect(out.factor).toBeLessThanOrEqual(1.3);
  });
  it("reserva validação independente e melhora MAE sintético", () => {
    const c = calibrate(Array.from({ length: 12 }, (_, i) => row(i)));
    expect(c.validation).toHaveLength(3);
    expect(c.training.every((a) => !c.validation.includes(a))).toBe(true);
    expect(c.calibrated.mae).toBeLessThan(c.baseline.mae);
    expect(c.calibrated.mape).toBeLessThan(c.baseline.mape);
  });
  it("SOC pouco discriminante excluído; Wh medidos elegíveis", () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      ...row(i),
      source: "percentagem" as const,
      endSoc: 95,
    }));
    expect(calibrate(rows).training).toHaveLength(0);
  });
  it("modelo original reprodutível e histórico de reposição", async () => {
    await saveAdjustment({
      at: "2026-01-01",
      factor: 1.1,
      trainingIds: [],
      validationIds: [],
      reason: "ajuste",
    });
    await saveAdjustment({
      at: "2026-01-02",
      factor: 1,
      trainingIds: [],
      validationIds: [],
      reason: "reposição",
    });
    expect((await adjustments()).at(-1)?.factor).toBe(1);
    expect(metrics([row(0)], 1).mae).toBeCloseTo(
      Math.abs(row(0).predictedWh - row(0).observedWh),
    );
  });
});
