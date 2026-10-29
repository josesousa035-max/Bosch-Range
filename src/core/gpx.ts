import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Route, Segment } from "./model";
export const MAX_GPX_BYTES = 12 * 1024 * 1024;
export function haversine(
  a: {
    lat: number;
    lon: number;
  },
  b: {
    lat: number;
    lon: number;
  },
) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function bearing(
  a: {
    lat: number;
    lon: number;
  },
  b: {
    lat: number;
    lon: number;
  },
) {
  const r = Math.PI / 180;
  return (
    (Math.atan2(
      Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r),
      Math.cos(a.lat * r) * Math.sin(b.lat * r) -
        Math.sin(a.lat * r) *
          Math.cos(b.lat * r) *
          Math.cos((b.lon - a.lon) * r),
    ) /
      r +
      360) %
    360
  );
}
export function parseGpx(xml: string): Route {
  if (new TextEncoder().encode(xml).length > MAX_GPX_BYTES)
    throw Error("GPX excede 12 MB");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error("Declarações DTD/ENTITY não são permitidas");
  if (XMLValidator.validate(xml) !== true)
    throw Error("Ficheiro XML/GPX inválido");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    isArray: (name: string) =>
      ["trk", "trkseg", "trkpt", "rte", "rtept", "name"].includes(name),
  });
  const document = parser.parse(xml),
    root = document.gpx;
  if (!root || typeof root !== "object")
    throw Error("Ficheiro XML/GPX inválido");
  const groups: Record<string, unknown>[][] = (root.trk ?? []).flatMap(
    (t: Record<string, any>) =>
      (t.trkseg ?? []).map((s: Record<string, any>) => s.trkpt ?? []),
  );
  if (!groups.length)
    for (const rte of root.rte ?? []) groups.push(rte.rtept ?? []);
  const value = (v: unknown): string | undefined =>
    typeof v === "string" || typeof v === "number"
      ? String(v)
      : v && typeof v === "object"
        ? value((v as Record<string, unknown>)["#text"])
        : undefined;
  const routeName = value(
    root.trk?.[0]?.name?.[0] ??
      root.rte?.[0]?.name?.[0] ??
      root.metadata?.name?.[0],
  );
  const points: NonNullable<Route["points"]> = [],
    warnings: string[] = [];
  let missing = 0,
    removed = 0,
    altitudeSpikes = 0,
    rawCount = 0;
  const segments: Segment[] = [];
  for (const group of groups) {
    const nodes = group;
    rawCount += nodes.length;
    if (rawCount > 100000) throw Error("GPX excede 100 000 pontos");
    const raw = nodes.map((n) => {
      const latText = value(n["@_lat"]),
        lonText = value(n["@_lon"]);
      const lat = Number(latText),
        lon = Number(lonText),
        e = value(n.ele);
      if (
        latText == null ||
        lonText == null ||
        latText.trim() === "" ||
        lonText.trim() === "" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw Error("Coordenadas GPS inválidas");
      const ele = e != null && e.trim() !== "" ? Number(e) : undefined;
      if (
        ele !== undefined &&
        (!Number.isFinite(ele) || ele < -500 || ele > 9000)
      )
        throw Error("Elevação inválida");
      if (ele === undefined) missing++;
      return { lat, lon, ele, originalEle: ele };
    });
    // Median of three only removes isolated altimetric impulses; endpoints retained.
    const clean = raw.map((p, i) => {
      if (
        i === 0 ||
        i === raw.length - 1 ||
        p.ele === undefined ||
        raw[i - 1].ele === undefined ||
        raw[i + 1].ele === undefined
      )
        return { ...p };
      const prev = raw[i - 1].ele!,
        next = raw[i + 1].ele!;
      const median = [prev, p.ele, next].sort((a, b) => a - b)[1];
      const impulse =
        Math.abs(prev - next) < 5 &&
        Math.abs(p.ele - median) >
          Math.max(
            25,
            Math.min(haversine(raw[i - 1], p), haversine(p, raw[i + 1])) * 0.25,
          );
      if (impulse) altitudeSpikes++;
      return { ...p, ele: impulse ? median : p.ele };
    });
    let anchor = clean[0];
    if (!anchor) continue;
    points.push({ ...anchor, breakBefore: true });
    let previous = anchor;
    let firstSegment = true;
    for (let i = 1; i < clean.length; i++) {
      const p = clean[i];
      // GPS spike: long excursion immediately returning near preceding location.
      if (
        i < clean.length - 1 &&
        haversine(previous, p) > 300 &&
        haversine(previous, clean[i + 1]) < 50
      ) {
        removed++;
        continue;
      }
      const step = haversine(previous, p);
      if (step > 5000)
        throw Error("Salto GPS superior a 5 km; divida ou corrija o percurso");
      previous = p;
      const d = haversine(anchor, p);
      if (d < 10 && i < clean.length - 1) continue;
      if (d < 0.2) continue;
      let rise =
        anchor.ele !== undefined && p.ele !== undefined
          ? p.ele - anchor.ele
          : 0;
      if (Math.abs(rise / d) > 0.6)
        throw Error("Inclinação GPS superior a 60%; dados suspeitos");
      // 2 m hysteresis: retain anchor elevation until meaningful elevation change.
      let adjusted = { ...p };
      if (
        anchor.ele !== undefined &&
        p.ele !== undefined &&
        Math.abs(rise) < 2 &&
        i < clean.length - 1
      ) {
        rise = 0;
        adjusted.ele = anchor.ele;
      }
      segments.push({
        distanceM: d,
        riseM: rise,
        bearingDeg: bearing(anchor, p),
        elevationM: anchor.ele,
        breakBefore: firstSegment && segments.length > 0,
      });
      firstSegment = false;
      points.push(adjusted);
      anchor = adjusted;
    }
  }
  if (!segments.length)
    throw Error(
      "São necessários pelo menos dois pontos distintos num track/route GPX",
    );
  if (missing)
    warnings.push(
      "Elevação incompleta: segmentos sem pares de cotas são tratados como planos; consumo poderá estar subestimado.",
    );
  if (groups.length > 1)
    warnings.push(
      "Vários segmentos GPX: intervalos entre segmentos não são ligados nem contabilizados.",
    );
  if (altitudeSpikes)
    warnings.push(
      `${altitudeSpikes} impulsos altimétricos isolados corrigidos; confirme o perfil em subidas curtas e íngremes.`,
    );
  if (removed) warnings.push(`${removed} picos GPS isolados removidos.`);
  warnings.push(
    "Piso definido pelo utilizador; não inferido a partir do GPS. Intervalo heurístico, sem garantia estatística.",
  );
  return {
    name: routeName?.slice(0, 150) || "Percurso GPX",
    segments,
    points,
    elevationComplete: missing === 0,
    warnings,
  };
}
export function climbs(route: Route) {
  const results: {
    startKm: number;
    distanceKm: number;
    riseM: number;
  }[] = [];
  let km = 0,
    start = 0,
    distance = 0,
    rise = 0;
  const flush = () => {
    if (distance >= 500 && rise >= 20)
      results.push({
        startKm: start,
        distanceKm: distance / 1000,
        riseM: rise,
      });
    distance = 0;
    rise = 0;
  };
  for (const s of route.segments) {
    if (s.riseM / s.distanceM >= 0.02) {
      if (!distance) start = km;
      distance += s.distanceM;
      rise += s.riseM;
    } else flush();
    km += s.distanceM / 1000;
  }
  flush();
  return results;
}
export function splitStages(route: Route, count: number): Route[] {
  if (!Number.isInteger(count) || count < 1 || count > 30)
    throw Error("Etapas: 1–30");
  const target = route.segments.reduce((a, s) => a + s.distanceM, 0) / count;
  const groups: Segment[][] = Array.from({ length: count }, () => []);
  let stage = 0,
    done = 0;
  for (const s of route.segments) {
    let left = s.distanceM;
    while (left > 1e-6) {
      const take = stage === count - 1 ? left : Math.min(left, target - done);
      groups[stage].push({
        ...s,
        distanceM: take,
        riseM: (s.riseM * take) / s.distanceM,
        elevationM:
          s.elevationM === undefined
            ? undefined
            : s.elevationM + (s.riseM * (s.distanceM - left)) / s.distanceM,
        breakBefore: s.breakBefore && left === s.distanceM,
      });
      left -= take;
      done += take;
      if (done >= target - 1e-6 && stage < count - 1) {
        stage++;
        done = 0;
      }
    }
  }
  return groups
    .filter((g) => g.length)
    .map((segments, i) => ({
      ...route,
      name: `${route.name} · etapa ${i + 1}`,
      segments,
      points: undefined,
    }));
}
