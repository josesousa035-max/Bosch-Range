import { validateJourney, type Journey } from "./journeys";
import { defaults, validateSettings, type Settings } from "./model";
import { validateWorkspace, validateRoute, type Workspace } from "./workspace";
import {
  openDatabase,
  validateActivity,
  type Activity,
  type Adjustment,
  type SavedRoute,
  type SavedSimulation,
} from "./storage";
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export interface Backup {
  format: "bosch-range-lab-backup";
  version: 1 | 2;
  journeys?: Journey[];
  createdAt: string;
  appVersion: string;
  settings: Settings;
  workspace: Workspace | null;
  activities: Activity[];
  adjustments: Adjustment[];
  routes: SavedRoute[];
  simulations: SavedSimulation[];
}
function timestamp(v: unknown) {
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
    throw Error("Data inválida no backup");
}
function text(v: unknown, max: number) {
  if (typeof v !== "string" || !v || v.length > max)
    throw Error("Texto inválido no backup");
}
function list(v: unknown, max: number): asserts v is unknown[] {
  if (!Array.isArray(v) || v.length > max)
    throw Error("Lista inválida ou demasiado extensa no backup");
}
function finite(v: unknown, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error("Número inválido no backup");
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length)
    throw Error("IDs repetidos dentro do backup");
}
export function validateBackup(b: Backup) {
  if (
    !b ||
    b.format !== "bosch-range-lab-backup" ||
    ![1, 2].includes(b.version)
  )
    throw Error("Formato ou versão de backup não suportados");
  if (b.version === 2 && !Array.isArray(b.journeys))
    throw Error("Passeios em falta no backup");
  if (b.journeys !== undefined) {
    list(b.journeys, 2000);
    b.journeys.forEach(validateJourney);
    unique(b.journeys.map((j) => j.id));
  }
  timestamp(b.createdAt);
  text(b.appVersion, 50);
  validateSettings(b.settings);
  if (b.workspace !== null) validateWorkspace(b.workspace);
  list(b.activities, 2000);
  b.activities.forEach(validateActivity);
  unique(b.activities.map((a) => a.id));
  list(b.routes, 1000);
  for (const r of b.routes) {
    if (!r) throw Error("Percurso guardado inválido");
    text(r.id, 200);
    timestamp(r.createdAt);
    timestamp(r.updatedAt);
    validateRoute(r.route);
  }
  unique(b.routes.map((r) => r.id));
  list(b.adjustments, 10000);
  for (const a of b.adjustments) {
    if (!a) throw Error("Ajuste inválido");
    timestamp(a.at);
    finite(a.factor, 0.7, 1.3);
    text(a.reason, 1000);
    list(a.trainingIds, 2000);
    list(a.validationIds, 2000);
    a.trainingIds.forEach((id) => text(id, 200));
    a.validationIds.forEach((id) => text(id, 200));
    if (a.trainingIds.some((id) => a.validationIds.includes(id)))
      throw Error("Treino e validação sobrepostos no backup");
  }
  unique(b.adjustments.map((a) => a.at));
  list(b.simulations, 10);
  for (const s of b.simulations) {
    if (!s) throw Error("Simulação inválida");
    timestamp(s.at);
    text(s.name, 200);
    finite(s.distanceKm, 0.000001, 1000000);
    finite(s.wh, 0, 1e8);
    finite(s.arrivalSoc, 0, 100);
  }
}
export function parseBackup(json: string): Backup {
  if (new TextEncoder().encode(json).length > MAX_BACKUP_BYTES)
    throw Error("Backup excede 50 MB");
  const backup = JSON.parse(json);
  validateBackup(backup);
  return backup;
}
export async function createBackup(): Promise<Backup> {
  const d = await openDatabase(),
    tx = d.transaction(
      ["settings", "activities", "adjustments", "routes", "journeys"],
      "readonly",
    );
  const [
    settings,
    workspace,
    activities,
    adjustments,
    routes,
    simulations,
    journeys,
  ] = await Promise.all([
    tx.objectStore("settings").get("current"),
    tx.objectStore("settings").get("workspace"),
    tx.objectStore("activities").getAll(),
    tx.objectStore("adjustments").getAll(),
    tx.objectStore("routes").getAll(),
    tx.objectStore("settings").get("simulations"),
    tx.objectStore("journeys").getAll(),
  ]);
  await tx.done;
  const backup: Backup = {
    format: "bosch-range-lab-backup",
    version: 2,
    journeys,
    createdAt: new Date().toISOString(),
    appVersion: "3.0.0",
    settings: settings ?? { ...defaults },
    workspace: workspace ?? null,
    activities,
    adjustments,
    routes,
    simulations: simulations ?? [],
  };
  validateBackup(backup);
  if (
    new TextEncoder().encode(JSON.stringify(backup)).length > MAX_BACKUP_BYTES
  )
    throw Error("Os dados excedem o limite de backup de 50 MB");
  return backup;
}
/** Add records only: conflicts keep the local snapshot. Preferences/session are opt-in. */
export async function restoreBackup(input: Backup, restorePreferences = false) {
  // Validate again: callers may pass an object instead of a parsed file.
  const backup = parseBackup(JSON.stringify(input));
  const d = await openDatabase(),
    tx = d.transaction(
      ["settings", "activities", "adjustments", "routes", "journeys"],
      "readwrite",
    );
  let added = 0,
    kept = 0;
  try {
    const groups = [
      ["activities", backup.activities, "id", 2000],
      ["adjustments", backup.adjustments, "at", 10000],
      ["routes", backup.routes, "id", 1000],
      ["journeys", backup.journeys ?? [], "id", 2000],
    ] as const;
    for (const [store, rows, key, limit] of groups) {
      const target = tx.objectStore(store),
        existing = new Set(await target.getAllKeys());
      const incoming = rows.filter(
        (row) => !existing.has((row as unknown as Record<string, string>)[key]),
      ).length;
      if (existing.size + incoming > limit)
        throw Error(
          `Limite de registos excedido: ${store}. Nenhum registo foi importado.`,
        );
    }
    for (const [store, rows, key] of groups) {
      for (const row of rows) {
        const id = (row as unknown as Record<string, string>)[key];
        const target = tx.objectStore(store);
        if ((await target.getKey(id)) !== undefined) {
          kept++;
          continue;
        }
        await target.add(row);
        added++;
      }
    }
    const local: SavedSimulation[] =
      (await tx.objectStore("settings").get("simulations")) ?? [];
    const merged = [
      ...local,
      ...backup.simulations.filter((s) => !local.some((r) => r.at === s.at)),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 10);
    await tx.objectStore("settings").put(merged, "simulations");
    if (restorePreferences) {
      await tx.objectStore("settings").put(backup.settings, "current");
      if (backup.workspace)
        await tx.objectStore("settings").put(backup.workspace, "workspace");
    }
    await tx.done;
    return { added, kept };
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
