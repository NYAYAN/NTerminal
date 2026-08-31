import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { formatBytes } from "../lib/format";
import { api } from "../lib/ipc";
import { LANGS, localeTag, tSplit, tp, useT, type Translate } from "../lib/i18n";
import {
  BUNDLED_FONTS,
  CANDIDATE_FONTS,
  canvasMeasurer,
  detectInstalled,
  fontStack,
} from "../lib/fonts";
import { actionLabel, comboFromEvent, prettyCombo } from "../lib/keys";
import type { MsgKey } from "../lib/messages";
import { isMac } from "../lib/platform";
import { SECTIONS, searchSettings, type Section } from "../lib/settingsIndex";
import { THEMES } from "../lib/themes";
import { useStore } from "../store/useStore";
import type {
  CloseAction,
  ConfirmCloseTab,
  Lang,
  Profile,
  RightClickAction,
  ShellKind,
  ShellPrediction,
  ViewMode,
} from "../types";
import { EnvEditor } from "./EnvEditor";


const VIEW_MODES: { value: ViewMode; key: MsgKey }[] = [
  { value: "tabs", key: "view.tabs" },
  { value: "panes", key: "view.panes" },
];

/**
 * Kabuk adlari cevrilmiyor: "PowerShell 7+ (pwsh)" bir urun adi. Yalnizca
 * aciklama tasiyan iki girdi (cmd, ozel) ceviriden geliyor.
 */
type ShellKindOption = { value: ShellKind; label?: string; key?: MsgKey };

const SHELL_KINDS_WINDOWS: ShellKindOption[] = [
  { value: "pwsh", label: "PowerShell 7+ (pwsh)" },
  { value: "power-shell", label: "Windows PowerShell 5.1" },
  { value: "cmd", key: "settings.shellCmd" },
  { value: "bash", label: "Bash (Git Bash / MSYS)" },
  { value: "wsl", label: "WSL" },
  { value: "custom", key: "settings.shellCustom" },
];

/**
 * macOS listesi ayri: Windows PowerShell 5.1, cmd ve WSL mac'te YOK, listede
 * durmalari yalnizca karisiklik yaratir. Zsh basta cunku Catalina'dan beri
 * mac'in varsayilan kabugu.
 */
const SHELL_KINDS_MAC: ShellKindOption[] = [
  { value: "zsh", label: "Zsh" },
  { value: "bash", label: "Bash" },
  { value: "fish", label: "Fish" },
  { value: "pwsh", label: "PowerShell 7+ (pwsh)" },
  { value: "custom", key: "settings.shellCustom" },
];

/**
 * Ice alinan (import) bir yapilandirmadan bu platformda olmayan bir kabuk turu
 * gelebiliyor. Listede yoksa `select` bos gorunur ve kullanici kaydedince deger
 * sessizce degisir - bu yuzden mevcut deger her zaman listeye ekleniyor.
 */
function shellKindOptions(current: ShellKind): ShellKindOption[] {
  const base = isMac() ? SHELL_KINDS_MAC : SHELL_KINDS_WINDOWS;
  if (base.some((o) => o.value === current)) return base;
  const all = [...SHELL_KINDS_WINDOWS, ...SHELL_KINDS_MAC];
  const found = all.find((o) => o.value === current);
  return found ? [...base, found] : base;
}

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
    // Uzanti suzgeci YALNIZCA Windows'ta anlamli. macOS'ta kabuk
    // calistirilabilirlerinin uzantisi yok (/bin/zsh, /opt/homebrew/bin/fish);
    // ayni suzgeci orada uygulamak dosya seciciyi bomboş gosterirdi ve
    // kullanici hicbir kabuk secemezdi.
    ...(isMac()
      ? {}
      : {
          filters: [
            { name: t("settings.programFilter"), extensions: ["exe", "cmd", "bat", "com"] },
          ],
        }),
  }).then((res) => (typeof res === "string" ? res : null));
}

/** Menüdeki "özel" seçeneğinin değeri; hiçbir yazı tipi yığınına benzemiyor. */
const CUSTOM_FONT = "__custom__";

