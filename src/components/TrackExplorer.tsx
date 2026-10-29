import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  energyAt,
  nearestTrack,
  positionAt,
  selectionAtDistance,
  type PreparedTrack,
  type TrackSelection,
} from "../core/explorer";
import { f } from "./UI";
export function TrackExplorer({
  track,
  energy = [],
  capacityWh = 0,
}: {
  track: PreparedTrack;
  energy?: { distanceM: number; remainingWh: number }[];
  capacityWh?: number;
}) {
  const initial = { edge: 0, fraction: 0 },
    [selection, setSelection] = useState<TrackSelection>(initial),
    [pinned, setPinned] = useState(false),
    [alternatives, setAlternatives] = useState<TrackSelection[]>([]),
    [view, setView] = useState({ x: 0, y: 0, w: 1000, h: 500 });
  const selected = useRef(selection),
    dragging = useRef(false),
    frame = useRef(0);
  useEffect(() => {
    selected.current = initial;
    setSelection(initial);
    setPinned(false);
    setAlternatives([]);
    setView({ x: 0, y: 0, w: 1000, h: 500 });
    return () => cancelAnimationFrame(frame.current);
  }, [track]);
  const position = positionAt(track, selection);
  const battery =
    position && track.energyCompatible
      ? energyAt(position.distanceM, energy, capacityWh)
      : null;
  const altitudes = useMemo(
    () =>
      track.vertices.flatMap((v) => (v.altitude === null ? [] : [v.altitude])),
    [track],
  );
  const [min, max] = useMemo(
    () => [
      altitudes.reduce((m, n) => Math.min(m, n), Infinity),
      altitudes.reduce((m, n) => Math.max(m, n), -Infinity),
    ],
    [altitudes],
  );
  const range = Math.max(1, max - min);
  const px = (d: number) => 45 + (d / Math.max(track.distanceM, 1)) * 910,
    py = (a: number) => 165 - ((a - min) / range) * 135;
  const mapPath = useMemo(
    () =>
      track.drawIndices
        .map(
          (i, k) =>
            `${k === 0 || track.vertices[i].breakBefore ? "M" : "L"}${track.vertices[i].x.toFixed(2)},${track.vertices[i].y.toFixed(2)}`,
        )
        .join(" "),
    [track],
  );
  const profilePath = useMemo(() => {
    let open = false,
      path = "";
    for (const i of track.drawIndices) {
      const v = track.vertices[i];
      if (v.altitude === null) {
        open = false;
        continue;
      }
      path += `${!open || v.breakBefore ? "M" : "L"}${px(v.distanceM).toFixed(2)},${py(v.altitude).toFixed(2)} `;
      open = true;
    }
    return path;
  }, [track, min, max]);
  function select(next: TrackSelection) {
    selected.current = next;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setSelection(next));
  }
  function mapSelect(e: PointerEvent<SVGSVGElement>, fix: boolean) {
    const matrix = e.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    const nearest = nearestTrack(
      track,
      point.x,
      point.y,
      selected.current,
      (view.w / Math.max(1, e.currentTarget.clientWidth)) * 20,
    );
    if (nearest.selection) {
      select(nearest.selection);
      setAlternatives(nearest.alternatives);
      if (fix) setPinned(true);
    }
  }
  function profileSelect(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    select(
      selectionAtDistance(
        track,
        ((x - 45) / 910) * track.distanceM,
        selected.current,
      ),
    );
  }
  function zoom(scale: number) {
    setView((v) => {
      const w = Math.max(100, Math.min(2000, v.w * scale)),
        h = w / 2;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  }
  if (!track.edges.length)
    return (
      <div className="notice">
        Importe um GPX para explorar o percurso e a altitude. A simulação manual
        usa um perfil agregado, sem coordenadas GPS.
      </div>
    );
  return (
    <section
      className="explorer"
      aria-label="Explorador sincronizado do percurso"
    >
      <div className="map-toolbar">
        <span>Traçado local · sem cartografia de fundo</span>
        <div>
          <button
            type="button"
            aria-label="Aumentar zoom do mapa"
            onClick={() => zoom(0.7)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Diminuir zoom do mapa"
            onClick={() => zoom(1 / 0.7)}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setView({ x: 0, y: 0, w: 1000, h: 500 })}
          >
            Enquadrar
          </button>
          <button
            type="button"
            aria-label="Mover mapa para a esquerda"
            onClick={() => setView((v) => ({ ...v, x: v.x - v.w * 0.15 }))}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Mover mapa para a direita"
            onClick={() => setView((v) => ({ ...v, x: v.x + v.w * 0.15 }))}
          >
            →
          </button>
          <button
            type="button"
            aria-label="Mover mapa para cima"
            onClick={() => setView((v) => ({ ...v, y: v.y - v.h * 0.15 }))}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Mover mapa para baixo"
            onClick={() => setView((v) => ({ ...v, y: v.y + v.h * 0.15 }))}
          >
            ↓
          </button>
        </div>
      </div>
      <svg
        className="interactive-map"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="img"
        aria-label="Mapa interativo do percurso"
        onPointerMove={(e) => {
          if (!pinned && e.pointerType !== "touch") mapSelect(e, false);
        }}
        onPointerDown={(e) => mapSelect(e, true)}
      >
        <defs>
          <pattern
            id="route-grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M40 0H0V40"
              fill="none"
              stroke="currentColor"
              opacity=".08"
            />
          </pattern>
        </defs>
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill="url(#route-grid)"
        />
        <path
          data-testid="route-line"
          d={mapPath}
          fill="none"
          stroke="#0069a8"
          strokeWidth={view.w / 250}
          vectorEffect="non-scaling-stroke"
        />
        {position && (
          <circle
            data-testid="map-marker"
            data-altitude={position.altitude ?? "unavailable"}
            data-distance={position.distanceM.toFixed(3)}
            cx={position.x}
            cy={position.y}
            r={view.w / 90}
            fill="#e63046"
            stroke="white"
            strokeWidth={view.w / 400}
          />
        )}
      </svg>
      <div
        className="position-readout"
        aria-live="polite"
        data-testid="position-readout"
      >
        <strong>{f((position?.distanceM ?? 0) / 1000, 2)} km</strong>
        <span>
          {position?.altitude === null || !position
            ? "Altitude indisponível"
            : `Altitude processada ${f(position.altitude, 1)} m`}
          {position?.interpolated && position.altitude !== null
            ? " · interpolada"
            : ""}
        </span>
        <span>
          {battery === null
            ? "Bateria prevista indisponível"
            : `Bateria prevista ${f(battery, 1)}%`}
        </span>
        {position?.originalAltitude !== null &&
          position?.originalAltitude !== undefined &&
          position?.altitude !== position.originalAltitude && (
            <small>
              Altitude original {f(position.originalAltitude, 1)} m
              {position.interpolated ? " · interpolada" : ""}
            </small>
          )}
        <button
          type="button"
          className="text-button"
          onClick={() => setPinned(!pinned)}
        >
          {pinned ? "Libertar seleção" : "Fixar seleção"}
        </button>
      </div>
      <svg
        className="interactive-profile"
        viewBox="0 0 1000 205"
        preserveAspectRatio="none"
        role="img"
        aria-label="Perfil altimétrico interativo"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setPinned(true);
          profileSelect(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current || (!pinned && e.pointerType !== "touch"))
            profileSelect(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        {altitudes.length > 0 ? (
          <>
            <path
              d={profilePath}
              fill="none"
              stroke="#269b80"
              strokeWidth="2"
            />
            {Array.from(new Set([min, max])).map((a, i) => (
              <text key={i} x="3" y={py(a) + 4}>
                {f(a)} m
              </text>
            ))}
          </>
        ) : (
          <text x="50" y="90">
            Altitude indisponível neste GPX
          </text>
        )}
        {position && (
          <>
            <line
              data-testid="profile-marker"
              data-altitude={position.altitude ?? "unavailable"}
              data-distance={position.distanceM.toFixed(3)}
              x1={px(position.distanceM)}
              x2={px(position.distanceM)}
              y1="20"
              y2="170"
              stroke="#e63046"
              strokeDasharray="4 4"
            />
            {position.altitude !== null && (
              <circle
                cx={px(position.distanceM)}
                cy={py(position.altitude)}
                r="4"
                fill="#e63046"
              />
            )}
          </>
        )}
        <text x="45" y="195">
          0 km
        </text>
        <text x="955" y="195" textAnchor="end">
          {f(track.distanceM / 1000, 2)} km
        </text>
      </svg>
      <label className="progress-control">
        <span>
          Posição no percurso · {f((position?.distanceM ?? 0) / 1000, 2)} km
        </span>
        <input
          aria-label="Posição no percurso"
          type="range"
          min="0"
          max={track.distanceM}
          step={Math.max(0.1, track.distanceM / 10000)}
          value={position?.distanceM ?? 0}
          onChange={(e) => {
            const next = selectionAtDistance(
              track,
              Number(e.target.value),
              selected.current,
            );
            cancelAnimationFrame(frame.current);
            selected.current = next;
            setSelection(next);
            setPinned(true);
          }}
        />
      </label>
      {alternatives.length > 1 && (
        <div className="alternatives">
          <span>Sobreposição: escolha o trecho</span>
          {alternatives.map((s, i) => (
            <button
              type="button"
              key={i}
              onClick={() => {
                select(s);
                setPinned(true);
              }}
            >
              {f((positionAt(track, s)?.distanceM ?? 0) / 1000, 2)} km
            </button>
          ))}
        </div>
      )}
      <small className="muted">
        Mova o ponteiro ou toque no traçado/perfil. Clique para fixar. A barra
        funciona com as setas do teclado. As lacunas de altitude não são
        interpoladas.
      </small>
    </section>
  );
}
