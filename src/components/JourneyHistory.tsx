import { useMemo, useState } from "react";
import { modes, type Settings } from "../core/model";
import { prepareTrack } from "../core/explorer";
import {
  arrivalError,
  exclusions,
  observedWh,
  type Journey,
  type ObservedResult,
} from "../core/journeys";
import { TrackExplorer } from "./TrackExplorer";
import { f, NumberField, Panel } from "./UI";
export function JourneyHistory({
  journeys,
  onComplete,
  onDuplicate,
  onDelete,
  onNotes,
  onResimulate,
}: {
  journeys: Journey[];
  onComplete: (id: string, a: ObservedResult) => Promise<void>;
  onDuplicate: (j: Journey) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNotes: (id: string, notes: string) => Promise<void>;
  onResimulate: (j: Journey) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("new"),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState(false),
    [notes, setNotes] = useState(""),
    [actual, setActual] = useState<ObservedResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = useMemo(
    () =>
      journeys
        .filter(
          (j) =>
            j.name
              .toLocaleLowerCase("pt-PT")
              .includes(query.toLocaleLowerCase("pt-PT")) &&
            (filter === "all" || filter === j.status),
        )
        .sort((a, b) =>
          sort === "new"
            ? b.date.localeCompare(a.date)
            : a.date.localeCompare(b.date),
        ),
    [journeys, query, filter, sort],
  );
  const journey = journeys.find((j) => j.id === selected),
    track = useMemo(
      () => (journey ? prepareTrack(journey.forecast.route) : null),
      [journey?.id, journey?.forecast.routeIdentity],
    );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(j: Journey) {
    setSelected(j.id);
    setEditing(j.status === "planned");
    setActual(
      j.actual ?? {
        endSoc: Math.max(0, Math.round(j.forecast.arrivalSoc)),
        startSoc: j.forecast.settings.startSoc,
        distanceKm: j.forecast.distanceKm,
        mode: j.forecast.settings.mode,
        charged: false,
        batterySwapped: false,
        configurationChanged: false,
        routeChanged: false,
        conditionsChanged: false,
        notes: "",
      },
    );
    setNotes(j.notes);
    setError("");
  }
  const outcome = journey?.actual
    ? arrivalError(journey.forecast.arrivalSoc, journey.actual.endSoc)
    : null;
  return (
    <>
      <p className="muted">
        Dados guardados apenas neste dispositivo. Exporte um backup em A minha
        bicicleta para os transferir ou proteger.
      </p>
      <div className="history-filters">
        <label className="field">
          <span>Pesquisar passeios</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Estado</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="planned">Planeado</option>
            <option value="completed">Concluído</option>
          </select>
        </label>
        <label className="field">
          <span>Ordenar por data</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">Mais recentes</option>
            <option value="old">Mais antigos</option>
          </select>
        </label>
      </div>
      <div className="journey-list">
        {rows.length ? (
          rows.map((j) => (
            <article className="journey-card" key={j.id}>
              <div>
                <span className={`state-badge ${j.status}`}>
                  {j.status === "planned" ? "Planeado" : "Concluído"}
                </span>
                <h2>{j.name}</h2>
                <p>
                  {j.date} · {f(j.forecast.distanceKm, 1)} km ·{" "}
                  {j.forecast.origin === "gpx" && !j.forecast.elevationComplete
                    ? "Altimetria incompleta"
                    : `+${f(j.forecast.ascentM)} m`}{" "}
                  · {j.forecast.settings.mode}
                </p>
              </div>
              <div className="journey-summary">
                <span>
                  Previsão <b>{f(j.forecast.arrivalSoc, 1)}%</b>
                </span>
                <span>
                  {j.actual ? (
                    <>
                      Observado <b>{f(j.actual.endSoc, 1)}%</b>
                    </>
                  ) : (
                    "Resultado por registar"
                  )}
                </span>
                {j.actual && (
                  <span>
                    {f(arrivalError(j.forecast.arrivalSoc, j.actual.endSoc), 1)}{" "}
                    p.p.
                  </span>
                )}
              </div>
              <button
                className="primary"
                aria-label={`Abrir passeio ${j.name}`}
                onClick={() => open(j)}
              >
                {j.status === "planned" ? "Registar resultado" : "Ver detalhe"}
              </button>
            </article>
          ))
        ) : (
          <Panel title="O seu histórico começa no próximo passeio">
            <p>
              Guarde um plano em Planear. Depois da volta, registe a bateria
              final para comparar com a previsão original. Não existem
              resultados de demonstração nestas métricas.
            </p>
          </Panel>
        )}
      </div>
      {journey && (
        <section className="journey-detail" aria-label="Detalhe do passeio">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PREVISÃO ORIGINAL PRESERVADA</span>
              <h2>{journey.name}</h2>
            </div>
            <button className="secondary" onClick={() => setSelected(null)}>
              Fechar detalhe
            </button>
          </div>
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          <div className="comparison-grid">
            <div>
              <span>Consumo previsto</span>
              <strong>{f(journey.forecast.requiredWh)} Wh</strong>
            </div>
            <div>
              <span>Chegada prevista</span>
              <strong>{f(journey.forecast.arrivalSoc, 1)}%</strong>
            </div>
            <div>
              <span>Chegada observada</span>
              <strong>
                {journey.actual
                  ? `${f(journey.actual.endSoc, 1)}%`
                  : "Por registar"}
              </strong>
            </div>
            <div>
              <span>Erro à chegada</span>
              <strong>
                {outcome === null ? "Sem resultado" : `${f(outcome, 1)} p.p.`}
              </strong>
              <small>
                {outcome === null
                  ? ""
                  : outcome > 0
                    ? "Previsão otimista"
                    : outcome < 0
                      ? "Previsão conservadora"
                      : "Previsão igual ao observado"}
              </small>
            </div>
          </div>
          {journey.forecast.origin === "legacy" && (
            <div className="notice">
              Registo anterior: consumo previsto original preservado;
              percentagem de chegada reconstituída, não guardada na altura. Sem
              curva energética original. Não entra nas métricas em pontos
              percentuais.
            </div>
          )}
          {journey.actual && (
            <>
              <p>
                {observedWh(journey)
                  ? `${f(observedWh(journey)!.wh)} Wh — ${observedWh(journey)!.measured ? "medição de energia declarada" : "consumo estimado a partir da bateria, não medido diretamente"}`
                  : "Não é possível inferir energia observada com estes dados."}
              </p>
              {exclusions(journey).length > 0 && (
                <div className="notice warning">
                  Excluído das métricas comparáveis e da calibração:{" "}
                  {exclusions(journey).join("; ")}.
                </div>
              )}
            </>
          )}
          {track && (
            <TrackExplorer
              key={journey.id}
              track={track}
              energy={journey.forecast.energy}
              capacityWh={journey.forecast.capacityWh}
            />
          )}
          <div className="actions">
            <button className="primary" onClick={() => setEditing(!editing)}>
              {journey.actual
                ? "Editar resultado real"
                : "Registar resultado real"}
            </button>
            <button className="secondary" onClick={() => onResimulate(journey)}>
              Simular novamente
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await onDuplicate(journey);
                })
              }
            >
              Duplicar plano
            </button>
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Eliminar "${journey.name}"? A previsão e o resultado deste registo serão removidos.`,
                  )
                )
                  void run(async () => {
                    await onDelete(journey.id);
                    setSelected(null);
                  });
              }}
            >
              Eliminar passeio
            </button>
          </div>
          {editing && actual && (
            <Panel title="Resultado real do passeio">
              <div className="form-grid">
                <NumberField
                  label="Bateria final observada · %"
                  value={actual.endSoc}
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={(v) => setActual({ ...actual, endSoc: v })}
                />
                <NumberField
                  label="Bateria inicial real · %"
                  value={actual.startSoc}
                  max={100}
                  step={0.1}
                  onChange={(v) => setActual({ ...actual, startSoc: v })}
                />
                <NumberField
                  label="Distância real · km"
                  value={actual.distanceKm}
                  min={0.01}
                  max={10000}
                  step={0.1}
                  onChange={(v) => setActual({ ...actual, distanceKm: v })}
                />
                <label className="field">
                  <span>Assistência efetivamente usada</span>
                  <select
                    value={actual.mode}
                    onChange={(e) =>
                      setActual({
                        ...actual,
                        mode: e.target.value as Settings["mode"],
                      })
                    }
                  >
                    {modes.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Energia efetivamente medida · Wh (opcional)</span>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={actual.measuredWh ?? ""}
                    onChange={(e) =>
                      setActual({
                        ...actual,
                        measuredWh:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="flags-grid">
                {(
                  [
                    ["charged", "Houve carga intermédia"],
                    ["batterySwapped", "Houve troca de bateria"],
                    [
                      "configurationChanged",
                      "Configuração da bateria/bicicleta incompatível",
                    ],
                    ["routeChanged", "Percurso alterado"],
                    [
                      "conditionsChanged",
                      "Condições alteradas de forma relevante",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={actual[key]}
                      onChange={(e) =>
                        setActual({ ...actual, [key]: e.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="field">
                <span>Observações do resultado</span>
                <textarea
                  value={actual.notes}
                  maxLength={5000}
                  onChange={(e) =>
                    setActual({ ...actual, notes: e.target.value })
                  }
                />
              </label>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onComplete(journey.id, actual);
                    setEditing(false);
                  })
                }
              >
                Guardar resultado real
              </button>
            </Panel>
          )}
          <Panel title="Notas e rastreabilidade">
            <label className="field">
              <span>Notas do passeio</span>
              <textarea
                value={notes}
                maxLength={5000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => onNotes(journey.id, notes))}
            >
              Guardar notas
            </button>
            <p className="muted">
              {journey.forecast.algorithmVersion} ·{" "}
              {journey.forecast.calibrationVersion} · formato{" "}
              {journey.formatVersion} · {journey.actualRevisions.length}{" "}
              revisões do resultado real.
            </p>
            <p className="muted">
              Capacidade considerada: {f(journey.forecast.capacityWh)} Wh
              utilizáveis estimados; nominal principal{" "}
              {journey.forecast.settings.nominalWh} Wh. Massa equipada{" "}
              {f(
                journey.forecast.settings.riderKg +
                  journey.forecast.settings.bikeKg +
                  journey.forecast.settings.luggageKg,
                1,
              )}{" "}
              kg.{" "}
              {journey.forecast.origin === "legacy"
                ? "Intervalo original indisponível."
                : `Intervalo heurístico ${f(journey.forecast.lowWh)}–${f(journey.forecast.highWh)} Wh.`}
            </p>
            <p className="muted">
              Origem:{" "}
              {journey.forecast.origin === "gpx"
                ? "Distância e altimetria calculadas do GPX"
                : journey.forecast.origin === "manual"
                  ? "Distância e subida introduzidas manualmente"
                  : "Registo anterior migrado; sem curva energética original disponível"}{" "}
              · traçado {journey.forecast.routeIdentity} v
              {journey.forecast.routeVersion}.
            </p>
          </Panel>
        </section>
      )}
    </>
  );
}
