import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { formatBytes } from "../lib/format";
import { api } from "../lib/ipc";
import { LANGS, tp, useT, type Translate } from "../lib/i18n";
import { actionLabel, comboFromEvent, prettyCombo } from "../lib/keys";
import type { MsgKey } from "../lib/messages";
import { THEMES } from "../lib/themes";
import { useStore } from "../store/useStore";
import type {
  ConfirmCloseTab,
  Lang,
  Profile,
  RightClickAction,
  ShellKind,
  ShellPrediction,
  ViewMode,
} from "../types";
import { EnvEditor } from "./EnvEditor";

type Section = "appearance" | "behavior" | "profiles" | "groups" | "keys" | "about";

const SECTIONS: { id: Section; key: MsgKey }[] = [
  { id: "appearance", key: "settings.appearance" },
  { id: "behavior", key: "settings.behavior" },
  { id: "profiles", key: "settings.profiles" },
  { id: "groups", key: "settings.groups" },
  { id: "keys", key: "settings.keys" },
  { id: "about", key: "settings.about" },
];

const VIEW_MODES: { value: ViewMode; key: MsgKey }[] = [
  { value: "tabs", key: "view.tabs" },
  { value: "panes", key: "view.panes" },
];

/**
 * Kabuk adlari cevrilmiyor: "PowerShell 7+ (pwsh)" bir urun adi. Yalnizca
 * aciklama tasiyan iki girdi (cmd, ozel) ceviriden geliyor.
 */
const SHELL_KINDS: { value: ShellKind; label?: string; key?: MsgKey }[] = [
  { value: "pwsh", label: "PowerShell 7+ (pwsh)" },
  { value: "power-shell", label: "Windows PowerShell 5.1" },
  { value: "cmd", key: "settings.shellCmd" },
  { value: "bash", label: "Bash (Git Bash / MSYS)" },
  { value: "wsl", label: "WSL" },
  { value: "custom", key: "settings.shellCustom" },
];

function pickFolder(t: Translate, current: string | null): Promise<string | null> {
  return open({
    directory: true,
    multiple: false,
    defaultPath: current ?? undefined,
    title: t("settings.pickFolder"),
  }).then((res) => (typeof res === "string" ? res : null));
}

function pickExe(t: Translate, current: string | null): Promise<string | null> {
  return open({
    multiple: false,
    defaultPath: current ?? undefined,
    title: t("settings.pickShell"),
    filters: [{ name: "Program", extensions: ["exe", "cmd", "bat", "com"] }],
  }).then((res) => (typeof res === "string" ? res : null));
}