export function SettingsDialog() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const groups = useStore((s) => s.groups);
  const paths = useStore((s) => s.paths);
  const appVersion = useStore((s) => s.appVersion);
  const editingGroupId = useStore((s) => s.ui.editingGroupId);
  const setUi = useStore((s) => s.setUi);

  const [section, setSection] = useState<Section>(editingGroupId ? "groups" : "general");
  const [selectedProfileId, setSelectedProfileId] = useState(settings.profiles[0]?.id ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState(editingGroupId ?? groups[0]?.id ?? "");
  const [capturing, setCapturing] = useState<string | null>(null);

  /**
   * Makinede kurulu eş aralıklı yazı tipleri.
   *
   * BİR KEZ, pencere açılınca hesaplanıyor: her aday için iki canvas ölçümü
   * gerekiyor ve liste yirmi küçük ölçüm demek. Her çizimde yapmak ayarlar
   * penceresini gereksiz yere ağırlaştırırdı; kurulu yazı tipleri de pencere
   * açıkken değişmiyor.
   */
  const installedFonts = useMemo(() => {
    const measure = canvasMeasurer();
    if (!measure) return [];
    const bundled = new Set(BUNDLED_FONTS.map((f) => f.family));
    // Gömülü aileler zaten listede; iki kez göstermek seçimi zorlaştırır.
    return detectInstalled(CANDIDATE_FONTS, measure).filter((f) => !bundled.has(f));
  }, []);

  /**
   * Menüde seçili duran değer.
   *
   * Kayıtlı ayar bir seçeneğin yığınıyla birebir eşleşmiyorsa "özel" kipe
   * düşüyoruz — aksi hâlde menü eşleşmeyen bir değerde boş görünür ve
   * kullanıcı kendi yazdığı yazı tipinin kaybolduğunu sanır.
   */
  const [customFont, setCustomFont] = useState(false);
  const bilinen = useMemo(
    () => [
      ...BUNDLED_FONTS.map((f) => f.stack),
      ...installedFonts.map((f) => fontStack(f)),
    ],
    [installedFonts],
  );
  const fontChoice =
    !customFont && bilinen.includes(settings.appearance.fontFamily)
      ? settings.appearance.fontFamily
      : CUSTOM_FONT;
  const [query, setQuery] = useState("");
  /** Aramadan gidilen ayar: bulunduğunda kısa bir vurgu alıyor. */
  const [highlight, setHighlight] = useState<string | null>(null);
  const [historySize, setHistorySize] = useState<string>("");

  const store = useStore.getState;
  const close = () => setUi({ settingsOpen: false, editingGroupId: null });

  // Cumlenin ortasinda `<span className="mono">` var; ceviriyi ikiye bolmek
  // yerine metni tek anahtarda tutup yer tutucudan boluyoruz - cumle yapisi
  // dile gore degistigi icin "once su metin sonra kod" diye sabitlemek yanlis
  // olur.
  const [envHintBefore, envHintAfter] = tSplit("settings.groupEnvHint", "example");

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
      name: t("settings.newProfileName"),
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

  const removeProfile = async () => {
    if (!profile) return;
    if (settings.profiles.length <= 1) {
      store().toast(t("settings.atLeastOneProfile"), "err");
      return;
    }
    const ok = await store().askConfirm({
      title: t("confirm.deleteProfileTitle"),
      message: t("confirm.deleteProfileMessage", { name: profile.name }),
      detail: t("confirm.deleteProfileDetail"),
      confirmLabel: t("confirm.delete"),
      danger: true,
    });
    if (!ok) return;
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
    if (section !== "history") return;
    let alive = true;
    void api
      .historyStats()
      .then((stats) => {
        if (alive) {
          setHistorySize(
            t("settings.historyStats", {
              n: stats.total.toLocaleString(localeTag()),
              size: formatBytes(stats.fileBytes),
            }),
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [section]);

  /**
   * Aramadan gidilen ayarı görünür alana getirip kısa süre vurgular.
   *
   * Yalnızca bölüme götürmek yetmiyor: bölümde on ayar varsa kullanıcı aradığı
   * satırı gözle taramak zorunda kalıyor ve arama yarım iş oluyor.
   */
  useEffect(() => {
    if (!highlight) return;
    const row = document.querySelector<HTMLElement>(`[data-setting="${highlight}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.classList.add("found");
    const timer = window.setTimeout(() => {
      row.classList.remove("found");
      setHighlight(null);
    }, 1400);
    return () => {
      window.clearTimeout(timer);
      row.classList.remove("found");
    };
  }, [highlight, section]);

  const hits = searchSettings(query, t);

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("settings.title")}</h2>
          <span className="dim mono" style={{ fontSize: 11 }}>
            {paths?.settingsFile}
          </span>
          <button className="icon-btn" onClick={close}>
            ×
          </button>
        </div>

        <div className="settings-body">
          {/* Dikey gezinme: dokuz bölüm yatay bir şeride sığmıyor ve her
              yeni ayar şeridi biraz daha daraltıyordu. */}
          <nav className="settings-nav">
            <div className="settings-search">
              <input
                value={query}
                placeholder={t("settings.searchPlaceholder")}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setQuery("");
                  // Enter: ilk sonuca git. Arama kutusundan elini çekmeden
                  // en olası hedefe ulaşmak için.
                  if (e.key === "Enter" && hits.length > 0) {
                    setSection(hits[0].section);
                    setHighlight(hits[0].key);
                  }
                }}
              />
              {query && (
                <button
                  className="icon-btn"
                  title={t("settings.searchClear")}
                  onClick={() => setQuery("")}
                >
                  ×
                </button>
              )}
            </div>

            {query ? (
              <div className="settings-results">
                {hits.length === 0 && <div className="hint">{t("settings.searchNoResult")}</div>}
                {hits.length > 0 && (
                  <div className="settings-results-count dim">
                    {tp("settings.searchCount", hits.length)}
                  </div>
                )}
                {hits.map((hit) => (
                  <button
                    key={`${hit.section}:${hit.key}`}
                    className="settings-result"
                    onClick={() => {
                      setSection(hit.section);
                      setHighlight(hit.key);
                    }}
                  >
                    <span className="settings-result-label">{hit.label}</span>
                    <span className="settings-result-section">{hit.sectionLabel}</span>
                  </button>
                ))}
              </div>
            ) : (
              SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={section === s.id ? "on" : ""}
                  aria-current={section === s.id}
                  onClick={() => setSection(s.id)}
                >
                  {t(s.key)}
                </button>
              ))
            )}
          </nav>

          <div className="modal-body">
          {section === "general" && (
            <>
              <div className="section">
                <h3>{t("settings.language")}</h3>
                <div className="field" data-setting="settings.languageLabel">
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
                  <div className="hintline">{t("settings.languageHint")}</div>
                </div>
              </div>

              <div className="section">
                <h3>{t("view.heading")}</h3>
                <div className="field" data-setting="view.label">
                  <label>{t("view.label")}</label>
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
                    {t(settings.appearance.viewMode === "panes" ? "view.panesHint" : "view.tabsHint")}{" "}
                    {t("view.shortcut", {
                      keys: prettyCombo(settings.keybindings.toggleViewMode ?? "Ctrl+Shift+E"),
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {section === "appearance" && (
            <>
              <div className="section">
                <h3>{t("settings.theme")}</h3>
                <div className="field" data-setting="settings.colorTheme">
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
                <div className="field" data-setting="settings.fontFamily">
                  <label>{t("settings.fontFamily")}</label>
                  {/*
                    Açılır menü, serbest metin DEĞİL.
                    
                    Önceki hâli bir `datalist`ti: kutu boş görünüyor, öneriler
                    ancak yazmaya başlayınca çıkıyordu. Yani seçmek için ne
                    yazacağını bilmen gerekiyordu — seçici olmanın bütün amacını
                    kaçırıyordu.
                    
                    Her seçenek KENDİ yazı tipiyle çiziliyor: adına bakarak bir
                    yazı tipini seçmek zor, görünüşüne bakarak kolay.
                    
                    "Özel" seçeneği duruyor: listede olmayan bir aile ya da
                    elle yazılmış bir yığın kullanmak isteyen kaybolmasın.
                  */}
                  <select
                    value={fontChoice}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_FONT) {
                        setCustomFont(true);
                        return;
                      }
                      setCustomFont(false);
                      void store().patchAppearance({ fontFamily: e.target.value });
                    }}
                  >
                    <optgroup label={t("settings.fontBundled")}>
                      {BUNDLED_FONTS.map((font) => (
                        <option key={font.family} value={font.stack} style={{ fontFamily: font.stack }}>
                          {font.family}
                        </option>
                      ))}
                    </optgroup>
                    {installedFonts.length > 0 && (
                      <optgroup label={t("settings.fontInstalled")}>
                        {installedFonts.map((family) => (
                          <option
                            key={family}
                            value={fontStack(family)}
                            style={{ fontFamily: fontStack(family) }}
                          >
                            {family}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value={CUSTOM_FONT}>{t("settings.fontCustom")}</option>
                  </select>
                  {fontChoice === CUSTOM_FONT && (
                    <input
                      className="font-custom"
                      value={settings.appearance.fontFamily}
                      placeholder={t("settings.fontCustomHint")}
                      onChange={(e) => void store().patchAppearance({ fontFamily: e.target.value })}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
                <div className="field" data-setting="settings.fontSize">
                  <label>{t("settings.fontSize", { n: settings.appearance.fontSize })}</label>
                  <input
                    type="range"
                    min={8}
                    max={28}
                    value={settings.appearance.fontSize}
                    onChange={(e) =>
                      void store().patchAppearance({ fontSize: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="field" data-setting="settings.lineHeightLabel">
                  <label>
                    {t("settings.lineHeightLabel", {
                      n: settings.appearance.lineHeight.toFixed(2),
                    })}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={settings.appearance.lineHeight}
                    onChange={(e) =>
                      void store().patchAppearance({ lineHeight: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="field" data-setting="settings.letterSpacingLabel">
                  <label>
                    {t("settings.letterSpacingLabel", { n: settings.appearance.letterSpacing })}
                  </label>
                  <input
                    type="range"
                    min={-1}
                    max={3}
                    step={0.5}
                    value={settings.appearance.letterSpacing}
                    onChange={(e) =>
                      void store().patchAppearance({ letterSpacing: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="section">
                <h3>{t("settings.cursorScroll")}</h3>
                <div className="field" data-setting="settings.cursorStyle">
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
                <div className="check-row" data-setting="settings.cursorBlink">
                  <input
                    id="cursorBlink"
                    type="checkbox"
                    checked={settings.appearance.cursorBlink}
                    onChange={(e) => void store().patchAppearance({ cursorBlink: e.target.checked })}
                  />
                  <label htmlFor="cursorBlink">{t("settings.cursorBlink")}</label>
                </div>
                <div className="field" data-setting="settings.scrollbackLines">
                  <label>{t("settings.scrollbackLines")}</label>
                  <input
                    type="number"
                    min={500}
                    max={200000}
                    step={500}
                    value={settings.appearance.scrollback}
                    onChange={(e) =>
                      void store().patchAppearance({ scrollback: Number(e.target.value) })
                    }
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="hintline">{t("settings.scrollbackHint")}</div>
                </div>
              </div>
            </>
          )}

          {section === "terminal" && (
            <>
              <div className="section">
                <h3>{t("settings.copyPaste")}</h3>
                <div className="check-row" data-setting="settings.copyOnSelect">
                  <input
                    id="copyOnSelect"
                    type="checkbox"
                    checked={settings.behavior.copyOnSelect}
                    onChange={(e) => void store().patchBehavior({ copyOnSelect: e.target.checked })}
                  />
                  <label htmlFor="copyOnSelect">{t("settings.copyOnSelect")}</label>
                </div>
                <div className="field" data-setting="settings.rightClick">
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
                {/* macOS'ta bu ayarin islevi yok: kopyalama orada Cmd+C,
                    Ctrl+C ile bir cakisma olmuyor. Gostermek "acsam ne olur"
                    diye dusundurur, cevabi "hicbir sey". */}
                {!isMac() && (
                  <>
                    <div className="check-row" data-setting="settings.ctrlCCopies">
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
                  </>
                )}
              </div>

              <div className="section">
                <h3>{t("settings.links")}</h3>
                <div className="check-row" data-setting="settings.highlightLinks">
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
                <h3>{t("settings.commandLine")}</h3>
                <div className="check-row" data-setting="settings.commandBlocks">
                  <input
                    id="commandBlocks"
                    type="checkbox"
                    checked={settings.behavior.commandBlocks}
                    onChange={(e) =>
                      void store().patchBehavior({ commandBlocks: e.target.checked })
                    }
                  />
                  <label htmlFor="commandBlocks">{t("settings.commandBlocks")}</label>
                </div>
                <div className="hintline">{t("settings.commandBlocksHint")}</div>
                {/* Blok basligi bloklara BAGLI: bloklar kapaliyken cizilecek
                    bir baslik da yok. */}
                <div className="check-row" data-setting="settings.blockHeaders">
                  <input
                    id="blockHeaders"
                    type="checkbox"
                    checked={settings.behavior.blockHeaders}
                    disabled={!settings.behavior.commandBlocks}
                    onChange={(e) =>
                      void store().patchBehavior({ blockHeaders: e.target.checked })
                    }
                  />
                  <label htmlFor="blockHeaders">{t("settings.blockHeaders")}</label>
                </div>
                <div className="hintline">{t("settings.blockHeadersHint")}</div>
                <div className="check-row" data-setting="settings.appInput">
                  <input
                    id="appInput"
                    type="checkbox"
                    checked={settings.behavior.appInput}
                    onChange={(e) => void store().patchBehavior({ appInput: e.target.checked })}
                  />
                  <label htmlFor="appInput">{t("settings.appInput")}</label>
                </div>
                <div className="hintline">{t("settings.appInputHint")}</div>
                <div className="check-row" data-setting="settings.promptAtBottom">
                  <input
                    id="promptAtBottom"
                    type="checkbox"
                    checked={settings.behavior.promptAtBottom}
                    onChange={(e) =>
                      void store().patchBehavior({ promptAtBottom: e.target.checked })
                    }
                  />
                  <label htmlFor="promptAtBottom">{t("settings.promptAtBottom")}</label>
                </div>
                <div className="hintline">{t("settings.promptAtBottomHint")}</div>
              </div>

              <div className="section">
                <h3>{t("settings.prediction")}</h3>
                <div className="check-row" data-setting="settings.appSuggestions">
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
                <div className="field" data-setting="settings.predictionShell">
                  <label>{t("settings.predictionShell")}</label>
                  <select
                    value={settings.behavior.shellPrediction}
                    onChange={(e) =>
                      void store().patchBehavior({
                        shellPrediction: e.target.value as ShellPrediction,
                      })
                    }
                  >
                    {/* Dipte duran istemle birlikte teknik olarak calismiyor;
                        secilemez yapmak, secip sonra "neden olmadi" demekten
                        iyi (bkz. lib/suggest.ts effectiveShellPrediction). */}
                    <option value="list" disabled={settings.behavior.promptAtBottom}>
                      {t("settings.predictionList")}
                    </option>
                    <option value="inline">{t("settings.predictionInline")}</option>
                    <option value="off">{t("settings.predictionOff")}</option>
                  </select>
                  {settings.behavior.promptAtBottom &&
                    settings.behavior.shellPrediction === "list" && (
                      <div className="hintline warn">
                        {t("settings.predictionListBlocked")}
                      </div>
                    )}
                  <div className="hintline">
                    {t(isMac() ? "settings.predictionHintMac" : "settings.predictionHint")}
                  </div>
                </div>
              </div>
              {/* Option/Meta yalnizca macOS'ta anlamli: Windows'ta Alt zaten
                  Meta gibi davraniyor, ayar orada bir sey yapmazdi. */}
              {isMac() && (
                <div className="section">
                  <h3>{t("settings.keyboard")}</h3>
                  <div className="check-row" data-setting="settings.macOptionIsMeta">
                    <input
                      id="macOptionIsMeta"
                      type="checkbox"
                      checked={settings.behavior.macOptionIsMeta}
                      onChange={(e) =>
                        void store().patchBehavior({ macOptionIsMeta: e.target.checked })
                      }
                    />
                    <label htmlFor="macOptionIsMeta">{t("settings.macOptionIsMeta")}</label>
                  </div>
                  <div className="hintline">{t("settings.macOptionIsMetaHint")}</div>
                </div>
              )}
            </>
          )}

          {section === "session" && (
            <>
              <div className="section">
                <h3>{t("settings.sessionRestore")}</h3>
                <div className="check-row" data-setting="settings.restoreSessionLabel">
                  <input
                    id="restoreSession"
                    type="checkbox"
                    checked={settings.behavior.restoreSession}
                    onChange={(e) =>
                      void store().patchBehavior({ restoreSession: e.target.checked })
                    }
                  />
                  <label htmlFor="restoreSession">{t("settings.restoreSessionLabel")}</label>
                </div>
                <div className="check-row" data-setting="settings.restoreScrollbackLabel">
                  <input
                    id="restoreScrollback"
                    type="checkbox"
                    checked={settings.behavior.restoreScrollback}
                    onChange={(e) =>
                      void store().patchBehavior({ restoreScrollback: e.target.checked })
                    }
                  />
                  <label htmlFor="restoreScrollback">{t("settings.restoreScrollbackLabel")}</label>
                </div>
                <div className="field" data-setting="settings.scrollbackPerTab">
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
                  <div className="hintline">{t("settings.scrollbackPerTabHint")}</div>
                </div>
                <div className="check-row" data-setting="settings.inheritCwd">
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
                <h3>{t("settings.closeTabSection")}</h3>
                <div className="field" data-setting="settings.confirmCloseTab">
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
                  <div className="hintline">{t("settings.confirmCloseTabHint")}</div>
                </div>

                <div className="field" data-setting="settings.closeAction">
                  <label>{t("settings.closeAction")}</label>
                  <select
                    value={settings.behavior.closeAction}
                    onChange={(e) =>
                      void store().patchBehavior({ closeAction: e.target.value as CloseAction })
                    }
                  >
                    <option value="quit">{t("settings.closeActionQuit")}</option>
                    <option value="background">{t("settings.closeActionBackground")}</option>
                  </select>
                  <div className="hintline">{t("settings.closeActionHint")}</div>
                </div>
              </div>
            </>
          )}

          {section === "history" && (
            <div className="section">
              <h3>{t("settings.history")}</h3>
              <div className="field" data-setting="settings.historyLimit">
                <label>{t("settings.historyLimit")}</label>
                <input
                  type="number"
                  min={100}
                  max={500000}
                  step={1000}
                  value={settings.behavior.historyLimit}
                  onChange={(e) =>
                    void store().patchBehavior({ historyLimit: Number(e.target.value) })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <div className="hintline">
                  {t("settings.historyLimitHint", {
                    size: historySize || t("settings.historyReading"),
                  })}
                </div>
              </div>
              <div className="check-row" data-setting="settings.historyDedupeDefault">
                <input
                  id="historyDedupe"
                  type="checkbox"
                  checked={settings.behavior.historyDedupe}
                  onChange={(e) => void store().patchBehavior({ historyDedupe: e.target.checked })}
                />
                <label htmlFor="historyDedupe">{t("settings.historyDedupeDefault")}</label>
              </div>
            </div>
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
                  <button className="danger" onClick={() => void removeProfile()}>
                    {t("settings.removeProfile")}
                  </button>
                </div>
              </div>

              <div className="settings-form">
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
                        {shellKindOptions(profile.kind).map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label ?? t(k.key!)}
                          </option>
                        ))}
                      </select>
                      <div className="hintline">{t("settings.shellKindHint")}</div>
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
                          {t("settings.browse")}
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
                          {t("settings.browse")}
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

              <div className="settings-form">
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
                          {t("settings.browse")}
                        </button>
                      </div>
                    </div>

                    <div className="section" style={{ marginTop: 14 }}>
                      <h3>{t("settings.groupEnvVars")}</h3>
                      <p className="dim" style={{ marginTop: 0, fontSize: 11 }}>
                        {envHintBefore}
                        <span className="mono">NODE_ENV=development</span>
                        {envHintAfter}
                      </p>
                      <EnvEditor
                        value={group.env}
                        onChange={(env) => store().updateGroup(group.id, { env })}
                      />
                      <p className="dim" style={{ fontSize: 11 }}>
                        {t("settings.groupEnvApplyHint")}
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
                <h3>N-Terminal {appVersion}</h3>
                <p className="dim">{t("settings.aboutBlurb")}</p>
                <p className="dim">{t("settings.developer")}</p>
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
        </div>

        <div className="modal-foot">
          <span className="dim">{t("settings.savedInstantly")}</span>
          <span className="spacer" />
          <button className="outline" onClick={() => setUi({ settingsOpen: false, transferOpen: true })}>
            {t("settings.openTransfer")}
          </button>
          <button className="primary" onClick={close}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
