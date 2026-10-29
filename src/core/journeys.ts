import {
  battery,
  modes,
  validateSettings,
  type Settings,
  type Route,
  type Mode,
  type Prediction,
} from "./model";
import { validateRoute, routeIdentity, routeHash } from "./workspace";
import { openDatabase, type Activity } from "./storage";
export interface ForecastSnapshot {
  formatVersion: 1;
  algorithmVersion: string;
  calibrationVersion: string;
  routeIdentity: string;
  routeVersion: 1;
  settings: Settings;
  route: Route;
  capacityWh: number;
  startWh: number;
  requiredWh: number;
  arrivalSoc: number;
  reserveSoc: number;
  lowWh: number;
  highWh: number;
  distanceKm: number;
  ascentM: number;
  descentM: number;
  hours: number;
  motorBaseWh: number;
  auxWh: number;
  energy: { distanceM: number; remainingWh: number }[];
  origin: "gpx" | "manual" | "legacy";
  elevationComplete: boolean;
}
export interface ObservedResult {
  endSoc: number;
  startSoc: number;
  distanceKm: number;
  mode: Mode;
  measuredWh?: number;
  charged: boolean;
  batterySwapped: boolean;
  configurationChanged: boolean;
  routeChanged: boolean;
  conditionsChanged: boolean;
  notes: string;
}
export interface Journey {
  id: string;
  formatVersion: 1;
  name: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  status: "planned" | "completed";
  parentId?: string;
  legacyActivityId?: string;
  forecast: ForecastSnapshot;
  actual: ObservedResult | null;
  actualRevisions: { at: string; value: ObservedResult }[];
}
export function forecastSnapshot(
  route: Route,
  settings: Settings,
  prediction: Prediction,
): ForecastSnapshot {
  validateRoute(route);
  validateSettings(settings);
  return structuredClone({
    formatVersion: 1,
    algorithmVersion: "physics-2.0.0",
    calibrationVersion: `electrical-loss-v1:${settings.calibrationFactor}`,
    routeIdentity: routeHash(routeIdentity(route)),
    routeVersion: 1,
    settings,
    route,
    capacityWh: prediction.capacityWh,
    startWh: prediction.startWh,
    requiredWh: prediction.requiredWh,
    arrivalSoc: prediction.arrivalSoc,
    reserveSoc: settings.reserveSoc,
    lowWh: prediction.lowWh,
    highWh: prediction.highWh,
    distanceKm: prediction.distanceKm,
    ascentM: prediction.ascentM,
    descentM: prediction.descentM,
    hours: prediction.hours,
    motorBaseWh: prediction.samples.reduce(
      (n, s) => n + s.motorWh / settings.efficiency,
      0,
    ),
    auxWh: prediction.hours * settings.auxiliaryW,
    energy: prediction.samples.map((s) => ({
      distanceM: s.km * 1000,
      remainingWh: s.remainingWh,
    })),
    origin: route.points ? "gpx" : "manual",
    elevationComplete: route.elevationComplete,
  } as ForecastSnapshot);
}
function finite(n: unknown, min: number, max: number) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
    throw Error("Número inválido no passeio");
}
function text(s: unknown, max: number, empty = true) {
  if (typeof s !== "string" || s.length > max || (!empty && !s.trim()))
    throw Error("Texto inválido no passeio");
}
function timestamp(s: string) {
  if (typeof s !== "string" || !Number.isFinite(Date.parse(s)))
    throw Error("Data inválida no passeio");
}
export function validateObserved(v: ObservedResult) {
  if (!v) throw Error("Resultado em falta");
  finite(v.endSoc, 0, 100);
  finite(v.startSoc, 0, 100);
  finite(v.distanceKm, 0.01, 10000);
  if (!modes.includes(v.mode)) throw Error("Assistência real inválida");
  for (const k of [
    "charged",
    "batterySwapped",
    "configurationChanged",
    "routeChanged",
    "conditionsChanged",
  ] as const)
    if (typeof v[k] !== "boolean") throw Error("Condição real inválida");
  if (v.endSoc > v.startSoc && !v.charged && !v.batterySwapped)
    throw Error(
      "A carga final superior à inicial exige assinalar recarga ou troca de bateria",
    );
  if (v.measuredWh !== undefined) finite(v.measuredWh, 0, 10000);
  text(v.notes, 5000);
}
export function validateJourney(j: Journey) {
  if (
    !j ||
    j.formatVersion !== 1 ||
    !["planned", "completed"].includes(j.status)
  )
    throw Error("Formato de passeio inválido");
  text(j.id, 200, false);
  text(j.name, 200, false);
  text(j.notes, 5000);
  timestamp(j.createdAt);
  timestamp(j.updatedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(j.date) ||
    !Number.isFinite(Date.parse(j.date)) ||
    new Date(j.date + "T00:00:00Z").toISOString().slice(0, 10) !== j.date
  )
    throw Error("Data do passeio inválida");
  const f = j.forecast;
  if (
    !f ||
    f.formatVersion !== 1 ||
    f.routeVersion !== 1 ||
    !["gpx", "manual", "legacy"].includes(f.origin)
  )
    throw Error("Previsão inválida");
  validateRoute(f.route);
  validateSettings(f.settings);
  text(f.algorithmVersion, 100, false);
  text(f.calibrationVersion, 100, false);
  text(f.routeIdentity, 200, false);
  for (const k of [
    "capacityWh",
    "startWh",
    "requiredWh",
    "lowWh",
    "highWh",
    "distanceKm",
    "ascentM",
    "descentM",
    "hours",
    "motorBaseWh",
    "auxWh",
  ] as const)
    finite(f[k], 0, 1e8);
  if (!f.capacityWh || !f.distanceKm || f.lowWh > f.highWh)
    throw Error("Capacidade ou previsão inválida");
  finite(f.arrivalSoc, 0, 100);
  finite(f.reserveSoc, 0, 100);
  if (!Array.isArray(f.energy) || f.energy.length > 200001)
    throw Error("Curva energética inválida");
  let previous = -1;
  for (const e of f.energy) {
    if (!e) throw Error("Amostra inválida");
    finite(e.distanceM, 0, 1e9);
    finite(e.remainingWh, 0, f.capacityWh);
    if (e.distanceM < previous) throw Error("Curva energética fora de ordem");
    previous = e.distanceM;
  }
  if (j.status === "completed") validateObserved(j.actual!);
  else if (j.actual !== null) throw Error("Plano com resultado incompatível");
  if (!Array.isArray(j.actualRevisions) || j.actualRevisions.length > 1000)
    throw Error("Histórico de resultados inválido");
  for (const r of j.actualRevisions) {
    timestamp(r.at);
    validateObserved(r.value);
  }
  if (j.parentId !== undefined) text(j.parentId, 200, false);
}
export async function listJourneys(): Promise<Journey[]> {
  return (await (await openDatabase()).getAll("journeys")).sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}
