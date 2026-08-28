import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { formatBytes } from "../lib/format";
import { api } from "../lib/ipc";
import { ACTION_LABELS, comboFromEvent, prettyCombo } from "../lib/keys";
import { THEMES } from "../lib/themes";
import { useStore } from "../store/useStore";
import type { Profile, ShellKind } from "../types";
import { EnvEditor } from "./EnvEditor";

type Section = "appearance" | "behavior" | "profiles" | "groups" | "keys" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "appearance", label: "Görünüm" },
  { id: "behavior", label: "Davranış" },
  { id: "profiles", label: "Profiller" },
  { id: "groups", label: "Gruplar" },
  { id: "keys", label: "Kısayollar" },
  { id: "about", label: "Hakkında" },
];

const SHELL_KINDS: { value: ShellKind; label: string }[] = [
  { value: "pwsh", label: "PowerShell 7+ (pwsh)" },
  { value: "power-shell", label: "Windows PowerShell 5.1" },
  { value: "cmd", label: "Komut İstemi (cmd)" },
  { value: "bash", label: "Bash (Git Bash / MSYS)" },
  { value: "wsl", label: "WSL" },
  { value: "custom", label: "Özel (entegrasyon yok)" },
];

function pickFolder(current: string | null): Promise<string | null> {
  return open({
    directory: true,
    multiple: false,
    defaultPath: current ?? undefined,
    title: "Klasör seç",
  }).then((res) => (typeof res === "string" ? res : null));
}

function pickExe(current: string | null): Promise<string | null> {
  return open({
    multiple: false,
    defaultPath: current ?? undefined,
    title: "Kabuk çalıştırılabiliri seç",
    filters: [{ name: "Program", extensions: ["exe", "cmd", "bat", "com"] }],
  }).then((res) => (typeof res === "string" ? res : null));
}

