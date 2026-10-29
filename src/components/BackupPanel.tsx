import { useState } from "react";
import {
  MAX_BACKUP_BYTES,
  createBackup,
  parseBackup,
  type Backup,
} from "../core/backup";
import { Panel, download } from "./UI";
export function BackupPanel({
  beforeExport,
  onRestore,
}: {
  beforeExport: () => Promise<void>;
  onRestore: (
    backup: Backup,
    preferences: boolean,
  ) => Promise<{
    added: number;
    kept: number;
  }>;
}) {
  const [pending, setPending] = useState<Backup | null>(null),
    [preferences, setPreferences] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function run(fn: () => Promise<void>) {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Backup completo e transferência">
      <p>
        Guarde percursos, passeios, ajustes de calibração, definições, previsões
        recentes e a sessão atual num único ficheiro JSON. Permite transferir os
        dados entre o browser e a aplicação Mac.
      </p>
      <div className="notice">
        O ficheiro pode conter coordenadas GPS, datas, massas e observações
        pessoais. Não é encriptado e não é enviado para servidores pela
        aplicação. Guarde-o num local privado.
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await beforeExport();
              const backup = await createBackup();
              download(
                backup,
                `bosch-range-backup-${new Date().toISOString().slice(0, 10)}.json`,
              );
              setStatus(
                "Backup completo exportado. Guarde o ficheiro fora deste browser.",
              );
            })
          }
        >
          Exportar backup completo
        </button>
        <label className="upload-button">
          Selecionar backup
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                setPending(null);
                setPreferences(false);
                void run(async () => {
                  if (file.size > MAX_BACKUP_BYTES)
                    throw Error("Backup excede 50 MB");
                  setPending(parseBackup(await file.text()));
                });
              }
            }}
          />
        </label>
      </div>
      {error && (
        <div role="alert" className="notice error">
          {error} Nenhum restauro foi concluído.
        </div>
      )}
      {status && (
        <p role="status" className="notice success">
          {status}
        </p>
      )}
      {pending && (
        <div className="backup-preview">
          <h3>Pré-visualização do backup</h3>
          <p>
            {new Date(pending.createdAt).toLocaleString("pt-PT")} · versão{" "}
            {pending.appVersion}
          </p>
          <ul>
            <li>{pending.routes.length} percursos</li>
            <li>
              {pending.journeys?.length ?? 0} planos e passeios atuais ·{" "}
              {pending.activities.length} registos anteriores
            </li>
            <li>{pending.adjustments.length} ajustes de calibração</li>
            <li>{pending.simulations.length} previsões recentes</li>
            <li>
              {pending.workspace
                ? "Com sessão guardada"
                : "Sem sessão guardada"}
            </li>
          </ul>
          <p className="muted">
            Serão acrescentados os registos em falta. Os IDs que já existem
            mantêm os dados locais, mesmo que o backup contenha versões
            diferentes. Não são eliminados registos.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={preferences}
              onChange={(e) => setPreferences(e.target.checked)}
            />
            Restaurar também definições e sessão (substitui as atuais)
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await onRestore(pending, preferences);
                  setPending(null);
                  setStatus(
                    `Backup restaurado: ${result.added} registos acrescentados; ${result.kept} registos locais preservados.`,
                  );
                })
              }
            >
              Restaurar backup
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancelar importação
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
