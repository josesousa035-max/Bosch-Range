import { describe, it, expect } from "vitest";
import { parseGpx, haversine, splitStages, climbs } from "../src/core/gpx";
import { simulate, defaults } from "../src/core/model";
const gpx = (e: (number | undefined)[], mult = 0.001) =>
  `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Teste</name><trkseg>${e.map((ele, i) => `<trkpt lat="0" lon="${i * mult}">${ele === undefined ? "" : `<ele>${ele}</ele>`}</trkpt>`).join("")}</trkseg></trk></gpx>`;
describe("Importação GPX não confiável", () => {
  it("distância haversine conhecida: 1 grau no equador", () =>
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(
      111194.9266,
      3,
    ));
  it("distância, subida e descida", () => {
    const r = parseGpx(gpx([0, 10, 20, 10, 0]));
    const q = simulate(r, defaults);
    expect(q.distanceKm).toBeCloseTo(0.4447797, 5);
    expect(q.ascentM).toBe(20);
    expect(q.descentM).toBe(20);
    expect(r.elevationComplete).toBe(true);
  });
  it("remove impulso altimétrico isolado", () => {
    const r = parseGpx(gpx([100, 100, 150, 100, 100]));
    expect(simulate(r, defaults).ascentM).toBe(0);
  });
  it("suprime ruído pequeno preservando uma subida prolongada", () => {
    const flat = parseGpx(gpx([100, 101, 100, 101, 100]));
    expect(simulate(flat, defaults).ascentM).toBe(0);
    const r = parseGpx(gpx([0, 10, 20, 30, 40, 50, 60]));
    expect(simulate(r, defaults).ascentM).toBe(60);
    expect(climbs(r)).toHaveLength(1);
  });
  it("elevação incompleta tem aviso e incerteza maior", () => {
    const r = parseGpx(gpx([undefined, 10, undefined]));
    expect(r.elevationComplete).toBe(false);
    expect(simulate(r, defaults).uncertainty).toBe(0.5);
  });
  it("não liga intervalos entre trkseg", () => {
    const r = parseGpx(
      '<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon=".001"/></trkseg><trkseg><trkpt lat="10" lon="10"/><trkpt lat="10" lon="10.001"/></trkseg></trk></gpx>',
    );
    expect(r.segments).toHaveLength(2);
    expect(simulate(r, defaults).distanceKm).toBeLessThan(0.23);
  });
  it("suporta rte e namespace com prefixo", () => {
    expect(
      parseGpx(
        '<x:gpx xmlns:x="urn:gpx"><x:rte><x:rtept lat="0" lon="0"/><x:rtept lat="0" lon=".001"/></x:rte></x:gpx>',
      ).segments,
    ).toHaveLength(1);
  });
  it("rejeita XML inválido, entidades, coordenadas, percurso vazio e saltos", () => {
    for (const xml of [
      "text",
      "<gpx>",
      "<!DOCTYPE gpx><gpx/>",
      "<gpx/>",
      '<gpx><trk><trkseg><trkpt lat="999" lon="0"/></trkseg></trk></gpx>',
      gpx([0, 0], 1),
      '<gpx><rte><rtept lat="" lon="0"/></rte></gpx>',
    ])
      expect(() => parseGpx(xml)).toThrow();
  });
  it("não duplica resultados em importações repetidas", () => {
    const xml = gpx([10, 20, 30]);
    expect(parseGpx(xml)).toEqual(parseGpx(xml));
  });
  it("divisão em etapas conserva distância e desnível", () => {
    const r = parseGpx(gpx([0, 10, 20, 30, 40, 50, 60]));
    const stages = splitStages(r, 3);
    const sum = stages.flatMap((r) => r.segments);
    expect(stages).toHaveLength(3);
    expect(sum.reduce((a, s) => a + s.distanceM, 0)).toBeCloseTo(
      r.segments.reduce((a, s) => a + s.distanceM, 0),
    );
    expect(sum.reduce((a, s) => a + s.riseM, 0)).toBe(60);
  });
});

it("cotas absolutas de tracks separados não criam subida entre tracks", () => {
  const r = parseGpx(
    '<gpx><trk><trkseg><trkpt lat="0" lon="0"><ele>10</ele></trkpt><trkpt lat="0" lon=".001"><ele>20</ele></trkpt></trkseg><trkseg><trkpt lat="10" lon="10"><ele>1000</ele></trkpt><trkpt lat="10" lon="10.001"><ele>1010</ele></trkpt></trkseg></trk></gpx>',
  );
  const q = simulate(r, defaults);
  expect(q.ascentM).toBe(20);
  expect(q.samples.at(-1)?.elevation).toBe(1010);
  expect(q.samples.filter((s) => s.breakBefore)).toHaveLength(1);
});

it("coordenadas têm de ser atributos GPX, não elementos arbitrários com o mesmo nome", () => {
  expect(() =>
    parseGpx(
      "<gpx><rte><rtept><lat>0</lat><lon>0</lon></rtept><rtept><lat>0</lat><lon>.001</lon></rtept></rte></gpx>",
    ),
  ).toThrow("Coordenadas");
});