export async function createJourney(
  name: string,
  date: string,
  route: Route,
  settings: Settings,
  p: Prediction,
  notes = "",
  parentId?: string,
): Promise<Journey> {
  const now = new Date().toISOString(),
    journey: Journey = {
      id: crypto.randomUUID(),
      formatVersion: 1,
      name: name.trim(),
      date,
      createdAt: now,
      updatedAt: now,
      notes,
      status: "planned",
      forecast: forecastSnapshot(route, settings, p),
      actual: null,
      actualRevisions: [],
      ...(parentId ? { parentId } : {}),
    };
  validateJourney(journey);
  await (await openDatabase()).add("journeys", journey);
  return journey;
}
export async function completeJourney(id: string, actual: ObservedResult) {
  validateObserved(actual);
  const d = await openDatabase(),
    tx = d.transaction("journeys", "readwrite");
  const previous: Journey | undefined = await tx.store.get(id);
  if (!previous) {
    await tx.done;
    throw Error("Passeio não encontrado");
  }
  const next: Journey = {
    ...previous,
    status: "completed",
    actual: structuredClone(actual),
    updatedAt: new Date().toISOString(),
    actualRevisions: [
      ...previous.actualRevisions,
      { at: new Date().toISOString(), value: structuredClone(actual) },
    ],
  };
  validateJourney(next);
  await tx.store.put(next);
  await tx.done;
  return next;
}
export async function updateJourneyNotes(id: string, notes: string) {
  text(notes, 5000);
  const d = await openDatabase(),
    tx = d.transaction("journeys", "readwrite");
  const j: Journey | undefined = await tx.store.get(id);
  if (!j) {
    await tx.done;
    throw Error("Passeio não encontrado");
  }
  await tx.store.put({ ...j, notes, updatedAt: new Date().toISOString() });
  await tx.done;
}
export async function duplicateJourney(j: Journey) {
  const now = new Date().toISOString(),
    copy: Journey = {
      ...structuredClone(j),
      id: crypto.randomUUID(),
      parentId: j.id,
      name: `${j.name.slice(0, 190)} (cópia)`,
      status: "planned",
      createdAt: now,
      updatedAt: now,
      actual: null,
      actualRevisions: [],
    };
  validateJourney(copy);
  await (await openDatabase()).add("journeys", copy);
  return copy;
}
export async function removeJourney(id: string) {
  const d = await openDatabase(),
    tx = d.transaction(["journeys", "activities"], "readwrite");
  const j: Journey | undefined = await tx.objectStore("journeys").get(id);
  if (j?.legacyActivityId)
    await tx.objectStore("activities").delete(j.legacyActivityId);
  await tx.objectStore("journeys").delete(id);
  await tx.done;
}
export function arrivalError(predicted: number, observed: number) {
  finite(predicted, 0, 100);
  finite(observed, 0, 100);
  return predicted - observed;
}
export function exclusions(j: Journey): string[] {
  if (j.status !== "completed" || !j.actual) return ["Sem resultado real"];
  const a = j.actual,
    f = j.forecast,
    reasons: string[] = [];
  if (f.origin === "legacy")
    reasons.push("Chegada reconstituída de registo anterior");
  if (Math.abs(a.startSoc - f.settings.startSoc) > 1)
    reasons.push("Carga inicial diferente");
  if (a.charged) reasons.push("Carga intermédia");
  if (a.batterySwapped) reasons.push("Troca de bateria");
  if (a.configurationChanged) reasons.push("Configuração incompatível");
  if (
    a.routeChanged ||
    Math.abs(a.distanceKm - f.distanceKm) / f.distanceKm > 0.05
  )
    reasons.push("Percurso ou distância alterados");
  if (a.mode !== f.settings.mode) reasons.push("Assistência alterada");
  if (a.conditionsChanged) reasons.push("Condições alteradas");
  if (f.settings.extender)
    reasons.push("SOC combinado das duas baterias não confirmado");
  if (!f.elevationComplete && f.origin === "gpx")
    reasons.push("Altimetria incompleta");
  return reasons;
}
export function observedWh(
  j: Journey,
): { wh: number; measured: boolean } | null {
  if (!j.actual) return null;
  if (j.actual.measuredWh !== undefined)
    return { wh: j.actual.measuredWh, measured: true };
  if (
    j.actual.charged ||
    j.actual.batterySwapped ||
    j.forecast.settings.extender ||
    j.actual.endSoc > j.actual.startSoc
  )
    return null;
  return {
    wh: (j.forecast.capacityWh * (j.actual.startSoc - j.actual.endSoc)) / 100,
    measured: false,
  };
}
export function journeyMetrics(rows: Journey[]) {
  const valid = rows.filter((j) => !exclusions(j).length),
    errors = valid.map((j) =>
      arrivalError(j.forecast.arrivalSoc, j.actual!.endSoc),
    );
  return {
    valid,
    excluded: rows.filter((j) => exclusions(j).length),
    count: valid.length,
    mae: errors.length
      ? errors.reduce((s, x) => s + Math.abs(x), 0) / errors.length
      : null,
    bias: errors.length
      ? errors.reduce((s, x) => s + x, 0) / errors.length
      : null,
  };
}
export function calibrationActivities(rows: Journey[]): Activity[] {
  return rows
    .filter(
      (j) =>
        !exclusions(j).length &&
        observedWh(j) &&
        observedWh(j)!.wh > 0 &&
        j.forecast.motorBaseWh > 0,
    )
    .map((j) => ({
      id: j.id,
      date: j.date,
      name: j.name,
      distanceKm: j.actual!.distanceKm,
      ascentM: j.forecast.ascentM,
      durationH: j.forecast.hours,
      startSoc: j.actual!.startSoc,
      endSoc: j.actual!.endSoc,
      ...(j.actual!.measuredWh !== undefined
        ? { measuredWh: j.actual!.measuredWh }
        : {}),
      observedWh: observedWh(j)!.wh,
      predictedWh: j.forecast.motorBaseWh + j.forecast.auxWh,
      motorInputWh: j.forecast.motorBaseWh,
      auxWh: j.forecast.auxWh,
      source: j.actual!.measuredWh !== undefined ? "medido" : "percentagem",
      settings: j.forecast.settings,
      route: j.forecast.route,
      notes: j.notes,
      createdAt: j.createdAt,
    }));
}
/** Additive migration: old activities and exact numerical forecasts stay untouched. */
export async function migrateLegacyActivities() {
  const d = await openDatabase(),
    tx = d.transaction(["activities", "journeys"], "readwrite");
  const rows: Activity[] = await tx.objectStore("activities").getAll();
  let count = 0;
  for (const a of rows) {
    const id = `legacy-${a.id}`;
    if ((await tx.objectStore("journeys").getKey(id)) !== undefined) continue;
    const b = battery(a.settings),
      arrival = Math.max(0, ((b.startWh - a.predictedWh) / b.capacityWh) * 100);
    const actual: ObservedResult = {
      endSoc: a.endSoc,
      startSoc: a.startSoc,
      distanceKm: a.distanceKm,
      mode: a.settings.mode,
      ...(a.source === "medido" ? { measuredWh: a.measuredWh } : {}),
      charged: false,
      batterySwapped: false,
      configurationChanged: false,
      routeChanged: false,
      conditionsChanged: false,
      notes: a.notes,
    };
    const journey: Journey = {
      id,
      legacyActivityId: a.id,
      formatVersion: 1,
      name: a.name || "Passeio anterior",
      date: a.date,
      createdAt: a.createdAt,
      updatedAt: a.createdAt,
      notes: a.notes,
      status: "completed",
      actual,
      actualRevisions: [],
      forecast: {
        formatVersion: 1,
        algorithmVersion: "legacy-2.1-snapshot",
        calibrationVersion: "baseline-original",
        routeIdentity: routeHash(routeIdentity(a.route)),
        routeVersion: 1,
        settings: a.settings,
        route: a.route,
        capacityWh: b.capacityWh,
        startWh: b.startWh,
        requiredWh: a.predictedWh,
        arrivalSoc: arrival,
        reserveSoc: a.settings.reserveSoc,
        lowWh: a.predictedWh,
        highWh: a.predictedWh,
        distanceKm: a.distanceKm,
        ascentM: a.ascentM,
        descentM: 0,
        hours: a.durationH,
        motorBaseWh: a.motorInputWh,
        auxWh: a.auxWh,
        energy: [],
        origin: "legacy",
        elevationComplete: a.route.elevationComplete,
      },
    };
    validateJourney(journey);
    await tx.objectStore("journeys").add(journey);
    count++;
  }
  await tx.done;
  return count;
}
