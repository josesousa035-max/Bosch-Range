import type { Prediction, Route } from "../core/model";
const fmt = (x: number) =>
  x.toLocaleString("pt-PT", { maximumFractionDigits: 1 });
export function Profile({
  p,
  kind,
}: {
  p: Prediction;
  kind: "energy" | "elevation";
}) {
  const data = p.samples,
    y = data.map((s) => (kind === "energy" ? s.remainingWh : s.elevation)),
    min = kind === "energy" ? 0 : y.reduce((a, b) => Math.min(a, b), Infinity),
    max = y.reduce((a, b) => Math.max(a, b), min + 1),
    span = max - min;
  const x = (km: number) => 55 + (km / p.distanceKm) * 690,
    yy = (v: number) => 185 - ((v - min) / span) * 145;
  const path = data
    .map(
      (s, i) =>
        `${i && !(kind === "elevation" && s.breakBefore) ? "L" : "M"}${x(s.km).toFixed(2)},${yy(y[i]).toFixed(2)}`,
    )
    .join(" ");
  return (
    <div className="chart">
      <svg
        viewBox="0 0 780 235"
        role="img"
        aria-label={
          kind === "energy"
            ? "Energia restante ao longo do percurso"
            : "Perfil de elevação"
        }
      >
        <defs>
          <linearGradient id={`fill-${kind}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              stopColor={kind === "energy" ? "#007bc0" : "#28a58c"}
              stopOpacity=".3"
            />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="55"
              y1={yy(min + span * t)}
              x2="745"
              y2={yy(min + span * t)}
              stroke="currentColor"
              opacity=".1"
            />
            <text x="45" y={yy(min + span * t) + 4} textAnchor="end">
              {fmt(min + span * t)}
            </text>
          </g>
        ))}
        <path d={`${path} L745,185 L55,185 Z`} fill={`url(#fill-${kind})`} />
        <path
          d={path}
          fill="none"
          stroke={kind === "energy" ? "#007bc0" : "#28a58c"}
          strokeWidth="3"
        />
        {kind === "energy" && p.reserveWh <= max && (
          <>
            <line
              x1="55"
              y1={yy(p.reserveWh)}
              x2="745"
              y2={yy(p.reserveWh)}
              stroke="#ed3346"
              strokeDasharray="5 5"
            />
            <text x="740" y={yy(p.reserveWh) - 5} textAnchor="end">
              Reserva
            </text>
          </>
        )}
        <text x="55" y="212">
          0 km
        </text>
        <text x="745" y="212" textAnchor="end">
          {fmt(p.distanceKm)} km
        </text>
        <text x="55" y="22">
          {kind === "energy" ? "Wh disponíveis" : "Altitude relativa / m"}
        </text>
      </svg>
    </div>
  );
}
export function RouteMap({ route }: { route: Route }) {
  const points = route.points;
  if (!points?.length) return null;
  const lat = points.map((p) => p.lat),
    lon = points.map((p) => p.lon),
    minLat = lat.reduce((a, b) => Math.min(a, b), Infinity),
    minLon = lon.reduce((a, b) => Math.min(a, b), Infinity),
    dy = lat.reduce((a, b) => Math.max(a, b), -Infinity) - minLat,
    dx =
      (lon.reduce((a, b) => Math.max(a, b), -Infinity) - minLon) *
      Math.cos((minLat * Math.PI) / 180),
    scale = 250 / Math.max(dx, dy, 0.00001);
  const path = points
    .map(
      (p) =>
        `${p.breakBefore ? "M" : "L"}${(30 + (p.lon - minLon) * Math.cos((minLat * Math.PI) / 180) * scale).toFixed(2)},${(280 - (p.lat - minLat) * scale).toFixed(2)}`,
    )
    .join(" ");
  return (
    <div className="route-map">
      <svg
        viewBox="0 0 320 310"
        role="img"
        aria-label="Traçado GPS local sem mapa de fundo"
      >
        <defs>
          <pattern
            id="grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="currentColor"
              opacity=".08"
            />
          </pattern>
        </defs>
        <rect width="320" height="310" fill="url(#grid)" />
        <path d={path} fill="none" stroke="#007bc0" strokeWidth="3" />
        <text x="285" y="25">
          N ↑
        </text>
      </svg>
      <small>Traçado GPS · sem cartografia de fundo · funciona offline</small>
    </div>
  );
}