export function SettingsDialog() {
  const settings = useStore((s) => s.settings);
  const groups = useStore((s) => s.groups);
  const paths = useStore((s) => s.paths);
  const appVersion = useStore((s) => s.appVersion);
  const editingGroupId = useStore((s) => s.ui.editingGroupId);
  const setUi = useStore((s) => s.setUi);

  const [section, setSection] = useState<Section>(editingGroupId ? "groups" : "appearance");
  const [selectedProfileId, setSelectedProfileId] = useState(settings.profiles[0]?.id ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState(editingGroupId ?? groups[0]?.id ?? "");
  const [capturing, setCapturing] = useState<string | null>(null);
  const [historySize, setHistorySize] = useState<string>("");

  const store = useStore.getState;
  const close = () => setUi({ settingsOpen: false, editingGroupId: null });

  const profile = settings.profiles.find((p) => p.id === selectedProfileId);
  const group = groups.find((g) => g.id === selectedGroupId);

  const updateProfile = (patch: Partial<Profile>) => {
    if (!profile) return;
    void store().setProfiles(
      settings.profiles.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)),
    );
  };

  const addProfile = () => {
    const id = `prof-${crypto.randomUUID().replace(/-/g, "")}`;
    const fresh: Profile = {
      id,
      name: "Yeni profil",
      kind: "pwsh",
      shell: "",
      args: [],
      cwd: null,
      env: {},
      shellIntegration: true,
      color: "#58a6ff",
      icon: null,
      unavailable: false,
    };
    void store().setProfiles([...settings.profiles, fresh]);
    setSelectedProfileId(id);
  };

  const removeProfile = () => {
    if (!profile) return;
    if (settings.profiles.length <= 1) {
      store().toast("En az bir profil kalmalı", "err");
      return;
    }
    const rest = settings.profiles.filter((p) => p.id !== profile.id);
    void store().setProfiles(rest);
    setSelectedProfileId(rest[0].id);
  };

  const rescan = async () => {
    const detected = await api.detectProfiles().catch(() => []);
    // Aynı exe zaten tanımlıysa tekrar eklemiyoruz; kullanıcının düzenlediği
    // profiller olduğu gibi kalsın.
    const known = new Set(settings.profiles.map((p) => p.shell.toLowerCase()));
    const missing = detected.filter((p) => !known.has(p.shell.toLowerCase()));
    if (missing.length === 0) {
      store().toast("Yeni kabuk bulunamadı", "info");
      return;
    }
    await store().setProfiles([...settings.profiles, ...missing]);
    store().toast(`${missing.length} profil eklendi`, "ok");
  };

  // Geçmiş boyutunu yalnızca ilgili bölüm açıldığında oku.
  useEffect(() => {
    if (section !== "behavior") return;
    let alive = true;
    void api
      .historyStats()
      .then((stats) => {
        if (alive) {
          setHistorySize(
            `${stats.total.toLocaleString("tr-TR")} kayıt · ${formatBytes(stats.fileBytes)}`,
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [section]);

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Ayarlar</h2>
          <span className="dim mono" style={{ fontSize: 11 }}>
            {paths?.settingsFile}
          </span>
          <button className="icon-btn" onClick={close}>
            ×
          </button>
        </div>

        <div className="tabs-strip">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? "on" : ""} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {section === "appearance" && (
            <>
              <div className="section">
                <h3>Tema</h3>
                <div className="field">
                  <label>Renk teması</label>
                  <select
                    value={settings.appearance.theme}
                    onChange={(e) => void store().patchAppearance({ theme: e.target.value })}
                  >
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="section">
                <h3>Yazı tipi</h3>
                <div className="field">
                  <label>Yazı tipi ailesi</label>
                  <input
                    value={settings.appearance.fontFamily}
                    onChange={(e) => void store().patchAppearance({ fontFamily: e.target.value })}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="field">
                  <label>Boyut ({settings.appearance.fontSize} px)</label>
                  <input
                    type="range"
                    min={8}
                    max={28}
                    value={settings.appearance.fontSize}
                    onChange={(e) => void store().patchAppearance({ fontSize: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label>Satır yüksekliği ({settings.appearance.lineHeight.toFixed(2)})</label>
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={settings.appearance.lineHeight}
                    onChange={(e) => void store().patchAppearance({ lineHeight: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label>Harf aralığı ({settings.appearance.letterSpacing})</label>
                  <input
                    type="range"
                    min={-1}
                    max={3}
                    step={0.5}
                    value={settings.appearance.letterSpacing}
                    onChange={(e) => void store().patchAppearance({ letterSpacing: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="section">
                <h3>İmleç ve kaydırma</h3>
                <div className="field">
                  <label>İmleç biçimi</label>
                  <select
                    value={settings.appearance.cursorStyle}
                    onChange={(e) =>
                      void store().patchAppearance({
                        cursorStyle: e.target.value as "block" | "bar" | "underline",
                      })
                    }
                  >
                    <option value="bar">Çizgi</option>
                    <option value="block">Blok</option>
                    <option value="underline">Alt çizgi</option>
                  </select>
                </div>
                <div className="check-row">
                  <input
                    id="cursorBlink"
                    type="checkbox"
                    checked={settings.appearance.cursorBlink}
                    onChange={(e) => void store().patchAppearance({ cursorBlink: e.target.checked })}
                  />
                  <label htmlFor="cursorBlink">İmleç yanıp sönsün</label>
                </div>
                <div className="field">
                  <label>Kaydırma tamponu (satır)</label>
                  <input
                    type="number"
                    min={500}
                    max={200000}
                    step={500}
                    value={settings.appearance.scrollback}
                    onChange={(e) => void store().patchAppearance({ scrollback: Number(e.target.value) })}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="hintline">
                    Terminalde geriye doğru kaç satır saklanacağı. Yüksek değer daha çok bellek kullanır.
                  </div>
                </div>
              </div>
            </>
          )}

          {section === "behavior" && (
            <>
              <div className="section">
                <h3>Oturum devamlılığı</h3>
                <div className="check-row">
                  <input
                    id="restoreSession"
                    type="checkbox"
                    checked={settings.behavior.restoreSession}
                    onChange={(e) => void store().patchBehavior({ restoreSession: e.target.checked })}
                  />
                  <label htmlFor="restoreSession">
                    Açılışta grup ve sekme düzenini geri yükle
                  </label>
                </div>
                <div className="check-row">
                  <input
                    id="restoreScrollback"
                    type="checkbox"
                    checked={settings.behavior.restoreScrollback}
                    onChange={(e) => void store().patchBehavior({ restoreScrollback: e.target.checked })}
                  />
                  <label htmlFor="restoreScrollback">
                    Sekmelerin ekran çıktısını da geri yükle
                  </label>
                </div>
                <div className="field">
                  <label>Sekme başına kaydedilecek satır</label>
                  <input
                    type="number"
                    min={0}
                    max={20000}
                    step={100}
                    value={settings.behavior.scrollbackSaveLines}
                    onChange={(e) =>
                      void store().patchBehavior({ scrollbackSaveLines: Number(e.target.value) })
                    }
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="hintline">
                    Diske yazılan satır sayısı. Kabuk süreçleri kapanır; geri yüklenen içerik geçmiş
                    ekran görüntüsüdür, canlı çıktı değildir.
                  </div>
                </div>
                <div className="check-row">
                  <input
                    id="inheritCwd"
                    type="checkbox"
                    checked={settings.behavior.inheritCwd}
                    onChange={(e) => void store().patchBehavior({ inheritCwd: e.target.checked })}
                  />
                  <label htmlFor="inheritCwd">Yeni sekme etkin sekmenin klasöründe açılsın</label>
                </div>
              </div>

              <div className="section">
                <h3>Terminal</h3>
                <div className="check-row">
                  <input
                    id="copyOnSelect"
                    type="checkbox"
                    checked={settings.behavior.copyOnSelect}
                    onChange={(e) => void store().patchBehavior({ copyOnSelect: e.target.checked })}
                  />
                  <label htmlFor="copyOnSelect">Seçim yapınca panoya kopyala</label>
                </div>
                <div className="check-row">
                  <input
                    id="pasteOnRightClick"
                    type="checkbox"
                    checked={settings.behavior.pasteOnRightClick}
                    onChange={(e) => void store().patchBehavior({ pasteOnRightClick: e.target.checked })}
                  />
                  <label htmlFor="pasteOnRightClick">Sağ tık yapıştırsın</label>
                </div>
                <div className="check-row">
                  <input
                    id="confirmCloseRunning"
                    type="checkbox"
                    checked={settings.behavior.confirmCloseRunning}
                    onChange={(e) =>
                      void store().patchBehavior({ confirmCloseRunning: e.target.checked })
                    }
                  />
                  <label htmlFor="confirmCloseRunning">
                    Komut çalışırken sekme kapatılmak istenirse onay sor
                  </label>
                </div>
              </div>

              <div className="section">
                <h3>Komut geçmişi</h3>
                <div className="field">
                  <label>Azami kayıt sayısı</label>
                  <input
                    type="number"
                    min={100}
                    max={500000}
                    step={1000}
                    value={settings.behavior.historyLimit}
                    onChange={(e) => void store().patchBehavior({ historyLimit: Number(e.target.value) })}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="hintline">Sınır aşılınca en eski kayıtlar silinir. Şu an: {historySize || "okunuyor…"}</div>
                </div>
                <div className="check-row">
                  <input
                    id="historyDedupe"
                    type="checkbox"
                    checked={settings.behavior.historyDedupe}
                    onChange={(e) => void store().patchBehavior({ historyDedupe: e.target.checked })}
                  />
                  <label htmlFor="historyDedupe">
                    Geçmiş panelinde tekrarları varsayılan olarak gizle
                  </label>
                </div>
              </div>
            </>
          )}

          {section === "profiles" && (
            <div className="profile-grid">
              <div>
                <div className="profile-list">
                  {settings.profiles.map((p) => (
                    <div
                      key={p.id}
                      className={p.id === selectedProfileId ? "row on" : "row"}
                      onClick={() => setSelectedProfileId(p.id)}
                    >
                      <span
                        className="dot"
                        style={{ background: p.color ?? "#666", width: 8, height: 8, borderRadius: "50%" }}
                      />
                      <span className="nm">{p.name}</span>
                      {p.id === settings.defaultProfileId && <span className="kbd">varsayılan</span>}
                      {p.unavailable && <span className="kbd err-text">yok</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button className="outline" onClick={addProfile}>
                    + Ekle
                  </button>
                  <button className="outline" onClick={() => void rescan()} title="Makinedeki kabukları tara">
                    Tara
                  </button>
                  <button className="danger" onClick={removeProfile}>
                    Sil
                  </button>
                </div>
              </div>

              <div>
                {!profile && <div className="hint">Soldan bir profil seçin.</div>}
                {profile && (
                  <>
                    <div className="field">
                      <label>Ad</label>
                      <input
                        value={profile.name}
                        onChange={(e) => updateProfile({ name: e.target.value })}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="field">
                      <label>Kabuk türü</label>
                      <select
                        value={profile.kind}
                        onChange={(e) => updateProfile({ kind: e.target.value as ShellKind })}
                      >
                        {SHELL_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                      <div className="hintline">
                        Tür, kabuk entegrasyon betiğinin nasıl yükleneceğini belirler.
                      </div>
                    </div>
                    <div className="field">
                      <label>Çalıştırılabilir</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ flex: 1 }}
                          className="mono"
                          placeholder="boş = türe göre varsayılan"
                          value={profile.shell}
                          onChange={(e) => updateProfile({ shell: e.target.value })}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <button
                          className="outline"
                          onClick={() =>
                            void pickExe(profile.shell).then((p) => p && updateProfile({ shell: p }))
                          }
                        >
                          Gözat
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label>Argümanlar</label>
                      <input
                        className="mono"
                        placeholder="boşlukla ayrılmış"
                        value={profile.args.join(" ")}
                        onChange={(e) =>
                          updateProfile({
                            args: e.target.value.split(" ").filter((a) => a.length > 0),
                          })
                        }
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="field">
                      <label>Başlangıç klasörü</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ flex: 1 }}
                          className="mono"
                          placeholder="boş = ev dizini"
                          value={profile.cwd ?? ""}
                          onChange={(e) => updateProfile({ cwd: e.target.value || null })}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <button
                          className="outline"
                          onClick={() => void pickFolder(profile.cwd).then((p) => p && updateProfile({ cwd: p }))}
                        >
                          Gözat
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label>Renk</label>
                      <input
                        type="color"
                        value={profile.color ?? "#58a6ff"}
                        onChange={(e) => updateProfile({ color: e.target.value })}
                      />
                    </div>
                    <div className="check-row">
                      <input
                        id="shellIntegration"
                        type="checkbox"
                        checked={profile.shellIntegration}
                        onChange={(e) => updateProfile({ shellIntegration: e.target.checked })}
                      />
                      <label htmlFor="shellIntegration">
                        Kabuk entegrasyonunu yükle (komut metni, çıkış kodu, dizin)
                      </label>
                    </div>
                    <div className="check-row">
                      <input
                        id="isDefault"
                        type="checkbox"
                        checked={settings.defaultProfileId === profile.id}
                        onChange={() => void store().setProfiles(settings.profiles, profile.id)}
                      />
                      <label htmlFor="isDefault">Varsayılan profil</label>
                    </div>

                    <div className="section" style={{ marginTop: 14 }}>
                      <h3>Ortam değişkenleri</h3>
                      <EnvEditor value={profile.env} onChange={(env) => updateProfile({ env })} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {section === "groups" && (
            <div className="profile-grid">
              <div className="profile-list">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className={g.id === selectedGroupId ? "row on" : "row"}
                    onClick={() => setSelectedGroupId(g.id)}
                  >
                    <span
                      className="dot"
                      style={{ background: g.color ?? "#666", width: 8, height: 8, borderRadius: "50%" }}
                    />
                    <span className="nm">{g.name}</span>
                    <span className="kbd">{g.tabs.length}</span>
                  </div>
                ))}
              </div>

              <div>
                {!group && <div className="hint">Soldan bir grup seçin.</div>}
                {group && (
                  <>
                    <div className="field">
                      <label>Grup adı</label>
                      <input
                        value={group.name}
                        onChange={(e) => store().updateGroup(group.id, { name: e.target.value })}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="field">
                      <label>Renk</label>
                      <input
                        type="color"
                        value={group.color ?? "#58a6ff"}
                        onChange={(e) => store().updateGroup(group.id, { color: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Varsayılan profil</label>
                      <select
                        value={group.defaultProfileId ?? ""}
                        onChange={(e) =>
                          store().updateGroup(group.id, { defaultProfileId: e.target.value || null })
                        }
                      >
                        <option value="">(uygulama varsayılanı)</option>
                        {settings.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <div className="hintline">Bu gruptaki yeni sekmeler bu profille açılır.</div>
                    </div>
                    <div className="field">
                      <label>Başlangıç klasörü</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ flex: 1 }}
                          className="mono"
                          placeholder="boş = profilin klasörü"
                          value={group.defaultCwd ?? ""}
                          onChange={(e) =>
                            store().updateGroup(group.id, { defaultCwd: e.target.value || null })
                          }
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <button
                          className="outline"
                          onClick={() =>
                            void pickFolder(group.defaultCwd).then(
                              (p) => p && store().updateGroup(group.id, { defaultCwd: p }),
                            )
                          }
                        >
                          Gözat
                        </button>
                      </div>
                    </div>

                    <div className="section" style={{ marginTop: 14 }}>
                      <h3>Gruba özel ortam değişkenleri</h3>
                      <p className="dim" style={{ marginTop: 0, fontSize: 11 }}>
                        Profilin değişkenlerinin üstüne yazılır. Örnek: bir proje grubunda{" "}
                        <span className="mono">NODE_ENV=development</span>.
                      </p>
                      <EnvEditor
                        value={group.env}
                        onChange={(env) => store().updateGroup(group.id, { env })}
                      />
                      <p className="dim" style={{ fontSize: 11 }}>
                        Değişiklikler yeni açılan sekmelerde geçerli olur.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {section === "keys" && (
            <div className="section">
              <h3>Klavye kısayolları</h3>
              <p className="dim" style={{ fontSize: 11, marginTop: 0 }}>
                Değiştirmek için kutuya tıklayın ve tuş bileşimine basın. Kısayollar ayarlarla birlikte
                dışa aktarılır.
              </p>
              {Object.entries(settings.keybindings).map(([action, combo]) => (
                <div className="field" key={action}>
                  <label>{ACTION_LABELS[action] ?? action}</label>
                  <input
                    className="mono"
                    readOnly
                    value={capturing === action ? "tuşa basın…" : prettyCombo(combo)}
                    onFocus={() => setCapturing(action)}
                    onBlur={() => setCapturing(null)}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.key === "Escape") {
                        setCapturing(null);
                        e.currentTarget.blur();
                        return;
                      }
                      const next = comboFromEvent(e.nativeEvent);
                      if (!next) return;
                      void store().patchSettings({
                        keybindings: { ...settings.keybindings, [action]: next },
                      });
                      setCapturing(null);
                      e.currentTarget.blur();
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {section === "about" && (
            <>
              <div className="section">
                <h3>NTerminal {appVersion}</h3>
                <p className="dim">
                  Gruplanabilir sekmeli Windows terminali. Tauri + Rust (ConPTY) ve xterm.js üzerine kurulu.
                </p>
              </div>
              <div className="section">
                <h3>Dosya konumları</h3>
                {paths && (
                  <>
                    <div className="field">
                      <label>Veri klasörü</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input readOnly className="mono" style={{ flex: 1 }} value={paths.root} />
                        <button className="outline" onClick={() => void api.revealInExplorer(paths.root)}>
                          Aç
                        </button>
                      </div>
                      <div className="hintline">
                        {paths.portable
                          ? "Taşınabilir kip: ayarlar uygulamanın yanındaki klasörde tutuluyor."
                          : "Taşınabilir kip için exe'nin yanına nterminal-data adlı bir klasör açın."}
                      </div>
                    </div>
                    <div className="field">
                      <label>Ayarlar</label>
                      <input readOnly className="mono" value={paths.settingsFile} />
                    </div>
                    <div className="field">
                      <label>Çalışma alanı</label>
                      <input readOnly className="mono" value={paths.workspaceFile} />
                    </div>
                    <div className="field">
                      <label>Komut geçmişi</label>
                      <input readOnly className="mono" value={paths.historyFile} />
                    </div>
                    <div className="field">
                      <label>Kabuk entegrasyonu</label>
                      <input readOnly className="mono" value={paths.integrationDir} />
                    </div>
                  </>
                )}
              </div>
              <div className="section">
                <h3>Sıfırlama</h3>
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Tüm ayarlar ve profiller varsayılanlara dönecek. Gruplar ve sekmeler etkilenmez. Devam edilsin mi?",
                      )
                    ) {
                      void store().resetSettings();
                    }
                  }}
                >
                  Ayarları varsayılanlara döndür
                </button>
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <span className="dim">Değişiklikler anında kaydedilir.</span>
          <span className="spacer" />
          <button className="outline" onClick={() => setUi({ settingsOpen: false, transferOpen: true })}>
            İçe / dışa aktar…
          </button>
          <button className="primary" onClick={close}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
