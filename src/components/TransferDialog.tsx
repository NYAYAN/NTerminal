import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";

import { formatBytes, formatFullDate } from "../lib/format";
import { useT, type Translate } from "../lib/i18n";
import type { MsgKey } from "../lib/messages";
import { api } from "../lib/ipc";
import { flushAllState, useStore } from "../store/useStore";
import type {
  BundleInfo,
  ExportOptions,
  ExportSummary,
  ImportMode,
  ImportOptions,
  ImportResult,
} from "../types";

const MODE_KEYS: Record<ImportMode, MsgKey> = {
  replace: "transfer.modeReplace",
  merge: "transfer.modeMerge",
  skip: "transfer.modeSkip",
};

function ModeSelect({
  value,
  onChange,
  disabled,
  mergeHint,
  t,
}: {
  value: ImportMode;
  onChange: (mode: ImportMode) => void;
  disabled?: boolean;
  mergeHint?: string;
  t: Translate;
}) {
  return (
    <div>
      <div className="seg">
        {(["replace", "merge", "skip"] as ImportMode[]).map((mode) => (
          <button
            key={mode}
            className={value === mode ? "on" : ""}
            disabled={disabled}
            onClick={() => onChange(mode)}
          >
            {t(MODE_KEYS[mode])}
          </button>
        ))}
      </div>
      {mergeHint && value === "merge" && <div className="hintline">{mergeHint}</div>}
    </div>
  );
}

