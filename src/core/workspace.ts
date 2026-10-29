import { manualRoute, rolling, type Route } from "./model";
export const screenNames = [
  "Dashboard",
  "Simulador rápido",
  "Planeador GPX",
  "Comparador",
  "Os meus passeios",
  "Calibração",
  "Definições",
  "Planear",
  "Evolução",
  "A minha bicicleta",
] as const;
export interface DraftActivity {
  name: string;
  date: string;
  durationH: number;
  startSoc: number;
  endSoc: number;
  measuredWh: number;
  notes: string;
}
export interface Workspace {
  planner?: { name: string; date: string; notes: string; parentId?: string };
  tab: string;
  distance: number;
  ascent: number;
  gpx: Route | null;
  useGpx: boolean;
  days: number;
  recharge: boolean;
  stageSoc: Record<string, number>;
  activity: DraftActivity;
  dark: boolean;
  advanced: boolean;
}
function number(
  v: unknown,
  min: number,
  max: number,
  label: string,
): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error(`Valor inválido: ${label}`);
}
function text(v: unknown, max: number, label: string): asserts v is string {
  if (typeof v !== "string" || v.length > max)
    throw Error(`Texto inválido: ${label}`);
}
function flag(v: unknown, label: string) {
  if (typeof v !== "boolean") throw Error(`Opção inválida: ${label}`);
}
/** Validate nested route data before it reaches physics, SVG or IndexedDB. */
export function validateRoute(r: Route) {
  if (!r || typeof r !== "object") throw Error("Percurso inválido");
  text(r.name, 200, "nome do percurso");
  flag(r.elevationComplete, "altimetria");
  if (!Array.isArray(r.warnings) || r.warnings.length > 100)
    throw Error("Avisos do percurso inválidos");
  r.warnings.forEach((w) => text(w, 1000, "aviso"));
  if (
    !Array.isArray(r.segments) ||
    r.segments.length < 1 ||
    r.segments.length > 100000
  )
    throw Error("Segmentos do percurso inválidos");
  for (const s of r.segments) {
    if (!s || typeof s !== "object") throw Error("Segmento inválido");
    number(s.distanceM, 0.000001, 100000, "distância do segmento");
    number(s.riseM, -60000, 60000, "desnível");
    if (Math.abs(s.riseM / s.distanceM) > 0.6)
      throw Error("Inclinação de segmento inválida");
    if (s.terrain !== undefined && !Object.hasOwn(rolling, s.terrain))
      throw Error("Piso de segmento inválido");
    if (s.bearingDeg !== undefined) number(s.bearingDeg, 0, 360, "rumo");
    if (s.elevationM !== undefined) number(s.elevationM, -500, 100000, "cota");
    if (s.breakBefore !== undefined) flag(s.breakBefore, "separação");
    if (s.stage !== undefined) {
      number(s.stage, 0, 1000, "etapa");
      if (!Number.isInteger(s.stage)) throw Error("Etapa inválida");
    }
  }
  if (r.points !== undefined) {
    if (!Array.isArray(r.points) || r.points.length > 100000)
      throw Error("Pontos GPS inválidos");
    for (const p of r.points) {
      if (!p || typeof p !== "object") throw Error("Ponto GPS inválido");
      number(p.lat, -90, 90, "latitude");
      number(p.lon, -180, 180, "longitude");
      if (p.originalEle !== undefined)
        number(p.originalEle, -500, 9000, "elevação original");
      if (p.ele !== undefined) number(p.ele, -500, 9000, "elevação GPS");
      if (p.breakBefore !== undefined) flag(p.breakBefore, "separação GPS");
    }
  }
}
export function validateWorkspace(w: Workspace) {
  if (
    !w ||
    typeof w !== "object" ||
    !screenNames.includes(w.tab as (typeof screenNames)[number])
  )
    throw Error("Sessão inválida");
  manualRoute(w.distance, w.ascent, "compactado");
  flag(w.useGpx, "percurso ativo");
  flag(w.recharge, "recarga");
  flag(w.dark, "tema");
  flag(w.advanced, "modo avançado");
  if (w.gpx !== null) validateRoute(w.gpx);
  if (w.useGpx && !w.gpx) throw Error("Sessão GPX sem percurso");
  number(w.days, 1, 30, "número de etapas");
  if (!Number.isInteger(w.days)) throw Error("Número de etapas inválido");
  if (
    !w.stageSoc ||
    typeof w.stageSoc !== "object" ||
    Array.isArray(w.stageSoc) ||
    Object.keys(w.stageSoc).length > 30
  )
    throw Error("Cargas por etapa inválidas");
  for (const [key, value] of Object.entries(w.stageSoc)) {
    if (!/^(?:[0-9]|[12][0-9])$/.test(key))
      throw Error("Índice de etapa inválido");
    number(value, 0, 100, "carga de etapa");
  }
  if (w.planner) {
    text(w.planner.name, 200, "nome do plano");
    text(w.planner.date, 10, "data do plano");
    text(w.planner.notes, 5000, "notas do plano");
    if (w.planner.parentId !== undefined)
      text(w.planner.parentId, 200, "plano original");
  }
  const a = w.activity;
  if (!a || typeof a !== "object") throw Error("Rascunho de passeio inválido");
  text(a.name, 200, "nome do passeio");
  text(a.notes, 5000, "observações");
  text(a.date, 10, "data");
  if (
    a.date !== "" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) ||
      !Number.isFinite(Date.parse(a.date)))
  )
    throw Error("Data de rascunho inválida");
  number(a.durationH, 0, 100, "duração");
  number(a.startSoc, 0, 100, "SOC inicial");
  number(a.endSoc, 0, 100, "SOC final");
  number(a.measuredWh, 0, 3000, "Wh medidos");
}
/** Canonical geometry identity, independent of filename and object property order. */
export function routeIdentity(r: Route) {
  validateRoute(r);
  return JSON.stringify({
    elevationComplete: r.elevationComplete,
    segments: r.segments.map((s) => [
      s.distanceM,
      s.riseM,
      s.bearingDeg ?? null,
      s.terrain ?? null,
      s.elevationM ?? null,
      s.breakBefore ?? false,
      s.stage ?? null,
    ]),
    points:
      r.points?.map((p) => [
        p.lat,
        p.lon,
        p.ele ?? null,
        p.breakBefore ?? false,
      ]) ?? null,
  });
}
export function routeHash(identity: string) {
  let h = 2166136261;
  for (let i = 0; i < identity.length; i++) {
    h ^= identity.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `route-${(h >>> 0).toString(16)}`;
}
