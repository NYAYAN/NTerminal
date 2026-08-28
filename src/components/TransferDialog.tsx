import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";

import { formatBytes, formatFullDate } from "../lib/format";
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

const MODE_LABELS: Record<ImportMode, string> = {
  replace: "Değiştir",
  merge: "Birleştir",
  skip: "Atla",
};

function ModeSelect({
  value,
  onChange,
  disabled,
  mergeHint,
}: {
  value: ImportMode;
  onChange: (mode: ImportMode) => void;
  disabled?: boolean;
  mergeHint?: string;
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
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      {mergeHint && value === "merge" && <div className="hintline">{mergeHint}</div>}
    </div>
  );
}

export function TransferDialog() {
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

      const suggested = await api.configExportDefaultName().catch(() => "nterminal-ayarlar.json");
      const target = await save({
        title: "Yapılandırmayı kaydet",
        defaultPath: suggested,
        filters: [{ name: "NTerminal yapılandırması", extensions: ["json"] }],
      });
      if (!target) return;

      const summary = await api.configExport(target, exportOptions);
      setExportResult(summary);
      store().toast("Yapılandırma dışa aktarıldı", "ok");
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
        title: "NTerminal yapılandırması seç",
        multiple: false,
        filters: [{ name: "NTerminal yapılandırması", extensions: ["json"] }],
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
    if (
      importOptions.workspace === "replace" &&
      !window.confirm(
        "Mevcut gruplar ve sekmeler gelen dosyayla değiştirilecek, açık kabuklar kapanacak. Devam edilsin mi?",
      )
    ) {
      return;
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
      store().toast("Yapılandırma içe alındı", "ok");
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
          <h2>Yapılandırma aktarımı</h2>
          <button className="icon-btn" onClick={close}>
            ×
          </button>
        </div>

        <div className="tabs-strip">
          <button className={tab === "export" ? "on" : ""} onClick={() => setTab("export")}>
            Dışa aktar
          </button>
          <button className={tab === "import" ? "on" : ""} onClick={() => setTab("import")}>
            İçe al
          </button>
        </div>

        <div className="modal-body">
          {tab === "export" && (
            <>
              <div className="section">
                <h3>Neler aktarılsın?</h3>
                <div className="check-row">
                  <input
                    id="exSettings"
                    type="checkbox"
                    checked={exportOptions.includeSettings}
                    onChange={(e) => patchExport({ includeSettings: e.target.checked })}
                  />
                  <label htmlFor="exSettings">
                    Ayarlar — görünüm, davranış, kabuk profilleri, kısayollar
                  </label>
                </div>
                <div className="check-row">
                  <input
                    id="exWorkspace"
                    type="checkbox"
                    checked={exportOptions.includeWorkspace}
                    onChange={(e) => patchExport({ includeWorkspace: e.target.checked })}
                  />
                  <label htmlFor="exWorkspace">
                    Çalışma alanı — gruplar, sekmeler ve klasörleri
                  </label>
                </div>
                <div className="check-row">
                  <input
                    id="exHistory"
                    type="checkbox"
                    checked={exportOptions.includeHistory}
                    onChange={(e) => patchExport({ includeHistory: e.target.checked })}
                  />
                  <label htmlFor="exHistory">Komut geçmişi</label>
                </div>
                <div className="check-row">
                  <input
                    id="exFavorites"
                    type="checkbox"
                    checked={exportOptions.includeFavorites}
                    onChange={(e) => patchExport({ includeFavorites: e.target.checked })}
                  />
                  <label htmlFor="exFavorites">Favori komutlar</label>
                </div>
                <div className="check-row">
                  <input
                    id="exScrollback"
                    type="checkbox"
                    disabled={!exportOptions.includeWorkspace}
                    checked={exportOptions.includeScrollback}
                    onChange={(e) => patchExport({ includeScrollback: e.target.checked })}
                  />
                  <label htmlFor="exScrollback">
                    Sekmelerin ekran çıktısı (dosyayı belirgin şekilde büyütür)
                  </label>
                </div>
              </div>

              <div className="section">
                <h3>Taşınabilirlik</h3>
                <div className="check-row">
                  <input
                    id="exPortable"
                    type="checkbox"
                    checked={exportOptions.portablePaths}
                    onChange={(e) => patchExport({ portablePaths: e.target.checked })}
                  />
                  <label htmlFor="exPortable">
                    Yolları makineden bağımsız hale getir
                  </label>
                </div>
                <p className="dim" style={{ fontSize: 11 }}>
                  Açıkken <span className="mono">C:\Users\{"{siz}"}\...</span> gibi yollar{" "}
                  <span className="mono">${"{HOME}"}</span> belirteciyle yazılır ve karşı makinede o
                  makinenin kendi yollarına açılır. Ayrıca içe alırken kabuk konumları (PowerShell,
                  Git Bash…) o makinede aranır; bulunamayan profiller rapor edilir.
                </p>
              </div>

              {exportResult && (
                <div className="section">
                  <h3>Sonuç</h3>
                  <div className="summary-grid">
                    <div className="cell">
                      <div className="n">{exportResult.profiles}</div>
                      <div className="k">profil</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.groups}</div>
                      <div className="k">grup</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.tabs}</div>
                      <div className="k">sekme</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.history}</div>
                      <div className="k">komut</div>
                    </div>
                    <div className="cell">
                      <div className="n">{exportResult.favorites}</div>
                      <div className="k">favori</div>
                    </div>
                    <div className="cell">
                      <div className="n">{formatBytes(exportResult.bytes)}</div>
                      <div className="k">dosya boyutu</div>
                    </div>
                  </div>
                  <div className="field">
                    <label>Dosya</label>
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
                        Klasörü aç
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
                <h3>Dosya</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="outline" disabled={busy} onClick={() => void choosePreview()}>
                    Dosya seç…
                  </button>
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    {preview?.path ?? "henüz seçilmedi"}
                  </span>
                </div>
              </div>

              {preview && (
                <>
                  <div className="section">
                    <h3>Dosya içeriği</h3>
                    <div className="summary-grid">
                      <div className="cell">
                        <div className="n">{preview.profiles}</div>
                        <div className="k">profil</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.groups}</div>
                        <div className="k">grup</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.tabs}</div>
                        <div className="k">sekme</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.history}</div>
                        <div className="k">komut</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.favorites}</div>
                        <div className="k">favori</div>
                      </div>
                      <div className="cell">
                        <div className="n">{preview.scrollback}</div>
                        <div className="k">ekran çıktısı</div>
                      </div>
                    </div>
                    <p className="dim" style={{ fontSize: 11 }}>
                      {preview.machine ? `${preview.machine} makinesinde ` : ""}
                      {formatFullDate(preview.exportedAt)} tarihinde NTerminal {preview.appVersion} ile
                      oluşturuldu. Yollar {preview.portablePaths ? "taşınabilir" : "mutlak"}.
                    </p>
                  </div>

                  {preview.notes.length > 0 && (
                    <div className="section">
                      <h3>Bu makine için düzeltmeler ve uyarılar</h3>
                      <div className="notes">
                        {preview.notes.map((note, i) => (
                          <div className="note" key={i}>
                            <span className={`tag ${note.level === "fixed" ? "fixed" : "warn"}`}>
                              {note.level === "fixed" ? "düzeltildi" : "uyarı"}
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
                    <h3>Nasıl uygulanacak?</h3>
                    <div className="field">
                      <label>Ayarlar {!preview.hasSettings && "(dosyada yok)"}</label>
                      <ModeSelect
                        value={importOptions.settings}
                        disabled={!preview.hasSettings}
                        onChange={(settings) => setImportOptions((p) => ({ ...p, settings }))}
                        mergeHint="Gelen tercihler geçerli olur; yerelde olup gelende olmayan profiller korunur."
                      />
                    </div>
                    <div className="field">
                      <label>Gruplar ve sekmeler {!preview.hasWorkspace && "(dosyada yok)"}</label>
                      <ModeSelect
                        value={importOptions.workspace}
                        disabled={!preview.hasWorkspace}
                        onChange={(workspace) => setImportOptions((p) => ({ ...p, workspace }))}
                        mergeHint="Gelen gruplar mevcutların yanına eklenir; ad çakışırsa '(gelen)' eki alır."
                      />
                    </div>
                    <div className="field">
                      <label>Komut geçmişi {preview.history === 0 && "(dosyada yok)"}</label>
                      <ModeSelect
                        value={importOptions.history}
                        disabled={preview.history === 0}
                        onChange={(history) => setImportOptions((p) => ({ ...p, history }))}
                        mergeHint="Gelen kayıtlar mevcut geçmişe eklenir, aynı kayıt iki kez yazılmaz."
                      />
                    </div>
                    <div className="field">
                      <label>Favori komutlar {preview.favorites === 0 && "(dosyada yok)"}</label>
                      <ModeSelect
                        value={importOptions.favorites}
                        disabled={preview.favorites === 0}
                        onChange={(favorites) => setImportOptions((p) => ({ ...p, favorites }))}
                        mergeHint="Gelen favoriler mevcutlara eklenir; aynı komut iki kez yazılmaz."
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
                        <label htmlFor="imScrollback">
                          Sekmelerin ekran çıktısını da geri yükle
                        </label>
                      </div>
                    )}
                  </div>
                </>
              )}

              {importResult && (
                <div className="section">
                  <h3>Uygulandı</h3>
                  <ul className="dim" style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    <li>Ayarlar: {importResult.settingsApplied ? "uygulandı" : "atlandı"}</li>
                    <li>
                      Çalışma alanı:{" "}
                      {importResult.workspaceApplied
                        ? `uygulandı (${importResult.groupsAdded} grup)`
                        : "atlandı"}
                    </li>
                    <li>Eklenen profil: {importResult.profilesAdded}</li>
                    <li>Eklenen komut kaydı: {importResult.historyAdded}</li>
                    <li>Eklenen favori: {importResult.favoritesAdded}</li>
                    <li>Geri yüklenen ekran çıktısı: {importResult.scrollbackAdded}</li>
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
            Kapat
          </button>
          {tab === "export" ? (
            <button className="primary" disabled={busy} onClick={() => void doExport()}>
              {busy ? "Kaydediliyor…" : "Dosyaya kaydet…"}
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !preview}
              onClick={() => void doImport()}
            >
              {busy ? "Uygulanıyor…" : "Uygula"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