export function TransferDialog() {
  const t = useT();
  const setUi = useStore((s) => s.setUi);
  const paths = useStore((s) => s.paths);
  const store = useStore.getState;

  const [tab, setTab] = useState<"export" | "import">("export");
  const [busy, setBusy] = useState(false);

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeSettings: true,
    includeWorkspace: true,
    includeHistory: false,
    includeFavorites: true,
    includeScrollback: false,
    portablePaths: true,
  });
  const [exportResult, setExportResult] = useState<ExportSummary | null>(null);

  const [preview, setPreview] = useState<BundleInfo | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    settings: "replace",
    workspace: "merge",
    history: "skip",
    favorites: "merge",
    scrollback: false,
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const close = () => setUi({ transferOpen: false });

  const patchExport = (patch: Partial<ExportOptions>) =>
    setExportOptions((prev) => ({ ...prev, ...patch }));

  const doExport = async () => {
    setBusy(true);
    setExportResult(null);
    try {
      // Ekran çıktısı dışa aktarılacaksa önce diske yazılmalı: dosyaya yazan
      // Rust tarafı diskteki hâli okuyor, bellekteki xterm tamponunu değil.
      if (exportOptions.includeScrollback) await flushAllState();
      else await store().persistNow();

      const suggested = await api
        .configExportDefaultName()
        .catch(() => t("transfer.defaultFileName"));
      const target = await save({
        title: t("transfer.saveTitle"),
        defaultPath: suggested,
        filters: [{ name: t("transfer.filterName"), extensions: ["json"] }],
      });
      if (!target) return;

      const summary = await api.configExport(target, exportOptions);
      setExportResult(summary);
      store().toast(t("transfer.exported"), "ok");
    } catch (err) {
      store().toast(String(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const choosePreview = async () => {
    setBusy(true);
    setImportResult(null);
    try {
      const picked = await open({
        title: t("transfer.pickTitle"),
        multiple: false,
        filters: [{ name: t("transfer.filterName"), extensions: ["json"] }],
      });
      if (typeof picked !== "string") return;
      const info = await api.configImportPreview(picked);
      setPreview(info);
      // Gelen dosyada olmayan bölümler için kipi Atla'ya çekiyoruz; kullanıcı
      // "Değiştir" seçiliyken hiçbir şeyin olmamasına bakıp şaşırmasın.
      setImportOptions((prev) => ({
        settings: info.hasSettings ? prev.settings : "skip",
        workspace: info.hasWorkspace ? prev.workspace : "skip",
        history: info.history > 0 ? prev.history : "skip",
        favorites: info.favorites > 0 ? prev.favorites : "skip",
        scrollback: info.scrollback > 0 ? prev.scrollback : false,
      }));
    } catch (err) {
      setPreview(null);
      store().toast(String(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!preview) return;
    const changesWorkspace = importOptions.workspace !== "skip";
    if (importOptions.workspace === "replace") {
      const ok = await store().askConfirm({
        title: t("confirm.replaceWorkspaceTitle"),
        message: t("confirm.replaceWorkspaceMessage"),
        confirmLabel: t("confirm.apply"),
        danger: true,
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const result = await api.configImportApply(preview.path, importOptions);
      setImportResult(result);
      await store().loadFavorites();
      if (changesWorkspace) {
        await store().reloadWorkspace();
      } else {
        // Ayarlar değiştiyse arayüzün bellekteki kopyasını tazele.
        await store().bootstrap();
      }
      store().toast(t("transfer.imported"), "ok");
    } catch (err) {
      store().toast(String(err), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("transfer.title")}</h2>
          <button className="icon-btn" onClick={close}>
            ×
          </button>
        </div>

        <div className="tabs-strip">
          <button className={tab === "export" ? "on" : ""} onClick={() => setTab("export")}>
            {t("transfer.export")}
          </button>
          <button className={tab === "import" ? "on" : ""} onClick={() => setTab("import")}>
            {t("transfer.import")}
          </button>
        </div>

        <div className="modal-body">
          {tab === "export" && (
            <>
              <div className="section">
                <h3>{t("transfer.whatToExport")}</h3>
                <div className="check-row">
                  <input
                    id="exSettings"
                    type="checkbox"
                    checked={exportOptions.includeSettings}
                    onChange={(e) => patchExport({ includeSettings: e.target.checked })}
                  />
                  <label htmlFor="exSettings">{t("transfer.exSettings")}</label>
                </div>
                <div className="check-row">
                  <input
                    id="exWorkspace"
                    type="checkbox"
                    checked={exportOptions.includeWorkspace}
                    onChange={(e) => patchExport({ includeWorkspace: e.target.checked })}
                  />
                  <label htmlFor="exWorkspace">{t("transfer.exWorkspace")}</label>
                </div>
                <div className="check-row">
                  <input
                    id="exHistory"
                    type="checkbox"
                    checked={exportOptions.includeHistory}
                    onChange={(e) => patchExport({ includeHistory: e.target.checked })}
                  />
                  <label htmlFor="exHistory">{t("transfer.exHistory")}</label>
                </div>
                <div className="check-row">
                  <input
                    id="exFavorites"
                    type="checkbox"
                    checked={exportOptions.includeFavorites}
                    onChange={(e) => patchExport({ includeFavorites: e.target.checked })}
                  />
                  <label htmlFor="exFavorites">{t("transfer.exFavorites")}</label>
                </div>
                <div className="check-row">
                  <input
                    id="exScrollback"
                    type="checkbox"
                    disabled={!exportOptions.includeWorkspace}
                    checked={exportOptions.includeScrollback}
                    onChange={(e) => patchExport({ includeScrollback: e.target.checked })}
                  />
                  <label htmlFor="exScrollback">{t("transfer.exScrollback")}</label>
                </div>
              </div>

              <div className="section">
                <h3>{t("transfer.portability")}</h3>
                <div className="check-row">
                  <input
                    id="exPortable"
                    type="checkbox"
                    checked={exportOptions.portablePaths}
                    onChange={(e) => patchExport({ portablePaths: e.target.checked })}
                  />
                  <label htmlFor="exPortable">{t("transfer.portablePaths")}</label>
                </div>
                <p className="dim" style={{ fontSize: 11 }}>
                  {t("transfer.portableExplain", {
                    home: t("transfer.portableHomeExample"),
                    token: "${HOME}",
                  })}
                </p>
              </div>

              {exportResult && (
                <div className="section">
                  <h3>{t("transfer.result")}</h3>
                  <div className="summary-grid">
                    <div className="cell">
                      <div className="n">{exportResult.profiles}</div>
                      <div className="k">{t("transfer.countProfiles")}</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.groups}</div>
                      <div className="k">{t("transfer.countGroups")}</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.tabs}</div>
                      <div className="k">{t("transfer.countTabs")}</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.history}</div>
                      <div className="k">{t("transfer.countCommands")}</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.favorites}</div>
                      <div className="k">{t("transfer.countFavorites")}</div>
                    </div>
                    <div className="cell">
                      <div className="n">{formatBytes(exportResult.bytes)}</div>
                      <div className="k">{t("transfer.fileSize")}</div>
                    </div>
                  </div>
                  <div className="field">
                    <label>{t("common.file")}</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input readOnly className="mono" style={{ flex: 1 }} value={exportResult.path} />
                      <button
                        className="outline"
                        onClick={() =>
                          void api.revealInExplorer(
                            exportResult.path.replace(/[\\/][^\\/]+$/, ""),
                          )
                        }
                      >
                        {t("common.openFolder")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "import" && (
            <>
              <div className="section">
                <h3>{t("common.file")}</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="outline" disabled={busy} onClick={() => void choosePreview()}>
                    {t("transfer.pickFile")}
                  </button>
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    {preview?.path ?? t("transfer.notPicked")}
                  </span>
                </div>
              </div>

              {preview && (
                <>
                  <div className="section">
                    <h3>{t("transfer.fileContents")}</h3>
                    <div className="summary-grid">
                      <div className="cell">
                        <div className="n">{preview.profiles}</div>
                        <div className="k">{t("transfer.countProfiles")}</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.groups}</div>
                        <div className="k">{t("transfer.countGroups")}</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.tabs}</div>
                        <div className="k">{t("transfer.countTabs")}</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.history}</div>
                        <div className="k">{t("transfer.countCommands")}</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.favorites}</div>
                        <div className="k">{t("transfer.countFavorites")}</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.scrollback}</div>
                        <div className="k">{t("transfer.countScrollback")}</div>
                      </div>
                    </div>
                    <p className="dim" style={{ fontSize: 11 }}>
                      {t("transfer.madeOn", {
                        machine: preview.machine
                          ? t("transfer.onMachine", { machine: preview.machine })
                          : "",
                        date: formatFullDate(preview.exportedAt),
                        version: preview.appVersion,
                        paths: t(
                          preview.portablePaths
                            ? "transfer.pathsPortable"
                            : "transfer.pathsAbsolute",
                        ),
                      })}
                    </p>
                  </div>

                  {preview.notes.length > 0 && (
                    <div className="section">
                      <h3>{t("transfer.notes")}</h3>
                      <div className="notes">
                        {preview.notes.map((note, i) => (
                          <div className="note" key={i}>
                            <span className={`tag ${note.level === "fixed" ? "fixed" : "warn"}`}>
                              {t(note.level === "fixed" ? "transfer.noteFixed" : "transfer.noteWarn")}
                            </span>
                            <span>
                              <strong>{note.subject}</strong> — {note.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="section">
                    <h3>{t("transfer.howApplied")}</h3>
                    <div className="field">
                      <label>
                        {t("transfer.settingsLabel")}{" "}
                        {!preview.hasSettings && t("transfer.notInFile")}
                      </label>
                      <ModeSelect
                        value={importOptions.settings}
                        disabled={!preview.hasSettings}
                        onChange={(settings) => setImportOptions((p) => ({ ...p, settings }))}
                        mergeHint={t("transfer.mergeSettings")}
                        t={t}
                      />
                    </div>
                    <div className="field">
                      <label>
                        {t("transfer.workspaceLabel")}{" "}
                        {!preview.hasWorkspace && t("transfer.notInFile")}
                      </label>
                      <ModeSelect
                        value={importOptions.workspace}
                        disabled={!preview.hasWorkspace}
                        onChange={(workspace) => setImportOptions((p) => ({ ...p, workspace }))}
                        mergeHint={t("transfer.mergeWorkspace")}
                        t={t}
                      />
                    </div>
                    <div className="field">
                      <label>
                        {t("transfer.historyLabel")}{" "}
                        {preview.history === 0 && t("transfer.notInFile")}
                      </label>
                      <ModeSelect
                        value={importOptions.history}
                        disabled={preview.history === 0}
                        onChange={(history) => setImportOptions((p) => ({ ...p, history }))}
                        mergeHint={t("transfer.mergeHistory")}
                        t={t}
                      />
                    </div>
                    <div className="field">
                      <label>
                        {t("transfer.favoritesLabel")}{" "}
                        {preview.favorites === 0 && t("transfer.notInFile")}
                      </label>
                      <ModeSelect
                        value={importOptions.favorites}
                        disabled={preview.favorites === 0}
                        onChange={(favorites) => setImportOptions((p) => ({ ...p, favorites }))}
                        mergeHint={t("transfer.mergeFavorites")}
                        t={t}
                      />
                    </div>
                    {preview.scrollback > 0 && (
                      <div className="check-row">
                        <input
                          id="imScrollback"
                          type="checkbox"
                          checked={importOptions.scrollback}
                          onChange={(e) =>
                            setImportOptions((p) => ({ ...p, scrollback: e.target.checked }))
                          }
                        />
                        <label htmlFor="imScrollback">{t("transfer.restoreScrollback")}</label>
                      </div>
                    )}
                  </div>
                </>
              )}

              {importResult && (
                <div className="section">
                  <h3>{t("transfer.applied")}</h3>
                  <ul className="dim" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    <li>
                      {t("transfer.appliedSettings", {
                        state: t(
                          importResult.settingsApplied
                            ? "transfer.stateApplied"
                            : "transfer.stateSkipped",
                        ),
                      })}
                    </li>
                    <li>
                      {t("transfer.appliedWorkspace", {
                        state: importResult.workspaceApplied
                          ? t("transfer.stateAppliedGroups", { n: importResult.groupsAdded })
                          : t("transfer.stateSkipped"),
                      })}
                    </li>
                    <li>{t("transfer.addedProfiles", { n: importResult.profilesAdded })}</li>
                    <li>{t("transfer.addedHistory", { n: importResult.historyAdded })}</li>
                    <li>{t("transfer.addedFavorites", { n: importResult.favoritesAdded })}</li>
                    <li>{t("transfer.addedScrollback", { n: importResult.scrollbackAdded })}</li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">
          <span className="dim mono" style={{ fontSize: 11 }}>
            {paths?.root}
          </span>
          <span className="spacer" />
          <button className="outline" onClick={close}>
            {t("common.close")}
          </button>
          {tab === "export" ? (
            <button className="primary" disabled={busy} onClick={() => void doExport()}>
              {t(busy ? "transfer.saving" : "transfer.saveToFile")}
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !preview}
              onClick={() => void doImport()}
            >
              {t(busy ? "transfer.applying" : "transfer.apply")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
