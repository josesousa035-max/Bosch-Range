import { useState } from "react";
import type { Route } from "../core/model";
import type { SavedRoute } from "../core/storage";
import { Panel, f } from "./UI";
export function RouteLibrary({
  routes,
  current,
  onOpen,
  onSave,
  onRename,
  onDelete,
}: {
  routes: SavedRoute[];
  current: Route | null;
  onOpen: (r: Route) => void;
  onSave: () => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState("");
  const visible = routes.filter((r) =>
    r.route.name
      .toLocaleLowerCase("pt-PT")
      .includes(query.toLocaleLowerCase("pt-PT")),
  );
  return (
    <Panel
      title="Biblioteca de percursos"
      aside={<span className="badge">{routes.length} guardados</span>}
    >
      <p className="muted">
        Os GPX importados ficam guardados neste dispositivo. Reimportar a mesma
        geometria não cria duplicados. Alterações ao piso podem ser guardadas
        como uma variante.
      </p>
      <div className="library-toolbar">
        <label className="field">
          <span>Procurar percurso</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome do percurso"
          />
        </label>
        <button
          className="secondary"
          disabled={!current}
          onClick={() => void onSave()}
        >
          Guardar percurso atual
        </button>
      </div>
      {visible.length ? (
        visible.map((entry) => {
          const distance =
            entry.route.segments.reduce((sum, s) => sum + s.distanceM, 0) /
            1000;
          const ascent = entry.route.segments.reduce(
            (sum, s) => sum + Math.max(0, s.riseM),
            0,
          );
          return (
            <article className="ride-row" key={entry.id}>
              <div>
                {editing === entry.id ? (
                  <label className="field">
                    <span>Novo nome do percurso</span>
                    <input
                      maxLength={200}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                ) : (
                  <h3>{entry.route.name}</h3>
                )}
                <small>
                  {f(distance, 1)} km · +{f(ascent)} m ·{" "}
                  {entry.route.elevationComplete
                    ? "Com cotas"
                    : "Cotas incompletas"}
                </small>
              </div>
              <div className="actions">
                {editing === entry.id ? (
                  <>
                    <button
                      className="secondary"
                      disabled={!name.trim()}
                      onClick={() => {
                        void onRename(entry.id, name).then(() =>
                          setEditing(null),
                        );
                      }}
                    >
                      Guardar nome
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setEditing(null)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="primary"
                      aria-label={`Abrir ${entry.route.name}`}
                      onClick={() => onOpen(entry.route)}
                    >
                      Abrir
                    </button>
                    <button
                      className="secondary"
                      aria-label={`Renomear ${entry.route.name}`}
                      onClick={() => {
                        setEditing(entry.id);
                        setName(entry.route.name);
                      }}
                    >
                      Renomear
                    </button>
                    <button
                      className="text-button danger"
                      aria-label={`Remover ${entry.route.name} da biblioteca`}
                      onClick={() => void onDelete(entry.id)}
                    >
                      Remover
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })
      ) : (
        <p className="muted">
          {routes.length
            ? "Nenhum percurso corresponde à pesquisa."
            : "Importe o primeiro GPX para começar a sua biblioteca."}
        </p>
      )}
      <small className="muted">
        Remover da biblioteca não elimina o percurso da sessão atual nem os
        snapshots dos passeios.
      </small>
    </Panel>
  );
}