export function SettingsDialog() {
  const t = useT();
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
      store().toast(t("settings.atLeastOneProfile"), "err");
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
      store().toast(t("settings.noNewShell"), "info");
      return;
    }
    await store().setProfiles([...settings.profiles, ...missing]);
    store().toast(tp("settings.profilesAdded", missing.length), "ok");
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
          <h2>{t("settings.title")}</h2>
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
              {t(s.key)}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {section === "appearance" && (
            <>
              <div className="section">
                <h3>{t("settings.language")}</h3>
                <div className="field">
                  <label>{t("settings.languageLabel")}</label>
                  <select
                    value={settings.language}
                    onChange={(e) => void store().setLanguage(e.target.value as Lang)}
                  >
                    {LANGS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hintline">{t("settings.languageHint")}</div>
              </div>

              <div className="section">
                <h3>{t("view.heading")}</h3>
                <div className="seg">
                  {VIEW_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      className={settings.appearance.viewMode === mode.value ? "on" : ""}
                      onClick={() => void store().setViewMode(mode.value)}
                    >
                      {t(mode.key)}
                    </button>
                  ))}
                </div>
                <div className="hintline">
                  {t(
                    settings.appearance.viewMode === "panes"
                      ? "view.panesHint"
                      : "view.tabsHint",
                  )}{" "}
                  {t("view.shortcut", {
                    keys: prettyCombo(settings.keybindings.toggleViewMode ?? "Ctrl+Shift+E"),
                  })}
                </div>
              </div>

              <div className="section">
                <h3>{t("settings.theme")}</h3>
                <div className="field">
                  <label>{t("settings.colorTheme")}</label>
                  <select
                    value={settings.appearance.theme}
                    onChange={(e) => void store().patchAppearance({ theme: e.target.value })}
                  >
                    {THEMES.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {t(theme.nameKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="section">
                <h3>{t("settings.font")}</h3>
                <div className="field">
                  <label>{t("settings.fontFamily")}</label>
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
                <h3>{t("settings.terminal")}</h3>
                <div className="check-row">
                  <input
                    id="highlightLinks"
                    type="checkbox"
                    checked={settings.appearance.highlightLinks}
                    onChange={(e) =>
                      void store().patchAppearance({ highlightLinks: e.target.checked })
                    }
                  />
                  <label htmlFor="highlightLinks">{t("settings.highlightLinks")}</label>
                </div>
                <div className="hintline">{t("settings.highlightLinksHint")}</div>
              </div>

              <div className="section">
                <h3>{t("settings.cursorScroll")}</h3>
                <div className="field">
                  <label>{t("settings.cursorStyle")}</label>
                  <select
                    value={settings.appearance.cursorStyle}
                    onChange={(e) =>
                      void store().patchAppearance({
                        cursorStyle: e.target.value as "block" | "bar" | "underline",
                      })
                    }
                  >
                    <option value="bar">{t("settings.cursorBar")}</option>
                    <option value="block">{t("settings.cursorBlock")}</option>
                    <option value="underline">{t("settings.cursorUnderline")}</option>
                  </select>
                </div>
                <div className="check-row">
                  <input
                    id="cursorBlink"
                    type="checkbox"
                    checked={settings.appearance.cursorBlink}
                    onChange={(e) => void store().patchAppearance({ cursorBlink: e.target.checked })}
                  />
                  <label htmlFor="cursorBlink">{t("settings.cursorBlink")}</label>
                </div>
                <div className="field">
                  <label>{t("settings.scrollbackLines")}</label>
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
                <h3>{t("settings.sessionRestore")}</h3>
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
                  <label>{t("settings.scrollbackPerTab")}</label>
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
                  <label htmlFor="inheritCwd">{t("settings.inheritCwd")}</label>
                </div>
              </div>

              <div className="section">
                <h3>{t("settings.terminal")}</h3>
                <div className="check-row">
                  <input
                    id="copyOnSelect"
                    type="checkbox"
                    checked={settings.behavior.copyOnSelect}
                    onChange={(e) => void store().patchBehavior({ copyOnSelect: e.target.checked })}
                  />
                  <label htmlFor="copyOnSelect">{t("settings.copyOnSelect")}</label>
                </div>
                <div className="field">
                  <label>{t("settings.rightClick")}</label>
                  <select
                    value={settings.behavior.rightClickAction}
                    onChange={(e) =>
                      void store().patchBehavior({
                        rightClickAction: e.target.value as RightClickAction,
                      })
                    }
                  >
                    <option value="menu">{t("settings.rightClickMenu")}</option>
                    <option value="copyPaste">{t("settings.rightClickCopyPaste")}</option>
                    <option value="paste">{t("settings.rightClickPaste")}</option>
                  </select>
                </div>
                <div className="check-row">
                  <input
                    id="ctrlCCopiesSelection"
                    type="checkbox"
                    checked={settings.behavior.ctrlCCopiesSelection}
                    onChange={(e) =>
                      void store().patchBehavior({ ctrlCCopiesSelection: e.target.checked })
                    }
                  />
                  <label htmlFor="ctrlCCopiesSelection">{t("settings.ctrlCCopies")}</label>
                </div>
                <div className="hintline">{t("settings.ctrlCHint")}</div>
                <div className="check-row">
                  <input
                    id="appSuggestions"
                    type="checkbox"
                    checked={settings.behavior.appSuggestions}
                    onChange={(e) =>
                      void store().patchBehavior({ appSuggestions: e.target.checked })
                    }
                  />
                  <label htmlFor="appSuggestions">{t("settings.appSuggestions")}</label>
                </div>
                <div className="hintline">{t("settings.appSuggestionsHint")}</div>

                <div className="field">
                  <label>{t("settings.prediction")}</label>
                  <select
                    value={settings.behavior.shellPrediction}
                    onChange={(e) =>
                      void store().patchBehavior({
                        shellPrediction: e.target.value as ShellPrediction,
                      })
                    }
                  >
                    <option value="list">{t("settings.predictionList")}</option>
                    <option value="inline">{t("settings.predictionInline")}</option>
                    <option value="off">{t("settings.predictionOff")}</option>
                  </select>
                </div>
                <div className="hintline">{t("settings.predictionHint")}</div>

                <div className="field">
                  <label>{t("settings.confirmCloseTab")}</label>
                  <select
                    value={settings.behavior.confirmCloseTab}
                    onChange={(e) =>
                      void store().patchBehavior({
                        confirmCloseTab: e.target.value as ConfirmCloseTab,
                      })
                    }
                  >
                    <option value="always">{t("settings.confirmAlways")}</option>
                    <option value="running">{t("settings.confirmRunning")}</option>
                    <option value="never">{t("settings.confirmNever")}</option>
                  </select>
                </div>
                <div className="hintline">{t("settings.confirmCloseTabHint")}</div>
              </div>

              <div className="section">
                <h3>{t("settings.history")}</h3>
                <div className="field">
                  <label>{t("settings.historyLimit")}</label>
                  <input
                    type="number"
                    min={100}
                    max={500000}
                    step={1000}
                    value={settings.behavior.historyLimit}
                    onChange={(e) => void store().patchBehavior({ historyLimit: Number(e.target.value) })}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="hintline">
                    {t("settings.historyLimitHint", {
                      size: historySize || t("settings.historyReading"),
                    })}
                  </div>
                </div>
                <div className="check-row">
                  <input
                    id="historyDedupe"
                    type="checkbox"
                    checked={settings.behavior.historyDedupe}
                    onChange={(e) => void store().patchBehavior({ historyDedupe: e.target.checked })}
                  />
                  <label htmlFor="historyDedupe">{t("settings.historyDedupeDefault")}</label>
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
                      {p.id === settings.defaultProfileId && (
                        <span className="kbd">{t("common.default")}</span>
                      )}
                      {p.unavailable && <span className="kbd err-text">{t("common.missing")}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button className="outline" onClick={addProfile}>
                    {t("settings.addProfile")}
                  </button>
                  <button
                    className="outline"
                    onClick={() => void rescan()}
                    title={t("settings.rescan")}
                  >
                    {t("settings.scan")}
                  </button>
                  <button className="danger" onClick={removeProfile}>
                    {t("settings.removeProfile")}
                  </button>
                </div>
              </div>

              <div>
                {!profile && <div className="hint">{t("settings.pickProfile")}</div>}
                {profile && (
                  <>
                    <div className="field">
                      <label>{t("common.name")}</label>
                      <input
                        value={profile.name}
                        onChange={(e) => updateProfile({ name: e.target.value })}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="field">
                      <label>{t("settings.shellKind")}</label>
                      <select
                        value={profile.kind}
                        onChange={(e) => updateProfile({ kind: e.target.value as ShellKind })}
                      >
                        {SHELL_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label ?? t(k.key!)}
                          </option>
                        ))}
                      </select>
                      <div className="hintline">
                        Tür, kabuk entegrasyon betiğinin nasıl yükleneceğini belirler.
                      </div>
                    </div>
                    <div className="field">
                      <label>{t("settings.executable")}</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ flex: 1 }}
                          className="mono"
                          placeholder={t("settings.executablePlaceholder")}
                          value={profile.shell}
                          onChange={(e) => updateProfile({ shell: e.target.value })}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <button
                          className="outline"
                          onClick={() =>
                            void pickExe(t, profile.shell).then((p) => p && updateProfile({ shell: p }))
                          }
                        >
                          Gözat
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label>{t("settings.args")}</label>
                      <input
                        className="mono"
                        placeholder={t("settings.argsPlaceholder")}
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
                      <label>{t("settings.startFolder")}</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ flex: 1 }}
                          className="mono"
                          placeholder={t("settings.startFolderHome")}
                          value={profile.cwd ?? ""}
                          onChange={(e) => updateProfile({ cwd: e.target.value || null })}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <button
                          className="outline"
                          onClick={() =>
                            void pickFolder(t, profile.cwd).then((p) => p && updateProfile({ cwd: p }))
                          }
                        >
                          Gözat
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label>{t("common.color")}</label>
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
                        {t("settings.shellIntegrationLoad")}
                      </label>
                    </div>
                    <div className="check-row">
                      <input
                        id="isDefault"
                        type="checkbox"
                        checked={settings.defaultProfileId === profile.id}
                        onChange={() => void store().setProfiles(settings.profiles, profile.id)}
                      />
                      <label htmlFor="isDefault">{t("settings.defaultProfile")}</label>
                    </div>

                    <div className="section" style={{ marginTop: 14 }}>
                      <h3>{t("settings.envVars")}</h3>
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
                {!group && <div className="hint">{t("settings.pickGroup")}</div>}
                {group && (
                  <>
                    <div className="field">
                      <label>{t("settings.groupName")}</label>
                      <input
                        value={group.name}
                        onChange={(e) => store().updateGroup(group.id, { name: e.target.value })}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="field">
                      <label>{t("common.color")}</label>
                      <input
                        type="color"
                        value={group.color ?? "#58a6ff"}
                        onChange={(e) => store().updateGroup(group.id, { color: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>{t("settings.groupDefaultProfile")}</label>
                      <select
                        value={group.defaultProfileId ?? ""}
                        onChange={(e) =>
                          store().updateGroup(group.id, { defaultProfileId: e.target.value || null })
                        }
                      >
                        <option value="">{t("settings.appDefault")}</option>
                        {settings.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <div className="hintline">{t("settings.groupProfileHint")}</div>
                    </div>
                    <div className="field">
                      <label>{t("settings.startFolder")}</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ flex: 1 }}
                          className="mono"
                          placeholder={t("settings.startFolderProfile")}
                          value={group.defaultCwd ?? ""}
                          onChange={(e) =>
                            store().updateGroup(group.id, { defaultCwd: e.target.value || null })
                          }
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <button
                          className="outline"
                          onClick={() =>
                            void pickFolder(t, group.defaultCwd).then(
                              (p) => p && store().updateGroup(group.id, { defaultCwd: p }),
                            )
                          }
                        >
                          Gözat
                        </button>
                      </div>
                    </div>

                    <div className="section" style={{ marginTop: 14 }}>
                      <h3>{t("settings.groupEnvVars")}</h3>
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
              <h3>{t("settings.keysHeading")}</h3>
              <p className="dim" style={{ fontSize: 11, marginTop: 0 }}>
                {t("settings.keysHint")}
              </p>
              {Object.entries(settings.keybindings).map(([action, combo]) => (
                <div className="field" key={action}>
                  <label>{actionLabel(action)}</label>
                  <input
                    className="mono"
                    readOnly
                    value={capturing === action ? t("settings.pressKey") : prettyCombo(combo)}
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
                <p className="dim">{t("settings.aboutBlurb")}</p>
              </div>
              <div className="section">
                <h3>{t("settings.fileLocations")}</h3>
                {paths && (
                  <>
                    <div className="field">
                      <label>{t("settings.dataFolder")}</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input readOnly className="mono" style={{ flex: 1 }} value={paths.root} />
                        <button className="outline" onClick={() => void api.revealInExplorer(paths.root)}>
                          {t("settings.openFolderShort")}
                        </button>
                      </div>
                      <div className="hintline">
                        {t(paths.portable ? "settings.portableOn" : "settings.portableOff")}
                      </div>
                    </div>
                    <div className="field">
                      <label>{t("app.settings")}</label>
                      <input readOnly className="mono" value={paths.settingsFile} />
                    </div>
                    <div className="field">
                      <label>{t("settings.workspaceFile")}</label>
                      <input readOnly className="mono" value={paths.workspaceFile} />
                    </div>
                    <div className="field">
                      <label>{t("settings.history")}</label>
                      <input readOnly className="mono" value={paths.historyFile} />
                    </div>
                    <div className="field">
                      <label>{t("settings.integrationDir")}</label>
                      <input readOnly className="mono" value={paths.integrationDir} />
                    </div>
                  </>
                )}
              </div>
              <div className="section">
                <h3>{t("settings.reset")}</h3>
                <button
                  className="danger"
                  onClick={() => {
                    void store()
                      .askConfirm({
                        title: t("confirm.resetSettingsTitle"),
                        message: t("confirm.resetSettingsMessage"),
                        detail: t("confirm.resetSettingsDetail"),
                        confirmLabel: t("confirm.reset"),
                        danger: true,
                      })
                      .then((ok) => {
                        if (ok) void store().resetSettings();
                      });
                  }}
                >
                  {t("settings.resetButton")}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <span className="dim">{t("settings.savedInstantly")}</span>
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
