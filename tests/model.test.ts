import { describe, it, expect } from "vitest";
import {
  defaults,
  simulate,
  manualRoute,
  potentialWh,
  forces,
  cutoff,
  battery,
  modes,
  type Route,
} from "../src/core/model";
const route = (riseM = 0, distanceM = 1000): Route => ({
  name: "Sintético",
  elevationComplete: true,
  warnings: [],
  segments: [{ distanceM, riseM }],
});
describe("Modelo físico e unidades", () => {
  it("mgh em Wh: 100 kg e 100 m", () =>
    expect(potentialWh(100, 100)).toBeCloseTo(27.2406944, 6));
  it("rolamento em plano", () =>
    expect(forces(100, 0, 0.01, 0, 5, 0).rolling).toBeCloseTo(9.80665, 6));
  it("aerodinâmica com vento e temperatura", () => {
    expect(forces(100, 0, 0, 0.6, 5, 0).aero).toBeCloseTo(9.030796947, 6);
    expect(forces(100, 0, 0, 0.6, 5, 5).aero).toBeCloseTo(
      forces(100, 0, 0, 0.6, 5, 0).aero * 4,
      8,
    );
  });
  it("gravidade integrada coincide com mgh, sem duplicação", () => {
    const q = simulate(route(100), {
      ...defaults,
      targetKmh: 8,
      humanW: 500,
      cdA: 0.2,
      crrFactor: 0.4,
      terrain: "asfalto",
    });
    const m = defaults.riderKg + defaults.bikeKg + defaults.luggageKg;
    const f = forces(m, 0.1, 0.007 * 0.4, 0.2, 8 / 3.6, 0);
    expect(q.samples[1].mechanicalWh).toBeCloseTo(
      potentialWh(m, 100) +
        ((f.rolling + f.aero) * Math.hypot(1000, 100)) / 3600,
      7,
    );
  });
  it("aumentar massa aumenta procura numa subida", () => {
    expect(
      simulate(route(100), { ...defaults, riderKg: 100 }).requiredWh,
    ).toBeGreaterThan(simulate(route(100), defaults).requiredWh);
  });
  it("energia elétrica distingue energia mecânica", () => {
    const q = simulate(route(80), defaults);
    expect(q.requiredWh).toBeCloseTo(
      q.samples[1].motorWh / defaults.efficiency +
        q.hours * defaults.auxiliaryW,
      8,
    );
  });
  it("conserva potência mecânica entre ciclista e motor", () => {
    for (const sample of simulate(
      manualRoute(40, 800, "trilho"),
      defaults,
    ).samples.slice(1))
      expect(sample.humanWh + sample.motorWh).toBeCloseTo(
        sample.mechanicalWh,
        6,
      );
  });
  it("corte europeu limita assistência, não velocidade", () => {
    expect(cutoff(24)).toBe(1);
    expect(cutoff(24.5)).toBe(0.5);
    expect(cutoff(25)).toBe(0);
    const q = simulate(route(-50), { ...defaults, targetKmh: 35 });
    expect(q.samples[1].speedKmh).toBe(35);
    expect(q.samples[1].motorWh).toBe(0);
  });
  it("descida não regenera; apenas auxiliares numa descida íngreme", () => {
    const q = simulate(route(-200), defaults);
    expect(q.samples[1].motorWh).toBe(0);
    expect(q.requiredWh).toBeGreaterThan(0);
    expect(q.remainingWh).toBeLessThan(q.startWh);
  });
  it("reduz velocidade quando potência é insuficiente", () => {
    const q = simulate(route(200), { ...defaults, targetKmh: 25 });
    expect(q.limitedSegments).toBe(1);
    expect(q.samples[1].speedKmh).toBeLessThan(25);
  });
  it("rejeita cenário sem potência humana e sem movimento viável", () =>
    expect(() => simulate(route(200), { ...defaults, humanW: 0 })).toThrow(
      "Potência insuficiente",
    ));
  it("bateria parcialmente carregada, saúde e capacidade utilizável", () => {
    const b = battery({ ...defaults, startSoc: 50, health: 80, usable: 90 });
    expect(b.capacityWh).toBe(576);
    expect(b.startWh).toBe(288);
  });
  it("PowerMore com SOC distinto é energia total, não repartida", () => {
    const b = battery({ ...defaults, extender: true, extenderSoc: 40 });
    expect(b.startWh).toBeCloseTo((800 + 250 * 0.4) * 0.95);
    expect(b.capacityWh).toBeCloseTo(1050 * 0.95);
  });
  it("frio reduz capacidade estimada", () =>
    expect(battery({ ...defaults, temperature: 0 }).capacityWh).toBeLessThan(
      battery(defaults).capacityWh,
    ));
  it("reserva localizada por interpolação; energia nunca negativa", () => {
    const q = simulate(manualRoute(150, 3000, "trilho"), {
      ...defaults,
      startSoc: 20,
    });
    expect(q.reserveAtKm).not.toBeNull();
    expect(q.depletedAtKm).not.toBeNull();
    expect(q.remainingWh).toBe(0);
    expect(
      q.samples.every(
        (x, i, a) =>
          x.remainingWh >= 0 && (!i || x.remainingWh <= a[i - 1].remainingWh),
      ),
    ).toBe(true);
    expect(q.consumedWh).toBe(q.startWh);
  });
  it("comparação de modos com velocidade viável controlada", () => {
    const values = modes.map(
      (mode) =>
        simulate(route(20), { ...defaults, mode, targetKmh: 10 }).requiredWh,
    );
    expect(values[3]).toBeGreaterThan(values[0]);
  });
  it("determininismo e valores finitos", () => {
    const r = manualRoute(40, 800, "compactado");
    expect(simulate(r, defaults)).toEqual(simulate(r, defaults));
    for (const mode of modes) {
      const p = simulate(r, { ...defaults, mode });
      expect(
        [p.requiredWh, p.arrivalSoc, p.hours, p.rangeRemainingKm].every(
          Number.isFinite,
        ),
      ).toBe(true);
    }
  });
  it("invalida NaN, infinito, massa e percentagens impossíveis", () => {
    for (const patch of [
      { riderKg: NaN },
      { targetKmh: Infinity },
      { startSoc: 101 },
      { efficiency: 0 },
      { riderKg: -2 },
    ])
      expect(() => simulate(route(), { ...defaults, ...patch })).toThrow();
    expect(() => simulate(route(NaN), defaults)).toThrow();
    expect(() => manualRoute(0, 20, "asfalto")).toThrow();
    expect(() => manualRoute(2, 1000, "asfalto")).toThrow();
  });
  it("calibração não permite eficiência elétrica superior a 98%", () => {
    const q = simulate(route(80), {
      ...defaults,
      efficiency: 0.95,
      calibrationFactor: 0.7,
    });
    expect(q.requiredWh - q.hours * defaults.auxiliaryW).toBeGreaterThanOrEqual(
      q.samples[1].motorWh / 0.98 - 1e-8,
    );
  });
  it("terreno herdado e distâncias enormes são rejeitados", () => {
    expect(() =>
      simulate(route(), { ...defaults, terrain: "__proto__" as never }),
    ).toThrow();
    expect(() => simulate(route(0, 1e300), defaults)).toThrow();
  });
  it("chegada sem carga não inventa energia", () => {
    const q = simulate(route(), { ...defaults, startSoc: 0 });
    expect(q.remainingWh).toBe(0);
    expect(q.depletedAtKm).toBe(0);
    expect(q.reserveAtKm).toBe(0);
  });
});
