import type { Activity } from "./storage";
export interface Metrics {
  mae: number;
  mape: number;
  bias: number;
  n: number;
}
export function calibratedWh(a: Activity, factor: number) {
  return (
    a.motorInputWh * Math.max(factor, a.settings.efficiency / 0.98) + a.auxWh
  );
}
export function metrics(rows: Activity[], factor: number): Metrics {
  if (!rows.length) return { mae: 0, mape: 0, bias: 0, n: 0 };
  const errors = rows.map((a) => calibratedWh(a, factor) - a.observedWh);
  return {
    n: rows.length,
    mae: errors.reduce((a, e) => a + Math.abs(e), 0) / rows.length,
    bias: errors.reduce((a, e) => a + e, 0) / rows.length,
    mape:
      (errors.reduce((a, e, i) => a + Math.abs(e) / rows[i].observedWh, 0) /
        rows.length) *
      100,
  };
}
export function calibrate(rows: Activity[]) {
  const sorted = [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  // Small SOC changes are too quantised; measured Wh remain preferable.
  const eligible = sorted.filter(
    (a) =>
      a.motorInputWh > 10 &&
      a.observedWh > 20 &&
      (a.source === "medido" || a.startSoc - a.endSoc >= 15),
  );
  const validation =
    eligible.length >= 8 ? eligible.filter((_, i) => i % 4 === 3) : [];
  const training = eligible.filter((a) => !validation.includes(a));
  if (training.length < 3)
    return {
      factor: 1,
      training,
      validation,
      baseline: metrics(validation, 1),
      calibrated: metrics(validation, 1),
      status:
        "Dados insuficientes: mínimo de 3 passeios elegíveis; ainda sem calibração.",
    };
  // Fit one bounded electrical-loss multiplier. Weighted ridge towards the physical baseline.
  const ratios = training.map((a) => ({
    ratio: Math.max(
      0.7,
      Math.min(1.3, (a.observedWh - a.auxWh) / a.motorInputWh),
    ),
    weight: a.source === "medido" ? 1 : 0.35,
  }));
  const weight = ratios.reduce((a, r) => a + r.weight, 0);
  const factor = Math.max(
    0.7,
    Math.min(
      1.3,
      (3 + ratios.reduce((a, r) => a + r.ratio * r.weight, 0)) / (3 + weight),
    ),
  );
  return {
    factor,
    training,
    validation,
    baseline: metrics(validation, 1),
    calibrated: metrics(validation, factor),
    status: validation.length
      ? "Ajuste experimental; avaliar erros no conjunto temporal reservado."
      : "Ajuste provisório: ainda sem validação independente (mínimo 8 passeios).",
  };
}
