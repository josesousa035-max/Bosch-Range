/** SI internally; segment distances in metres, energies in Wh, speed in km/h. */
export type Terrain = "asfalto" | "compactado" | "gravilha" | "trilho" | "lama";
export type Mode = "Eco" | "Tour+" | "eMTB" | "Turbo";
export interface Settings {
  riderKg: number;
  bikeKg: number;
  luggageKg: number;
  nominalWh: number;
  health: number;
  usable: number;
  startSoc: number;
  reserveSoc: number;
  temperature: number;
  windKmh: number;
  windFromDeg: number;
  targetKmh: number;
  humanW: number;
  mode: Mode;
  terrain: Terrain;
  crrFactor: number;
  cdA: number;
  efficiency: number;
  motorMaxW: number;
  assistanceScale: number;
  auxiliaryW: number;
  extender: boolean;
  extenderSoc: number;
  calibrationFactor: number;
}
export interface Segment {
  breakBefore?: boolean;
  distanceM: number;
  riseM: number;
  bearingDeg?: number;
  terrain?: Terrain;
  elevationM?: number;
  stage?: number;
}
export interface Route {
  name: string;
  segments: Segment[];
  elevationComplete: boolean;
  warnings: string[];
  points?: {
    lat: number;
    lon: number;
    ele?: number;
    originalEle?: number;
    breakBefore?: boolean;
  }[];
}
export const defaults: Settings = {
  riderKg: 80,
  bikeKg: 25.5,
  luggageKg: 3,
  nominalWh: 800,
  health: 100,
  usable: 95,
  startSoc: 100,
  reserveSoc: 15,
  temperature: 20,
  windKmh: 0,
  windFromDeg: 0,
  targetKmh: 18,
  humanW: 110,
  mode: "Tour+",
  terrain: "compactado",
  crrFactor: 1,
  cdA: 0.6,
  efficiency: 0.75,
  motorMaxW: 600,
  assistanceScale: 1,
  auxiliaryW: 4,
  extender: false,
  extenderSoc: 100,
  calibrationFactor: 1,
};
export const rolling: Record<Terrain, number> = {
  asfalto: 0.007,
  compactado: 0.014,
  gravilha: 0.021,
  trilho: 0.032,
  lama: 0.055,
};
export const modes: Mode[] = ["Eco", "Tour+", "eMTB", "Turbo"];
const bounds: Partial<Record<keyof Settings, [number, number]>> = {
  riderKg: [30, 180],
  bikeKg: [10, 50],
  luggageKg: [0, 60],
  nominalWh: [100, 1600],
  health: [30, 100],
  usable: [50, 100],
  startSoc: [0, 100],
  reserveSoc: [0, 90],
  temperature: [-20, 50],
  windKmh: [0, 100],
  windFromDeg: [0, 360],
  targetKmh: [3, 60],
  humanW: [0, 500],
  crrFactor: [0.4, 3],
  cdA: [0.2, 1.2],
  efficiency: [0.45, 0.95],
  motorMaxW: [100, 1000],
  assistanceScale: [0, 2],
  auxiliaryW: [0, 30],
  extenderSoc: [0, 100],
  calibrationFactor: [0.7, 1.3],
};
export function validateSettings(s: Settings) {
  for (const [key, range] of Object.entries(bounds)) {
    const v = s[key as keyof Settings];
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < range[0] ||
      v > range[1]
    )
      throw Error(`Parâmetro inválido: ${key} (${range.join("–")})`);
  }
  if (
    !modes.includes(s.mode) ||
    !Object.hasOwn(rolling, s.terrain) ||
    typeof s.extender !== "boolean"
  )
    throw Error("Modo, terreno ou bateria inválidos");
}
export const potentialWh = (massKg: number, riseM: number) =>
  (massKg * 9.80665 * riseM) / 3600;
