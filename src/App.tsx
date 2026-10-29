import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaults,
  manualRoute,
  simulate,
  modes,
  rolling,
  type Settings,
  type Route,
  type Mode,
} from "./core/model";
import { MAX_GPX_BYTES, splitStages } from "./core/gpx";
import { prepareTrack, type PreparedTrack } from "./core/explorer";
import {
  getSettings,
  getWorkspace,
  saveWorkspace,
  listRoutes,
  saveRoute,
  renameRoute,
  deleteRoute,
  adjustments,
  saveAdjustment,
  listActivities,
  type SavedRoute,
  type Activity,
  type Adjustment,
} from "./core/storage";
import { validateWorkspace, type Workspace } from "./core/workspace";
import { restoreBackup, type Backup } from "./core/backup";
import {
  createJourney,
  listJourneys,
  completeJourney,
  duplicateJourney,
  removeJourney,
  updateJourneyNotes,
  migrateLegacyActivities,
  journeyMetrics,
  calibrationActivities,
  exclusions,
  type Journey,
} from "./core/journeys";
import { calibrate } from "./core/calibration";
import { TrackExplorer } from "./components/TrackExplorer";
import { JourneyHistory } from "./components/JourneyHistory";
import { RouteLibrary } from "./components/RouteLibrary";
import { BackupPanel } from "./components/BackupPanel";
import { Profile } from "./components/Charts";
import { Panel, NumberField, f } from "./components/UI";
const screens = [
  "Planear",
  "Os meus passeios",
  "Evolução",
  "A minha bicicleta",
];
const today = () => new Date().toLocaleDateString("en-CA");
function mapScreen(tab: string) {
  return screens.includes(tab)
    ? tab
    : tab === "Calibração"
      ? "Evolução"
      : tab === "Definições"
        ? "A minha bicicleta"
        : "Planear";
}
const bikeFields: [keyof Settings, string, number, number, number][] = [
  ["riderKg", "Massa do ciclista · kg", 30, 180, 0.5],
  ["bikeKg", "Massa da bicicleta · kg", 10, 50, 0.1],
  ["luggageKg", "Bagagem e acessórios · kg", 0, 60, 0.5],
  ["nominalWh", "Capacidade nominal principal · Wh", 100, 1600, 1],
  ["health", "Saúde estimada · %", 30, 100, 1],
  ["usable", "Fração utilizável estimada · %", 50, 100, 1],
  ["crrFactor", "Pneus / pressão / piso · fator Crr", 0.4, 3, 0.05],
  ["cdA", "CdA efetivo · m²", 0.2, 1.2, 0.01],
  ["efficiency", "Eficiência aproximada · fração", 0.45, 0.95, 0.01],
  ["motorMaxW", "Limite mecânico aproximado · W", 100, 1000, 10],
  ["assistanceScale", "Escala da assistência aproximada", 0, 2, 0.05],
  ["auxiliaryW", "Consumo auxiliar · W", 0, 30, 1],
];
export default function App() {
  const [tab, setTab] = useState("Planear"),
    [s, setS] = useState<Settings>({ ...defaults }),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [distance, setDistance] = useState(40),
    [ascent, setAscent] = useState(800),
    [gpx, setGpx] = useState<Route | null>(null),
    [useGpx, setUseGpx] = useState(false),
    [prepared, setPrepared] = useState<PreparedTrack | null>(null),
    [routes, setRoutes] = useState<SavedRoute[]>([]),
    [journeys, setJourneys] = useState<Journey[]>([]);
  const [name, setName] = useState("Passeio e-MTB"),
    [date, setDate] = useState(today),
    [notes, setNotes] = useState(""),
    [parentId, setParentId] = useState<string | undefined>(),
    [dark, setDark] = useState(
      () => localStorage.getItem("bosch-theme") === "dark",
    ),
    [advanced, setAdvanced] = useState(false),
    [saveState, setSaveState] = useState("A carregar dados locais");
  const [legacy, setLegacy] = useState<Activity[]>([]),
    [history, setHistory] = useState<Adjustment[]>([]),
    [days, setDays] = useState(3),
    [recharge, setRecharge] = useState(true),
    [stageSoc, setStageSoc] = useState<Record<string, number>>({}),
    [modeB, setModeB] = useState<Mode>("Turbo"),
    [segmentPage, setSegmentPage] = useState(0);
  const [oldDraft, setOldDraft] = useState<Workspace["activity"]>({
    name: "Passeio",
    date: today(),
    durationH: 2.5,
    startSoc: 100,
    endSoc: 60,
    measuredWh: 0,
    notes: "",
  });
  const worker = useRef<Worker | null>(null),
    intent = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    generation = useRef(0),
    restoring = useRef(false);
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((p) => ({ ...p, [key]: value }));
  }
  async function run(action: () => Promise<void>) {
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function processRoute(route: Route, resetName = false, activate = true) {
    const token = ++intent.current;
    worker.current?.terminate();
    setBusy(true);
    const w = new Worker(new URL("./core/gpx.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      if (token !== intent.current) return;
      setBusy(false);
      w.terminate();
      if (e.data.error) {
        setError(e.data.error);
        return;
      }
      setGpx(e.data.route);
      setUseGpx(activate);
      setPrepared(e.data.prepared);
      setSegmentPage(0);
      if (resetName) setName(route.name);
    };
    w.onerror = () => {
      if (token === intent.current) {
        setBusy(false);
        setError("Não foi possível preparar o percurso.");
      }
      w.terminate();
    };
    w.postMessage({ kind: "prepare", route });
  }
  async function importGpx(file?: File) {
    if (!file) return;
    const token = ++intent.current;
    worker.current?.terminate();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (file.size > MAX_GPX_BYTES) throw Error("GPX excede 12 MB");
      const xml = await file.text();
      if (token !== intent.current) return;
      const w = new Worker(new URL("./core/gpx.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = async (e) => {
        if (token !== intent.current) return;
        w.terminate();
        if (e.data.error) {
          setBusy(false);
          setError(e.data.error);
          return;
        }
        try {
          const saved = await saveRoute(e.data.route);
          if (token !== intent.current) return;
          const allRoutes = await listRoutes();
          if (token !== intent.current) return;
          setRoutes(allRoutes);
          setGpx(saved.entry.route);
          setUseGpx(true);
          setPrepared(e.data.prepared);
          setName(saved.entry.route.name);
          setParentId(undefined);
          setSegmentPage(0);
          setMessage(
            saved.duplicate
              ? "GPX importado. O traçado já existia na biblioteca."
              : "GPX importado e guardado na biblioteca.",
          );
        } catch (error) {
          if (token === intent.current) setError((error as Error).message);
        } finally {
          if (token === intent.current) setBusy(false);
        }
      };
      w.onerror = () => {
        if (token === intent.current) {
          setBusy(false);
          setError(
            "Erro ao processar GPX. O percurso anterior foi preservado.",
          );
        }
        w.terminate();
      };
      w.postMessage({ kind: "parse", xml });
    } catch (e) {
      if (token === intent.current) {
        setBusy(false);
        setError((e as Error).message);
      }
    }
  }
  async function loadData(preferences = true) {
    await migrateLegacyActivities();
    const [settings, w, r, j, a, h] = await Promise.all([
      getSettings(),
      getWorkspace(),
      listRoutes(),
      listJourneys(),
      listActivities(),
      adjustments(),
    ]);
    setJourneys(j);
    setRoutes(r);
    setLegacy(a);
    setHistory(h);
    if (preferences) {
      setS(settings);
      if (w) {
        setTab(mapScreen(w.tab));
        setDistance(w.distance);
        setAscent(w.ascent);
        setUseGpx(w.useGpx);
        setGpx(w.gpx);
        setDays(w.days);
        setRecharge(w.recharge);
        setStageSoc(w.stageSoc);
        setDark(w.dark);
        setAdvanced(w.advanced);
        setOldDraft(w.activity);
        if (w.planner) {
          setName(w.planner.name);
          setDate(w.planner.date);
          setNotes(w.planner.notes);
          setParentId(w.planner.parentId);
        }
        if (w.gpx) {
          if (w.gpx.points && w.gpx.points.length > 3000)
            processRoute(w.gpx, false, w.useGpx);
          else setPrepared(prepareTrack(w.gpx));
        }
      }
    }
    setLoaded(true);
  }
  useEffect(() => {
    const blocked = () =>
      setError(
        "Feche outras janelas antigas para atualizar o armazenamento sem apagar dados.",
      );
    window.addEventListener("bosch-storage-blocked", blocked);
    void loadData().catch((e) =>
      setError(`Não foi possível abrir os dados locais: ${e.message}`),
    );
    return () => {
      window.removeEventListener("bosch-storage-blocked", blocked);
      worker.current?.terminate();
      intent.current++;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("bosch-theme", dark ? "dark" : "light");
  }, [dark]);
  const workspace = useMemo<Workspace>(
    () => ({
      tab,
      distance,
      ascent,
      gpx,
      useGpx,
      days,
      recharge,
      stageSoc,
      activity: oldDraft,
      dark,
      advanced,
      planner: { name, date, notes, ...(parentId ? { parentId } : {}) },
    }),
    [
      tab,
      distance,
      ascent,
      gpx,
      useGpx,
      days,
      recharge,
      stageSoc,
      oldDraft,
      dark,
      advanced,
      name,
      date,
      notes,
      parentId,
    ],
  );
  async function flush() {
    if (!loaded) throw Error("Aguarde o carregamento dos dados.");
    clearTimeout(timer.current);
    const n = ++generation.current;
    await saveWorkspace(s, workspace);
    if (n === generation.current) setSaveState("Sessão guardada");
  }
  useEffect(() => {
    if (!loaded || restoring.current) return;
    const n = ++generation.current;
    try {
      validateWorkspace(workspace);
    } catch {
      setSaveState("Alterações inválidas não guardadas");
      return;
    }
    setSaveState("A guardar sessão…");
    const save = () => {
      if (restoring.current) return;
      void saveWorkspace(s, workspace)
        .then(() => {
          if (n === generation.current) setSaveState("Sessão guardada");
        })
        .catch((e) => {
          setSaveState("Erro ao guardar");
          setError(e.message);
        });
    };
    timer.current = setTimeout(save, 400);
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer.current);
        save();
      }
    };
    const leaving = () => {
      clearTimeout(timer.current);
      save();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, [s, workspace, loaded]);
  const result = useMemo(() => {
    performance.mark("bosch-range:simulate");
    try {
      const route =
        useGpx && gpx ? gpx : manualRoute(distance, ascent, s.terrain);
      return { route, p: simulate(route, s), error: "" };
    } catch (e) {
      return { route: null, p: null, error: (e as Error).message };
    }
  }, [gpx, useGpx, distance, ascent, s]);
  const energy = useMemo(
    () =>
      result.p?.samples.map((v) => ({
        distanceM: v.km * 1000,
        remainingWh: v.remainingWh,
      })) ?? [],
    [result.p],
  );
  const metric = useMemo(() => journeyMetrics(journeys), [journeys]),
    cal = useMemo(
      () =>
        calibrate([
          ...legacy,
          ...calibrationActivities(journeys.filter((j) => !j.legacyActivityId)),
        ]),
      [legacy, journeys],
    );
  const comparison = useMemo(() => {
    if (!result.route) return [];
    return [s.mode, modeB].map((mode) => {
      try {
        return { mode, p: simulate(result.route!, { ...s, mode }) };
      } catch {
        return { mode, p: null };
      }
    });
  }, [result.route, s, modeB]);
  const scenarioResults = useMemo(() => {
    if (!result.route) return [];
    return (
      [
        { label: "Estradão compactado", patch: { terrain: "compactado" } },
        { label: "Trilho técnico", patch: { terrain: "trilho" } },
        { label: "Com PowerMore 250", patch: { extender: true } },
        { label: "Sem PowerMore", patch: { extender: false } },
        { label: "Frio · 5 °C", patch: { temperature: 5 } },
        {
          label: "Bagagem +10 kg",
          patch: { luggageKg: Math.min(60, s.luggageKg + 10) },
        },
        {
          label: "Tranquilo · 14 km/h / 90 W",
          patch: { targetKmh: 14, humanW: 90 },
        },
        {
          label: "Rápido · 22 km/h / 180 W",
          patch: { targetKmh: 22, humanW: 180 },
        },
      ] as { label: string; patch: Partial<Settings> }[]
    ).map((c) => {
      try {
        const r = c.patch.terrain
          ? {
              ...result.route!,
              segments: result.route!.segments.map((seg) => ({
                ...seg,
                terrain: c.patch.terrain,
              })),
            }
          : result.route!;
        return { label: c.label, p: simulate(r, { ...s, ...c.patch }) };
      } catch {
        return { label: c.label, p: null };
      }
    });
  }, [result.route, s]);
  const stages = useMemo(() => {
    if (!result.route) return [];
    try {
      let soc = s.startSoc;
      return splitStages(result.route, days).map((route, i) => {
        const initial = recharge ? (stageSoc[i] ?? s.startSoc) : soc;
        const p = simulate(route, {
          ...s,
          startSoc: initial,
          extenderSoc: initial,
        });
        soc = p.arrivalSoc;
        return { p, initial };
      });
    } catch {
      return [];
    }
  }, [result.route, days, recharge, stageSoc, s]);
  async function restore(b: Backup, preferences: boolean) {
    restoring.current = true;
    ++generation.current;
    clearTimeout(timer.current);
    try {
      if (!preferences) await saveWorkspace(s, workspace);
      const count = await restoreBackup(b, preferences);
      await loadData(preferences);
      setMessage(
        preferences &&
          mapScreen(b.workspace?.tab ?? tab) !== "A minha bicicleta"
          ? "Backup restaurado. Os registos locais em conflito foram preservados."
          : "",
      );
      return count;
    } finally {
      restoring.current = false;
    }
  }
  const number = (
    key: keyof Settings,
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <NumberField
      key={key}
      label={label}
      value={s[key] as number}
      min={min}
      max={max}
      step={step}
      onChange={(v) => update(key, v as never)}
    />
  );
  async function refreshJourneys() {
    setJourneys(await listJourneys());
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Planear");
          }}
        >
          <span className="brand-icon">ϟ</span>
          <span>
            BOSCH
            <span className="brand-sub">
              RANGE LAB <b>3.0</b>
            </span>
          </span>
        </a>
        <nav className="top-nav" aria-label="Navegação principal">
          {screens.map((screen) => (
            <button
              key={screen}
              aria-current={tab === screen ? "page" : undefined}
              className={tab === screen ? "active" : ""}
              onClick={() => {
                setTab(screen);
                setError("");
                setMessage("");
              }}
            >
              {screen}
            </button>
          ))}
        </nav>
        <button
          className="theme-toggle"
          aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
          onClick={() => setDark(!dark)}
        >
          {dark ? "☀" : "◐"}
        </button>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <span className="eyebrow">CUBE × BOSCH · PROJETO INDEPENDENTE</span>
            <h1>{tab}</h1>
          </div>
          <span className="workspace-state" aria-live="polite">
            {loaded ? saveState : "A carregar dados locais"}
          </span>
        </div>
        {error && (
          <div role="alert" className="notice error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="notice success">
            {message}
          </div>
        )}
        {tab === "Planear" && (
          <>
            <div className="route-heading">
              <div>
                <h2>{useGpx && gpx ? gpx.name : "Percurso manual"}</h2>
                <p>
                  {busy
                    ? "A preparar GPX em segundo plano…"
                    : useGpx
                      ? "GPX local · piso definido por si"
                      : "Introduza distância e subida, ou importe um GPX para explorar o traçado."}
                </p>
              </div>
              <label className="upload-button">
                Importar GPX
                <input
                  aria-label="Importar GPX"
                  type="file"
                  accept=".gpx,application/gpx+xml"
                  disabled={!loaded}
                  onChange={(e) => {
                    void importGpx(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="planner-layout">
              <aside className="planner-controls">
                <Panel title="Percurso">
                  <div className="segmented">
                    <button
                      className={!useGpx ? "selected" : ""}
                      onClick={() => {
                        ++intent.current;
                        worker.current?.terminate();
                        setBusy(false);
                        setUseGpx(false);
                      }}
                    >
                      Manual
                    </button>
                    <button
                      className={useGpx ? "selected" : ""}
                      disabled={!gpx}
                      onClick={() => setUseGpx(true)}
                    >
                      GPX
                    </button>
                  </div>
                  {!useGpx && (
                    <>
                      <NumberField
                        label="Distância · km"
                        value={distance}
                        onChange={setDistance}
                        min={0.1}
                        max={1000}
                        step={0.1}
                      />
                      <NumberField
                        label="Subida acumulada · m"
                        value={ascent}
                        onChange={setAscent}
                        max={20000}
                      />
                    </>
                  )}
                  <label className="field">
                    <span>Nome do plano</span>
                    <input
                      maxLength={200}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Data do passeio</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                </Panel>
                <Panel title="Condições">
                  <label className="field">
                    <span>Piso predominante</span>
                    <select
                      value={s.terrain}
                      onChange={(e) =>
                        update("terrain", e.target.value as Settings["terrain"])
                      }
                    >
                      {Object.keys(rolling).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  {number("temperature", "Temperatura · °C", -20, 50)}
                  {number("targetKmh", "Velocidade pretendida · km/h", 3, 60)}
                  <details>
                    <summary>Vento e carga</summary>
                    {number("windKmh", "Vento · km/h", 0, 100)}
                    {number("windFromDeg", "Vento proveniente de · °", 0, 360)}
                    {number(
                      "luggageKg",
                      "Bagagem e acessórios · kg",
                      0,
                      60,
                      0.5,
                    )}
                  </details>
                </Panel>
                <Panel title="Assistência">
                  <label className="field">
                    <span>Modo de assistência</span>
                    <select
                      value={s.mode}
                      onChange={(e) => update("mode", e.target.value as Mode)}
                    >
                      {modes.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  {number("humanW", "Potência humana disponível · W", 0, 500)}
                  {number("startSoc", "Carga inicial · %", 0, 100)}
                  {number("reserveSoc", "Reserva à chegada · %", 0, 90)}
                  {s.extender &&
                    number(
                      "extenderSoc",
                      "Carga inicial PowerMore · %",
                      0,
                      100,
                    )}
                  <p className="muted">
                    Assistência aproximada, sem curvas internas Bosch. Corte de
                    assistência a 25 km/h, não limite de velocidade da
                    bicicleta.
                  </p>
                </Panel>
              </aside>
              <div className="planner-main">
                {result.error && (
                  <div role="alert" className="notice error">
                    {result.error}
                  </div>
                )}
                {result.p && (
                  <>
                    <div
                      className="forecast-summary"
                      aria-label="Previsão atual"
                    >
                      <div>
                        <span>Bateria prevista à chegada</span>
                        <strong>{f(result.p.arrivalSoc, 1)}%</strong>
                      </div>
                      <div>
                        <span>Consumo previsto</span>
                        <strong>{f(result.p.requiredWh)} Wh</strong>
                        <small>
                          {f(result.p.lowWh)}–{f(result.p.highWh)} Wh ·
                          intervalo heurístico
                        </small>
                      </div>
                      <div
                        className={
                          result.p.arrivalSoc < s.reserveSoc ? "danger" : ""
                        }
                      >
                        <span>Margem face à reserva</span>
                        <strong>
                          {f(result.p.arrivalSoc - s.reserveSoc, 1)} p.p.
                        </strong>
                        <small>
                          {result.p.arrivalSoc < s.reserveSoc
                            ? "Abaixo da reserva escolhida"
                            : "Acima da reserva escolhida"}
                        </small>
                      </div>
                    </div>
                    <div className="summary-line">
                      <span>{f(result.p.distanceKm, 1)} km</span>
                      <span>
                        {useGpx && !result.route?.elevationComplete
                          ? "Altimetria incompleta"
                          : `Subida ${f(result.p.ascentM)} m`}
                      </span>
                      <span>{f(result.p.hours, 2)} h previstas</span>
                      <span>
                        {f(s.riderKg + s.bikeKg + s.luggageKg, 1)} kg equipados
                      </span>
                    </div>
                  </>
                )}
                <Panel title="Explorar percurso e altitude">
                  {useGpx && prepared ? (
                    <TrackExplorer
                      track={prepared}
                      energy={energy}
                      capacityWh={result.p?.capacityWh ?? 0}
                    />
                  ) : (
                    <>
                      <p className="muted">
                        O mapa e o perfil sincronizados aparecem ao importar
                        GPX. O percurso manual é uma estimativa agregada.
                      </p>
                      {result.p && <Profile p={result.p} kind="energy" />}
                    </>
                  )}
                </Panel>
                {result.p && (
                  <div className="notice">
                    Previsão, não telemetria. {result.p.warnings.join(" ")}{" "}
                    Incerteza heurística ±{f(result.p.uncertainty * 100)}%, sem
                    validação estatística.{" "}
                    {result.p.depletedAtKm !== null
                      ? `Energia insuficiente: esgotamento modelado aos ${f(result.p.depletedAtKm, 1)} km; duração posterior contrafactual.`
                      : ""}
                  </div>
                )}
                <Panel title="Guardar a previsão original">
                  <label className="field">
                    <span>Notas do plano</span>
                    <textarea
                      value={notes}
                      maxLength={5000}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  {parentId && (
                    <p className="muted">
                      Nova simulação ligada a um passeio anterior. A previsão
                      original será preservada.
                    </p>
                  )}
                  <button
                    className="primary main-action"
                    disabled={!loaded || busy || !result.p}
                    onClick={() =>
                      void run(async () => {
                        const j = await createJourney(
                          name,
                          date,
                          result.route!,
                          s,
                          result.p!,
                          notes,
                          parentId,
                        );
                        await refreshJourneys();
                        await saveWorkspace(s, workspace);
                        setMessage(
                          `Plano guardado: ${j.name}. Registe o resultado depois da volta em Os meus passeios.`,
                        );
                      })
                    }
                  >
                    Guardar plano
                  </button>
                  <small className="muted">
                    Uma cópia da previsão, percurso, parâmetros e versões ficará
                    guardada. As alterações seguintes não a reescrevem.
                  </small>
                </Panel>
                <details className="panel">
                  <summary>Comparação A/B e cenários</summary>
                  <p>
                    Mesmo percurso e potência humana; só muda a assistência. A
                    velocidade calculada pode ser limitada pela potência.
                  </p>
                  <label className="field">
                    <span>Modo do cenário B</span>
                    <select
                      aria-label="Modo do cenário B"
                      value={modeB}
                      onChange={(e) => setModeB(e.target.value as Mode)}
                    >
                      {modes.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <div className="comparison-grid">
                    {comparison.map(({ mode, p }, i) => (
                      <div key={i}>
                        <span>
                          Cenário {i ? "B" : "A"} · {mode}
                        </span>
                        <strong>
                          {p ? `${f(p.requiredWh)} Wh` : "Inviável"}
                        </strong>
                        <small>
                          {p
                            ? `${f(p.arrivalSoc, 1)}% na chegada · ${f(p.hours, 2)} h`
                            : ""}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Condição alternativa</th>
                          <th>Wh</th>
                          <th>Chegada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenarioResults.map((c) => (
                          <tr key={c.label}>
                            <td>{c.label}</td>
                            <td>{c.p ? f(c.p.requiredWh) : "Inviável"}</td>
                            <td>{c.p ? `${f(c.p.arrivalSoc, 1)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <details className="panel">
                  <summary>Biblioteca de percursos</summary>
                  <RouteLibrary
                    routes={routes}
                    current={gpx}
                    onOpen={(r) => processRoute(r, true)}
                    onSave={() =>
                      run(async () => {
                        if (gpx) {
                          await saveRoute(gpx);
                          setRoutes(await listRoutes());
                          setMessage("Percurso guardado.");
                        }
                      })
                    }
                    onRename={(id, n) =>
                      run(async () => {
                        await renameRoute(id, n);
                        setRoutes(await listRoutes());
                      })
                    }
                    onDelete={(id) =>
                      run(async () => {
                        await deleteRoute(id);
                        setRoutes(await listRoutes());
                      })
                    }
                  />
                </details>
                <details className="panel">
                  <summary>Viagem por etapas</summary>
                  <p>
                    Divisão por distância, sem pressupor disponibilidade de
                    eletricidade. Confirme as recargas.
                  </p>
                  <NumberField
                    label="Número de etapas"
                    value={days}
                    onChange={setDays}
                    min={1}
                    max={30}
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={recharge}
                      onChange={(e) => setRecharge(e.target.checked)}
                    />
                    Simular recarga entre etapas (a confirmar)
                  </label>
                  <div className="stage-grid">
                    {stages.map(({ p, initial }, i) => (
                      <div className="stage" key={i}>
                        <b>Etapa {i + 1}</b>
                        <p>
                          {f(p.distanceKm, 1)} km · {f(p.requiredWh)} Wh
                        </p>
                        {recharge ? (
                          <NumberField
                            label={`Carga inicial etapa ${i + 1} · %`}
                            value={stageSoc[i] ?? s.startSoc}
                            onChange={(v) =>
                              setStageSoc({ ...stageSoc, [i]: v })
                            }
                            max={100}
                          />
                        ) : (
                          <p>Início {f(initial)}%</p>
                        )}
                        <strong>Chegada {f(p.arrivalSoc, 1)}%</strong>
                      </div>
                    ))}
                  </div>
                </details>
                {gpx && (
                  <details className="panel">
                    <summary>Piso por segmento · avançado</summary>
                    <div className="actions">
                      <button
                        className="secondary"
                        disabled={!segmentPage}
                        onClick={() => setSegmentPage(segmentPage - 1)}
                      >
                        Anterior
                      </button>
                      <span>
                        Página {segmentPage + 1} de{" "}
                        {Math.ceil(gpx.segments.length / 100)}
                      </span>
                      <button
                        className="secondary"
                        disabled={
                          (segmentPage + 1) * 100 >= gpx.segments.length
                        }
                        onClick={() => setSegmentPage(segmentPage + 1)}
                      >
                        Seguinte
                      </button>
                    </div>
                    <div className="segment-editor">
                      {gpx.segments
                        .slice(segmentPage * 100, (segmentPage + 1) * 100)
                        .map((seg, i) => (
                          <label key={i}>
                            Segmento {segmentPage * 100 + i + 1}
                            <select
                              value={seg.terrain ?? s.terrain}
                              onChange={(e) =>
                                setGpx({
                                  ...gpx,
                                  segments: gpx.segments.map((x, j) =>
                                    j === segmentPage * 100 + i
                                      ? {
                                          ...x,
                                          terrain: e.target
                                            .value as Settings["terrain"],
                                        }
                                      : x,
                                  ),
                                })
                              }
                            >
                              {Object.keys(rolling).map((t) => (
                                <option key={t}>{t}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </>
        )}
        {tab === "Os meus passeios" && (
          <JourneyHistory
            journeys={journeys}
            onComplete={async (id, a) => {
              await completeJourney(id, a);
              await refreshJourneys();
            }}
            onDuplicate={async (j) => {
              await duplicateJourney(j);
              await refreshJourneys();
            }}
            onDelete={async (id) => {
              await removeJourney(id);
              await refreshJourneys();
            }}
            onNotes={async (id, n) => {
              await updateJourneyNotes(id, n);
              await refreshJourneys();
            }}
            onResimulate={(j) => {
              setS({
                ...j.forecast.settings,
                calibrationFactor: s.calibrationFactor,
              });
              setName(`${j.name.slice(0, 170)} · nova simulação`);
              setDate(today());
              setParentId(j.id);
              setDistance(j.forecast.distanceKm);
              setAscent(j.forecast.ascentM);
              if (j.forecast.route.points) processRoute(j.forecast.route);
              else setUseGpx(false);
              setTab("Planear");
            }}
          />
        )}
        {tab === "Evolução" && (
          <>
            <div className="forecast-summary">
              <div>
                <span>Passeios comparáveis</span>
                <strong>{metric.count}</strong>
              </div>
              <div>
                <span>Erro absoluto médio à chegada</span>
                <strong>
                  {metric.mae === null
                    ? "Sem dados"
                    : `${f(metric.mae, 1)} p.p.`}
                </strong>
              </div>
              <div>
                <span>Tendência média</span>
                <strong>
                  {metric.bias === null
                    ? "Sem dados"
                    : `${f(metric.bias, 1)} p.p.`}
                </strong>
                <small>
                  {metric.bias === null
                    ? "Registe o primeiro resultado real"
                    : metric.bias > 0
                      ? "Previsões otimistas"
                      : metric.bias < 0
                        ? "Previsões conservadoras"
                        : "Sem viés médio nesta amostra"}
                </small>
              </div>
            </div>
            <div className="notice">
              {metric.count < 8 ? "Amostra ainda pequena. " : ""}Erro = previsão
              à chegada − bateria observada. Um valor positivo significa
              otimismo. Não há garantia de precisão em campo.
            </div>
            <Panel title="Previsto e observado">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Passeio</th>
                      <th>Previsto</th>
                      <th>Observado</th>
                      <th>Erro</th>
                      <th>Elegibilidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journeys.map((j) => (
                      <tr key={j.id}>
                        <td>{j.name}</td>
                        <td>{f(j.forecast.arrivalSoc, 1)}%</td>
                        <td>
                          {j.actual
                            ? `${f(j.actual.endSoc, 1)}%`
                            : "Por registar"}
                        </td>
                        <td>
                          {j.actual
                            ? `${f(j.forecast.arrivalSoc - j.actual.endSoc, 1)} p.p.`
                            : "—"}
                        </td>
                        <td>{exclusions(j).join("; ") || "Comparável"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!journeys.length && (
                <p>
                  Sem resultados reais. Guarde um plano, faça o passeio e
                  registe o resultado para começar.
                </p>
              )}
            </Panel>
            <Panel title="Calibração experimental preservada">
              <p>{cal.status}</p>
              <p>
                Fator proposto {f(cal.factor, 3)} · aplicado{" "}
                {f(s.calibrationFactor, 3)} · {cal.training.length} treino /{" "}
                {cal.validation.length} validação. Os registos legados continuam
                disponíveis ao calibrador original em Wh; previsões antigas
                nunca são reescritas.
              </p>
              {cal.validation.length > 0 && (
                <p>
                  MAE de validação: original {f(cal.baseline.mae, 1)} Wh ·
                  ajustado {f(cal.calibrated.mae, 1)} Wh.
                </p>
              )}
              <div className="actions">
                <button
                  className="secondary"
                  disabled={cal.training.length < 3}
                  onClick={() =>
                    void run(async () => {
                      await saveAdjustment({
                        at: new Date().toISOString(),
                        factor: cal.factor,
                        trainingIds: cal.training.map((a) => a.id),
                        validationIds: cal.validation.map((a) => a.id),
                        reason: "Ajuste experimental preservando planos",
                      });
                      update("calibrationFactor", cal.factor);
                      setHistory(await adjustments());
                      setMessage("Ajuste aplicado apenas a novas simulações.");
                    })
                  }
                >
                  Aplicar ajuste experimental
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void run(async () => {
                      await saveAdjustment({
                        at: new Date().toISOString(),
                        factor: 1,
                        trainingIds: [],
                        validationIds: [],
                        reason: "Reposição do modelo de fábrica",
                      });
                      update("calibrationFactor", 1);
                      setHistory(await adjustments());
                    })
                  }
                >
                  Repor modelo de fábrica
                </button>
              </div>
              <details>
                <summary>Histórico dos ajustes</summary>
                {history.map((h) => (
                  <p key={h.at}>
                    {new Date(h.at).toLocaleString("pt-PT")} · {f(h.factor, 3)}{" "}
                    · {h.reason}
                  </p>
                ))}
              </details>
            </Panel>
          </>
        )}
        {tab === "A minha bicicleta" && (
          <>
            <Panel title="Cube Stereo Hybrid ONE44 HPC SLX 800">
              <p>
                2027 · L · Jungali'n'Black · PowerTube 800 nominal · Bosch CX,
                família BDU38 indicada · Smart System / Kiox 400C indicados.
              </p>
              <div className="notice">
                Perfil fornecido pelo utilizador, confirmação oficial pendente.
                Massa, potência, perdas e capacidade utilizável abaixo são
                estimativas editáveis. Não se assume 120 Nm configurados.
              </div>
              <div className="form-grid">
                {bikeFields
                  .slice(0, 5)
                  .map(([k, l, min, max, step]) =>
                    number(k, l, min, max, step),
                  )}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.extender}
                  onChange={(e) => update("extender", e.target.checked)}
                />
                Incluir PowerMore 250 na simulação
              </label>
              <p className="muted">
                Confirme compatibilidade e montagem com a Cube/Bosch. Só se
                modela energia combinada, sem assumir a estratégia de descarga
                de cada bateria.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={advanced}
                  onChange={(e) => setAdvanced(e.target.checked)}
                />
                Mostrar parâmetros físicos avançados
              </label>
              {advanced && (
                <div className="form-grid">
                  {bikeFields
                    .slice(5)
                    .map(([k, l, min, max, step]) =>
                      number(k, l, min, max, step),
                    )}
                </div>
              )}
            </Panel>
            <BackupPanel beforeExport={flush} onRestore={restore} />
            <Panel title="Privacidade e preferências">
              <p>
                Sem conta, telemetria ou upload. Dados em IndexedDB apenas neste
                dispositivo. Exporte um backup antes de limpar os dados ou mudar
                de browser.
              </p>
              <button className="secondary" onClick={() => setDark(!dark)}>
                {dark ? "Ativar modo claro" : "Ativar modo escuro"}
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void run(async () => {
                    setS({ ...defaults });
                    setMessage(
                      "Definições repostas. Planos e resultados preservados.",
                    );
                  })
                }
              >
                Repor definições
              </button>
              <p>
                <a
                  href="https://www.cube.eu/pt-pt/cube-stereo-hybrid-one44-hpc-slx-800-jungali-n-black/1103610"
                  target="_blank"
                  rel="noreferrer"
                >
                  Fonte Cube
                </a>{" "}
                ·{" "}
                <a
                  href="https://www.bosch-ebike.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Fonte Bosch
                </a>
              </p>
            </Panel>
          </>
        )}
        <footer>
          Bosch Range Lab 3.0 · independente, sem afiliação à Bosch ou Cube ·
          estimativas transparentes, sem promessa de autonomia garantida.
        </footer>
      </main>
    </div>
  );
}
