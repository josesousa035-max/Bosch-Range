import { describe, it, expect } from "vitest";
import { parseGpx } from "../src/core/gpx";
import {
  prepareTrack,
  positionAt,
  selectionAtDistance,
  nearestTrack,
  energyAt,
} from "../src/core/explorer";
function gpx(points: string) {
  return `<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`;
}
const point = (lat: number, lon: number, ele?: number) =>
  `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? "" : `<ele>${ele}</ele>`}</trkpt>`;
describe("Uma seleção para mapa e perfil", () => {
  it("interpola distância e altitude com tolerância de 1 cm, incluindo zero e cotas negativas", () => {
    const r = parseGpx(
        gpx(point(0, 0, -10) + point(0, 0.001, 0) + point(0, 0.002, 10)),
      ),
      t = prepareTrack(r),
      s = selectionAtDistance(t, t.edges[0].lengthM / 2),
      p = positionAt(t, s)!;
    expect(p.distanceM).toBeCloseTo(55.5974633, 2);
    expect(p.altitude).toBe(-5);
    expect(p.originalAltitude).toBe(-5);
    expect(p.interpolated).toBe(true);
    expect(positionAt(t, { edge: 0, fraction: 1 })!.altitude).toBe(0);
  });
  it("projeção na linha devolve o mesmo segmento e altitude do gráfico", () => {
    const t = prepareTrack(
      parseGpx(
        gpx(point(0, 0, 100) + point(0, 0.001, 120) + point(0.001, 0.001, 140)),
      ),
    );
    const s = selectionAtDistance(t, t.distanceM * 0.37),
      p = positionAt(t, s)!;
    const hit = nearestTrack(t, p.x, p.y, s);
    const q = positionAt(t, hit.selection!)!;
    expect(q.distanceM).toBeCloseTo(p.distanceM, 6);
    expect(q.altitude).toBeCloseTo(p.altitude!, 6);
  });
  it("não inventa altitude nem interpola através de extremos desconhecidos", () => {
    const t = prepareTrack(
      parseGpx(gpx(point(0, 0, 0) + point(0, 0.001) + point(0, 0.002, -2))),
    );
    expect(positionAt(t, { edge: 0, fraction: 0.5 })!.altitude).toBeNull();
    expect(positionAt(t, { edge: 0, fraction: 0 })!.altitude).toBe(0);
    expect(positionAt(t, { edge: 1, fraction: 1 })!.altitude).toBe(-2);
  });
  it("tracks separados não criam uma aresta nem uma rampa entre cotas", () => {
    const r = parseGpx(
        `<gpx><trk><trkseg>${point(0, 0, 0) + point(0, 0.001, 10)}</trkseg><trkseg>${point(10, 10, 1000) + point(10, 10.001, 1010)}</trkseg></trk></gpx>`,
      ),
      t = prepareTrack(r);
    expect(t.edges).toHaveLength(2);
    expect(t.distanceM).toBeLessThan(230);
    expect(positionAt(t, { edge: 1, fraction: 0 })!.altitude).toBe(1000);
    expect(t.vertices[2].breakBefore).toBe(true);
    expect(t.energyCompatible).toBe(true);
  });
  it("cruzamentos e sobreposições mantêm continuidade e permitem outra passagem", () => {
    const t = prepareTrack(
      parseGpx(
        gpx(
          point(0, 0, 0) +
            point(0, 0.002, 2) +
            point(0.001, 0.002, 3) +
            point(0.001, 0, 2) +
            point(0, 0, 0) +
            point(0, 0.002, 2),
        ),
      ),
    );
    const first = positionAt(t, { edge: 0, fraction: 0.5 })!,
      later = { edge: 4, fraction: 0.5 };
    const hit = nearestTrack(t, first.x, first.y, later);
    expect(hit.selection!.edge).toBe(4);
    expect(hit.alternatives.length).toBeGreaterThan(1);
    expect(
      positionAt(
        t,
        hit.alternatives.find((s) => s.edge === 0)!,
      )!.distanceM,
    ).toBeLessThan(positionAt(t, later)!.distanceM);
  });
  it("circuito fechado mantém último km separado do início", () => {
    const t = prepareTrack(
      parseGpx(
        gpx(
          point(0, 0, 0) +
            point(0, 0.001, 0) +
            point(0.001, 0.001, 0) +
            point(0, 0, 0),
        ),
      ),
    );
    const a = positionAt(t, { edge: 0, fraction: 0 })!,
      b = positionAt(t, selectionAtDistance(t, t.distanceM))!;
    expect(a.lat).toBeCloseTo(b.lat);
    expect(a.lon).toBeCloseTo(b.lon);
    expect(b.distanceM).toBeGreaterThan(300);
  });
  it("interpola apenas energia de uma previsão compatível", () => {
    expect(
      energyAt(
        50,
        [
          { distanceM: 0, remainingWh: 800 },
          { distanceM: 100, remainingWh: 600 },
        ],
        800,
      ),
    ).toBe(87.5);
    expect(energyAt(0, [], 800)).toBeNull();
    const route = parseGpx(gpx(point(0, 0, 0) + point(0, 0.001, 10)));
    route.segments[0].distanceM += 10;
    expect(prepareTrack(route).energyCompatible).toBe(false);
  });
  it("guarda original e processada e reduz o desenho sem perder referência aos dados completos", () => {
    const r = parseGpx(
      gpx(point(0, 0, 100) + point(0, 0.001, 150) + point(0, 0.002, 100)),
    );
    const t = prepareTrack(r);
    expect(t.vertices[1].altitude).toBe(100);
    expect(t.vertices[1].originalAltitude).toBe(150);
  });
  it("prepara dezenas de milhares de pontos, com índice espacial e busca por distância", () => {
    const xml = gpx(
        Array.from({ length: 30000 }, (_, i) =>
          point(i * 0.0001, 0, 100 + i * 0.001),
        ).join(""),
      ),
      r = parseGpx(xml),
      t = prepareTrack(r);
    expect(t.edges.length).toBeGreaterThan(20000);
    expect(t.drawIndices.length).toBeLessThan(4100);
    const selected = selectionAtDistance(t, t.distanceM * 0.73),
      p = positionAt(t, selected)!;
    expect(Math.abs(p.distanceM - t.distanceM * 0.73)).toBeLessThan(0.01);
    expect(nearestTrack(t, p.x, p.y, selected).selection).not.toBeNull();
    const moved = nearestTrack(t, p.x, p.y, { edge: 0, fraction: 0 });
    expect(
      Math.abs(positionAt(t, moved.selection!)!.distanceM - p.distanceM),
    ).toBeLessThan(0.01);
  });
});
