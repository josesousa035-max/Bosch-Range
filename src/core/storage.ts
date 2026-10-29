import { openDB } from "idb";
import {
  validateRoute,
  validateWorkspace,
  routeIdentity,
  routeHash,
  type Workspace,
} from "./workspace";
import { defaults, validateSettings, type Settings, type Route } from "./model";
export interface Activity {
  id: string;
  date: string;
  name: string;
  distanceKm: number;
  ascentM: number;
  durationH: number;
  startSoc: number;
  endSoc: number;
  measuredWh?: number;
  observedWh: number;
  predictedWh: number;
  motorInputWh: number;
  auxWh: number;
  source: "medido" | "percentagem";
  settings: Settings;
  route: Route;
  notes: string;
  createdAt: string;
}
export interface Adjustment {
  at: string;
  factor: number;
  trainingIds: string[];
  validationIds: string[];
  reason: string;
}
let connection: ReturnType<typeof openDB> | undefined;
export function openDatabase() {
  return (connection ??= openDB("bosch-range-lab", 3, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("settings"))
        d.createObjectStore("settings");
      if (!d.objectStoreNames.contains("activities"))
        d.createObjectStore("activities", { keyPath: "id" });
      if (!d.objectStoreNames.contains("adjustments"))
        d.createObjectStore("adjustments", { keyPath: "at" });
      if (!d.objectStoreNames.contains("journeys"))
        d.createObjectStore("journeys", { keyPath: "id" });
      if (!d.objectStoreNames.contains("routes"))
        d.createObjectStore("routes", { keyPath: "id" });
    },
    blocked() {
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("bosch-storage-blocked"));
    },
    blocking() {
      connection?.then((d) => d.close());
      connection = undefined;
    },
  }));
}
const db = openDatabase;
export async function getSettings() {
  const v = await (await db()).get("settings", "current");
  if (!v) return { ...defaults };
  const merged = { ...defaults, ...v };
  validateSettings(merged);
  return merged as Settings;
}
export async function saveSettings(v: Settings) {
  validateSettings(v);
  await (await db()).put("settings", v, "current");
}
export async function listActivities(): Promise<Activity[]> {
  return (await (await db()).getAll("activities")).sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
}
export async function saveActivity(v: Activity) {
  validateActivity(v);
  await (await db()).put("activities", v);
}
export async function deleteActivity(id: string) {
  await (await db()).delete("activities", id);
}
export async function adjustments(): Promise<Adjustment[]> {
  return (await db()).getAll("adjustments");
}
export async function saveAdjustment(v: Adjustment) {
  await (await db()).put("adjustments", v);
}
export function validateActivity(v: Activity) {
  if (
    !v ||
    typeof v.createdAt !== "string" ||
    !Number.isFinite(Date.parse(v.createdAt)) ||
    typeof v.id !== "string" ||
    !v.id ||
    typeof v.name !== "string" ||
    v.name.length > 200 ||
    typeof v.notes !== "string" ||
    v.notes.length > 5000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
    !Number.isFinite(Date.parse(v.date))
  )
    throw Error("Atividade inválida");
  for (const n of [
    "distanceKm",
    "ascentM",
    "durationH",
    "observedWh",
    "predictedWh",
    "motorInputWh",
    "auxWh",
  ] as const)
    if (!Number.isFinite(v[n]) || v[n] < 0)
      throw Error(`Atividade inválida: ${n}`);
  if (
    v.distanceKm <= 0 ||
    v.durationH <= 0 ||
    v.observedWh <= 0 ||
    v.predictedWh <= 0 ||
    v.motorInputWh <= 0 ||
    v.observedWh > 3000 ||
    v.distanceKm > 1000 ||
    v.ascentM > 20000
  )
    throw Error("Atividade fora dos limites");
  if (
    !Number.isFinite(v.startSoc) ||
    !Number.isFinite(v.endSoc) ||
    v.startSoc > 100 ||
    v.endSoc < 0 ||
    v.endSoc >= v.startSoc
  )
    throw Error("Estados de carga inválidos");
  if (v.source !== "medido" && v.source !== "percentagem")
    throw Error("Origem de medição inválida");
  if (
    v.source === "medido" &&
    (!Number.isFinite(v.measuredWh) || v.measuredWh !== v.observedWh)
  )
    throw Error("Medição Wh inválida");
  validateSettings(v.settings);
  validateRoute(v.route);
}
export function parseActivities(json: string): Activity[] {
  if (new TextEncoder().encode(json).length > 20 * 1024 * 1024)
    throw Error("Importação excede 20 MB");
  const value = JSON.parse(json);
  if (!Array.isArray(value) || value.length > 2000)
    throw Error("Esperada lista de até 2000 atividades");
  value.forEach(validateActivity);
  return value;
}
export async function importActivities(values: Activity[]) {
  values.forEach(validateActivity);
  const d = await db();
  const tx = d.transaction("activities", "readwrite");
  for (const v of values) await tx.store.put(v);
  await tx.done;
}
export interface SavedSimulation {
  at: string;
  name: string;
  distanceKm: number;
  wh: number;
  arrivalSoc: number;
}
export async function listSimulations(): Promise<SavedSimulation[]> {
  return (await (await db()).get("settings", "simulations")) ?? [];
}
export async function saveSimulation(v: SavedSimulation) {
  const d = await db();
  const tx = d.transaction("settings", "readwrite");
  const all: SavedSimulation[] = (await tx.store.get("simulations")) ?? [];
  await tx.store.put([v, ...all].slice(0, 10), "simulations");
  await tx.done;
}
export async function getWorkspace(): Promise<Workspace | null> {
  const value = await (await db()).get("settings", "workspace");
  if (value) validateWorkspace(value);
  return value ?? null;
}
export async function saveWorkspace(settings: Settings, workspace: Workspace) {
  validateSettings(settings);
  validateWorkspace(workspace);
  const d = await db();
  const tx = d.transaction("settings", "readwrite");
  await tx.store.put(settings, "current");
  await tx.store.put(workspace, "workspace");
  await tx.done;
}
export interface SavedRoute {
  id: string;
  route: Route;
  createdAt: string;
  updatedAt: string;
}
export async function listRoutes(): Promise<SavedRoute[]> {
  return (await (await db()).getAll("routes")).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export async function saveRoute(route: Route): Promise<{
  entry: SavedRoute;
  duplicate: boolean;
}> {
  const identity = routeIdentity(route),
    base = routeHash(identity),
    now = new Date().toISOString();
  const d = await db(),
    tx = d.transaction("routes", "readwrite");
  let suffix = 0;
  while (true) {
    const id = suffix ? `${base}-${suffix}` : base;
    const existing: SavedRoute | undefined = await tx.store.get(id);
    if (!existing) {
      if ((await tx.store.count()) >= 1000) {
        await tx.done;
        throw Error(
          "Biblioteca limitada a 1000 percursos. Exporte um backup antes de remover percursos antigos.",
        );
      }
      const entry = { id, route, createdAt: now, updatedAt: now };
      await tx.store.put(entry);
      await tx.done;
      return { entry, duplicate: false };
    }
    // Hashes are only an index hint. Exact equality prevents collision-induced loss.
    if (routeIdentity(existing.route) === identity) {
      await tx.done;
      return { entry: existing, duplicate: true };
    }
    suffix++;
  }
}
export async function renameRoute(id: string, name: string) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 200)
    throw Error("Nome de percurso inválido");
  const d = await db(),
    tx = d.transaction("routes", "readwrite");
  const entry: SavedRoute | undefined = await tx.store.get(id);
  if (!entry) throw Error("Percurso não encontrado");
  await tx.store.put({
    ...entry,
    route: { ...entry.route, name: name.trim() },
    updatedAt: new Date().toISOString(),
  });
  await tx.done;
}
export async function deleteRoute(id: string) {
  await (await db()).delete("routes", id);
}
