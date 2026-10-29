import type { ReactNode } from "react";
import type { Prediction } from "../core/model";
export const f = (x: number, d = 0) =>
  x.toLocaleString("pt-PT", { maximumFractionDigits: d });
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 10000,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) =>
          onChange(e.target.value === "" ? min : Number(e.target.value))
        }
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export function download(data: unknown, name: string) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function Results({ p }: { p: Prediction }) {
  return (
    <>
      <div className="metrics">
        <div>
          <span>Energia estimada</span>
          <strong>
            {f(p.requiredWh)} <small>Wh</small>
          </strong>
          <em>
            {f(p.lowWh)}–{f(p.highWh)} Wh · intervalo heurístico
          </em>
        </div>
        <div>
          <span>Bateria à chegada</span>
          <strong className={p.arrivalSoc < 15 ? "danger" : "blue"}>
            {f(p.arrivalSoc)}
            <small>%</small>
          </strong>
          <em>{f(p.remainingWh)} Wh disponíveis</em>
        </div>
        <div>
          <span>Duração prevista</span>
          <strong>
            {f(Math.floor(p.hours))}
            <small>h </small>
            {f((p.hours % 1) * 60)}
            <small>min</small>
          </strong>
          <em>{f(p.distanceKm / p.hours, 1)} km/h calculados</em>
        </div>
        <div>
          <span>Autonomia restante*</span>
          <strong>
            {f(p.rangeRemainingKm)} <small>km</small>
          </strong>
          <em>*Repetindo as mesmas condições</em>
        </div>
      </div>
      <div className="summary-line">
        <span>↔ {f(p.distanceKm, 1)} km</span>
        <span>↗ {f(p.ascentM)} m</span>
        <span>↘ {f(p.descentM)} m</span>
        <span>{f(p.consumedSoc)}% consumidos da capacidade efetiva</span>
        <span>Reserva: {f(p.reserveWh)} Wh</span>
      </div>
      {p.reserveAtKm !== null && (
        <div className="notice warning">
          Reserva atingida aos {f(p.reserveAtKm, 1)} km. Planeie margem
          adicional; esta previsão não garante a conclusão do percurso.
        </div>
      )}
      {p.depletedAtKm !== null && (
        <div className="notice error">
          Bateria esgotada no modelo aos {f(p.depletedAtKm, 1)} km. Procura
          total: {f(p.requiredWh)} Wh; energia efetivamente disponível:{" "}
          {f(p.startWh)} Wh.
        </div>
      )}
      <div className="notice">
        Incerteza indicativa ±{f(p.uncertainty * 100)}%. Não é um intervalo
        estatístico validado. {p.warnings.join(" ")}
      </div>
    </>
  );
}
