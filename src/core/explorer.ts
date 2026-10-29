import type { Route } from "./model";
import { haversine } from "./gpx";
export interface TrackVertex {
  lat: number;
  lon: number;
  x: number;
  y: number;
  distanceM: number;
  altitude: number | null;
  originalAltitude: number | null;
  breakBefore: boolean;
}
export interface TrackEdge {
  a: number;
  b: number;
  startM: number;
  lengthM: number;
  modelSegment: number | null;
}
export interface PreparedTrack {
  vertices: TrackVertex[];
  edges: TrackEdge[];
  distanceM: number;
  energyCompatible: boolean;
  grid: Map<string, number[]>;
  drawIndices: number[];
}
export interface TrackSelection {
  edge: number;
  fraction: number;
}
export interface TrackPosition {
  lat: number;
  lon: number;
  x: number;
  y: number;
  distanceM: number;
  altitude: number | null;
  originalAltitude: number | null;
  interpolated: boolean;
}
const CELL = 32;
export function prepareTrack(route: Route): PreparedTrack {
  const points = route.points ?? [],
    vertices: TrackVertex[] = [],
    edges: TrackEdge[] = [];
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const p of points) {
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }
  const cos = Math.max(
    0.01,
    Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180),
  );
  const scale = Math.min(
    920 / Math.max((maxLon - minLon) * cos, 0.000001),
    420 / Math.max(maxLat - minLat, 0.000001),
  );
  const width = (maxLon - minLon) * cos * scale,
    height = (maxLat - minLat) * scale;
  let distanceM = 0,
    modelIndex = 0,
    energyCompatible = points.length > 1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      broken = i === 0 || !!p.breakBefore;
    if (i && !broken) {
      const d = haversine(points[i - 1], p);
      if (d > 1e-6) {
        const segment = route.segments[modelIndex];
        const match = !!segment && Math.abs(segment.distanceM - d) < 0.05;
        energyCompatible &&= match;
        edges.push({
          a: i - 1,
          b: i,
          startM: distanceM,
          lengthM: d,
          modelSegment: match ? modelIndex : null,
        });
        distanceM += d;
        modelIndex++;
      }
    }
    vertices.push({
      lat: p.lat,
      lon: p.lon,
      x: (1000 - width) / 2 + (p.lon - minLon) * cos * scale,
      y: (500 + height) / 2 - (p.lat - minLat) * scale,
      distanceM,
      altitude: p.ele ?? null,
      originalAltitude: p.originalEle ?? p.ele ?? null,
      breakBefore: broken,
    });
  }
  energyCompatible &&= modelIndex === route.segments.length;
  const grid = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const a = vertices[edge.a],
      b = vertices[edge.b];
    for (
      let x = Math.floor(Math.min(a.x, b.x) / CELL);
      x <= Math.floor(Math.max(a.x, b.x) / CELL);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) / CELL);
        y <= Math.floor(Math.max(a.y, b.y) / CELL);
        y++
      ) {
        const key = `${x},${y}`,
          bucket = grid.get(key) ?? [];
        bucket.push(index);
        grid.set(key, bucket);
      }
  });
  const stride = Math.max(1, Math.ceil(vertices.length / 4000)),
    drawIndices: number[] = [];
  for (let i = 0; i < vertices.length; i++)
    if (
      i % stride === 0 ||
      i === vertices.length - 1 ||
      vertices[i].breakBefore ||
      vertices[i + 1]?.breakBefore ||
      (i > 0 &&
        (vertices[i].altitude === null) !==
          (vertices[i - 1].altitude === null)) ||
      (i + 1 < vertices.length &&
        (vertices[i].altitude === null) !== (vertices[i + 1].altitude === null))
    )
      drawIndices.push(i);
  return { vertices, edges, distanceM, energyCompatible, grid, drawIndices };
}
export function positionAt(
  track: PreparedTrack,
  selection: TrackSelection,
): TrackPosition | null {
  const e = track.edges[selection.edge];
  if (!e) return null;
  const t = Math.max(0, Math.min(1, selection.fraction)),
    a = track.vertices[e.a],
    b = track.vertices[e.b];
  const interpolate = (x: number, y: number) => x + (y - x) * t;
  const altitude =
    t === 0
      ? a.altitude
      : t === 1
        ? b.altitude
        : a.altitude !== null && b.altitude !== null
          ? interpolate(a.altitude, b.altitude)
          : null;
  const originalAltitude =
    t === 0
      ? a.originalAltitude
      : t === 1
        ? b.originalAltitude
        : a.originalAltitude !== null && b.originalAltitude !== null
          ? interpolate(a.originalAltitude, b.originalAltitude)
          : null;
  return {
    lat: interpolate(a.lat, b.lat),
    lon: interpolate(a.lon, b.lon),
    x: interpolate(a.x, b.x),
    y: interpolate(a.y, b.y),
    distanceM: e.startM + e.lengthM * t,
    altitude,
    originalAltitude,
    interpolated: t > 0 && t < 1,
  };
}
export function selectionAtDistance(
  track: PreparedTrack,
  distanceM: number,
  current?: TrackSelection,
): TrackSelection {
  const requested = Math.max(0, Math.min(track.distanceM, distanceM)),
    d =
      Math.abs(requested - track.distanceM) < 1e-6
        ? track.distanceM
        : requested;
  if (current) {
    const e = track.edges[current.edge];
    if (e && d >= e.startM && d <= e.startM + e.lengthM)
      return { edge: current.edge, fraction: (d - e.startM) / e.lengthM };
  }
  let lo = 0,
    hi = track.edges.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (track.edges[m].startM + track.edges[m].lengthM < d) lo = m + 1;
    else hi = m;
  }
  const e = track.edges[lo];
  return {
    edge: lo,
    fraction: e ? Math.max(0, Math.min(1, (d - e.startM) / e.lengthM)) : 0,
  };
}
export function nearestTrack(
  track: PreparedTrack,
  x: number,
  y: number,
  current?: TrackSelection,
  radius = 25,
) {
  const ids = new Set<number>();
  for (
    let gx = Math.floor((x - radius) / CELL);
    gx <= Math.floor((x + radius) / CELL);
    gx++
  )
    for (
      let gy = Math.floor((y - radius) / CELL);
      gy <= Math.floor((y + radius) / CELL);
      gy++
    )
      for (const i of track.grid.get(`${gx},${gy}`) ?? []) ids.add(i);
  const candidates: {
    selection: TrackSelection;
    distance: number;
    along: number;
  }[] = [];
  for (const index of ids) {
    const e = track.edges[index],
      a = track.vertices[e.a],
      b = track.vertices[e.b],
      dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      ),
      d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
    if (d <= radius)
      candidates.push({
        selection: { edge: index, fraction: t },
        distance: d,
        along: e.startM + e.lengthM * t,
      });
  }
  if (!candidates.length)
    return { selection: null, alternatives: [] as TrackSelection[] };
  // Compare distinct local passages, not every dense adjacent segment.
  // Otherwise continuity could pull a selection kilometres away from the
  // actual projection on a long, heavily sampled straight line.
  const byIndex = new Map(candidates.map((c) => [c.selection.edge, c]));
  const minima = candidates.filter((c) => {
    const i = c.selection.edge,
      e = track.edges[i];
    const before =
      track.edges[i - 1]?.b === e.a ? byIndex.get(i - 1) : undefined;
    const after =
      track.edges[i + 1]?.a === e.b ? byIndex.get(i + 1) : undefined;
    return (
      c.distance <= (before?.distance ?? Infinity) + 1e-9 &&
      c.distance <= (after?.distance ?? Infinity) + 1e-9
    );
  });
  const passages = minima.length ? minima : candidates;
  const best = passages.reduce((m, c) => Math.min(m, c.distance), Infinity),
    near = passages.filter(
      (c) => c.distance <= best + Math.min(3, radius * 0.15),
    );
  const previous = current ? positionAt(track, current)?.distanceM : undefined;
  near.sort((a, b) =>
    previous === undefined
      ? a.distance - b.distance
      : Math.abs(a.along - previous) - Math.abs(b.along - previous),
  );
  const distinct: typeof near = [];
  for (const c of near)
    if (!distinct.some((n) => Math.abs(n.along - c.along) < 30))
      distinct.push(c);
  return {
    selection: near[0].selection,
    alternatives: distinct.slice(0, 8).map((c) => c.selection),
  };
}
export function energyAt(
  distanceM: number,
  energy: { distanceM: number; remainingWh: number }[],
  capacityWh: number,
): number | null {
  if (!energy.length || capacityWh <= 0) return null;
  let lo = 0,
    hi = energy.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (energy[m].distanceM < distanceM) lo = m + 1;
    else hi = m;
  }
  const b = energy[lo],
    a = energy[Math.max(0, lo - 1)],
    t =
      b.distanceM === a.distanceM
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              (distanceM - a.distanceM) / (b.distanceM - a.distanceM),
            ),
          );
  return Math.max(
    0,
    Math.min(
      100,
      ((a.remainingWh + (b.remainingWh - a.remainingWh) * t) / capacityWh) *
        100,
    ),
  );
}