export function forces(
  massKg: number,
  grade: number,
  crr: number,
  cdA: number,
  vMs: number,
  headwindMs: number,
  temp = 20,
) {
  const theta = Math.atan(grade),
    rho = (1.225 * 288.15) / (273.15 + temp);
  const relative = vMs + headwindMs;
  return {
    gravity: massKg * 9.80665 * Math.sin(theta),
    rolling: massKg * 9.80665 * crr * Math.cos(theta),
    aero: 0.5 * rho * cdA * relative * Math.abs(relative),
  };
}
export function assistRatio(mode: Mode, grade: number) {
  // Approximate behavioural profiles, NOT Bosch firmware curves.
  return mode === "Eco"
    ? 0.6
    : mode === "Tour+"
      ? Math.min(2.4, 0.9 + Math.max(0, grade) * 12)
      : mode === "eMTB"
        ? Math.min(3.4, 1.5 + Math.max(0, grade) * 15)
        : 3.4;
}
export function cutoff(kmh: number) {
  return Math.max(0, Math.min(1, 25 - kmh));
}
export function battery(s: Settings) {
  const tempFactor = Math.max(0.7, 1 - Math.max(0, 20 - s.temperature) * 0.007);
  const capacityWh =
    (((((s.nominalWh + (s.extender ? 250 : 0)) * s.health) / 100) * s.usable) /
      100) *
    tempFactor;
  const startWh =
    ((((((s.nominalWh * s.startSoc) / 100 +
      (s.extender ? (250 * s.extenderSoc) / 100 : 0)) *
      s.health) /
      100) *
      s.usable) /
      100) *
    tempFactor;
  return {
    capacityWh,
    startWh,
    reserveWh: (capacityWh * s.reserveSoc) / 100,
    tempFactor,
  };
}
export interface Sample {
  breakBefore?: boolean;
  km: number;
  elevation: number;
  wh: number;
  remainingWh: number;
  speedKmh: number;
  mechanicalWh: number;
  motorWh: number;
  humanWh: number;
  limited: boolean;
  grade: number;
}
export interface Prediction {
  distanceKm: number;
  ascentM: number;
  descentM: number;
  hours: number;
  requiredWh: number;
  consumedWh: number;
  remainingWh: number;
  arrivalSoc: number;
  consumedSoc: number;
  capacityWh: number;
  startWh: number;
  reserveWh: number;
  reserveAtKm: number | null;
  depletedAtKm: number | null;
  rangeRemainingKm: number;
  uncertainty: number;
  lowWh: number;
  highWh: number;
  samples: Sample[];
  limitedSegments: number;
  warnings: string[];
}
export function simulate(route: Route, s: Settings): Prediction {
  validateSettings(s);
  if (!route.segments.length || route.segments.length > 100000)
    throw Error("Percurso vazio ou demasiado extenso");
  const b = battery(s),
    mass = s.riderKg + s.bikeKg + s.luggageKg;
  let km = 0,
    wh = 0,
    hours = 0,
    ascentM = 0,
    descentM = 0,
    elevation = route.segments[0].elevationM ?? 0;
  let reserveAtKm: number | null = b.startWh <= b.reserveWh ? 0 : null,
    depletedAtKm: number | null = b.startWh <= 0 ? 0 : null,
    limitedSegments = 0;
  const samples: Sample[] = [
    {
      km: 0,
      elevation,
      wh: 0,
      remainingWh: b.startWh,
      speedKmh: 0,
      mechanicalWh: 0,
      motorWh: 0,
      humanWh: 0,
      limited: false,
      grade: 0,
    },
  ];
  for (const seg of route.segments) {
    if (
      !Number.isFinite(seg.distanceM) ||
      seg.distanceM <= 0 ||
      seg.distanceM > 100000 ||
      !Number.isFinite(seg.riseM) ||
      Math.abs(seg.riseM / seg.distanceM) > 0.6
    )
      throw Error("Segmento inválido (distância ou inclinação)");
    const terrain = seg.terrain ?? s.terrain;
    if (!Object.hasOwn(rolling, terrain)) throw Error("Piso inválido");
    const grade = seg.riseM / seg.distanceM;
    if (
      seg.elevationM !== undefined &&
      (!Number.isFinite(seg.elevationM) || Math.abs(seg.elevationM) > 100000)
    )
      throw Error("Cota de segmento inválida");
    if (seg.breakBefore) {
      elevation = seg.elevationM ?? elevation;
      samples.push({
        km,
        elevation,
        wh,
        remainingWh: Math.max(0, b.startWh - wh),
        speedKmh: 0,
        mechanicalWh: 0,
        motorWh: 0,
        humanWh: 0,
        limited: false,
        grade: 0,
        breakBefore: true,
      });
    }
    const headwind =
      (s.windKmh / 3.6) *
      Math.cos(((s.windFromDeg - (seg.bearingDeg ?? 0)) * Math.PI) / 180);
    const ratio = assistRatio(s.mode, grade) * s.assistanceScale;
    const mechanicalAt = (v: number) => {
      const f = forces(
        mass,
        grade,
        rolling[terrain] * s.crrFactor,
        s.cdA,
        v,
        headwind,
        s.temperature,
      );
      return Math.max(0, (f.gravity + f.rolling + f.aero) * v);
    };
    const availableAt = (v: number) =>
      s.humanW + Math.min(s.motorMaxW, s.humanW * ratio) * cutoff(v * 3.6);
    let v = s.targetKmh / 3.6;
    const limited = mechanicalAt(v) > availableAt(v) + 0.01;
    if (limited) {
      let lo = 0,
        hi = v;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (mechanicalAt(mid) > availableAt(mid)) hi = mid;
        else lo = mid;
      }
      v = (lo + hi) / 2;
      limitedSegments++;
    }
    // No feasible powered motion: do not report a finite fictitious travel time.
    if (v < 0.15)
      throw Error(
        "Potência insuficiente para percorrer um segmento. Aumente o esforço ou reduza o declive.",
      );
    const need = mechanicalAt(v),
      human = Math.min(s.humanW, need / (1 + ratio * cutoff(v * 3.6)));
    const motor = Math.max(
      0,
      Math.min(
        need - human,
        s.motorMaxW * cutoff(v * 3.6),
        s.humanW * ratio * cutoff(v * 3.6),
      ),
    );
    const actualHuman = Math.min(s.humanW, Math.max(0, need - motor));
    const timeH = Math.hypot(seg.distanceM, seg.riseM) / v / 3600;
    const energy =
      ((motor / s.efficiency) *
        Math.max(s.calibrationFactor, s.efficiency / 0.98) +
        s.auxiliaryW) *
      timeH;
    const before = wh;
    wh += energy;
    const nextKm = km + seg.distanceM / 1000;
    const cross = (threshold: number) =>
      km +
      (nextKm - km) *
        Math.max(
          0,
          Math.min(1, (threshold - before) / Math.max(energy, 1e-12)),
        );
    if (reserveAtKm === null && wh >= b.startWh - b.reserveWh)
      reserveAtKm = cross(b.startWh - b.reserveWh);
    if (depletedAtKm === null && wh >= b.startWh)
      depletedAtKm = cross(b.startWh);
    km = nextKm;
    hours += timeH;
    ascentM += Math.max(0, seg.riseM);
    descentM += Math.max(0, -seg.riseM);
    elevation = (seg.elevationM ?? elevation) + seg.riseM;
    samples.push({
      km,
      elevation,
      wh,
      remainingWh: Math.max(0, b.startWh - wh),
      speedKmh: v * 3.6,
      mechanicalWh: need * timeH,
      motorWh: motor * timeH,
      humanWh: actualHuman * timeH,
      limited,
      grade,
    });
  }
  const uncertainty = route.elevationComplete ? 0.25 : 0.5;
  const remainingWh = Math.max(0, b.startWh - wh);
  const warnings = [...route.warnings];
  if (limitedSegments)
    warnings.push(
      "Velocidade reduzida por potência disponível; limites de binário/cadência não modelados.",
    );
  if (depletedAtKm !== null)
    warnings.push(
      "Energia insuficiente: a duração e a procura após esgotar a bateria são contrafactuais (assistência mantida no cálculo).",
    );
  return {
    distanceKm: km,
    ascentM,
    descentM,
    hours,
    requiredWh: wh,
    consumedWh: Math.min(b.startWh, wh),
    remainingWh,
    arrivalSoc: (remainingWh / b.capacityWh) * 100,
    consumedSoc: (Math.min(b.startWh, wh) / b.capacityWh) * 100,
    ...b,
    reserveAtKm,
    depletedAtKm,
    rangeRemainingKm: wh > 0 ? remainingWh / (wh / km) : 0,
    uncertainty,
    lowWh: wh * (1 - uncertainty),
    highWh: wh * (1 + uncertainty),
    samples,
    limitedSegments,
    warnings,
  };
}
export function manualRoute(
  distanceKm: number,
  ascentM: number,
  terrain: Terrain,
): Route {
  if (
    !Number.isFinite(distanceKm) ||
    distanceKm < 0.1 ||
    distanceKm > 1000 ||
    !Number.isFinite(ascentM) ||
    ascentM < 0 ||
    ascentM > distanceKm * 200
  )
    throw Error("Distância (0,1–1000 km) ou subida inválida (máx. 200 m/km)");
  const n = 100,
    half = (distanceKm * 1000) / 2;
  return {
    name: "Percurso manual",
    elevationComplete: false,
    warnings: [
      "Estimativa agregada: subida e descida simétricas, distribuição desconhecida; intervalo heurístico ±50%, sem garantia estatística.",
    ],
    segments: Array.from({ length: n }, (_, i) => ({
      distanceM: half / (n / 2),
      riseM: i < n / 2 ? ascentM / (n / 2) : -ascentM / (n / 2),
      terrain,
      elevationM: i === 0 ? 0 : undefined,
    })),
  };
}
