import { create } from "zustand";

import { api } from "../lib/ipc";
import { tabLabel } from "../lib/labels";
import {
  canCloseTab,
  canDeleteGroup,
  closableOthers,
  lockedTabs,
  nextCollapsedAll,
  reorder,
} from "../lib/tabs";
import { setLanguage as applyLanguage, t, tp } from "../lib/i18n";
import {
  defaultFontStack,
  setFileManager as applyFileManager,
  setPlatform as applyPlatform,
} from "../lib/platform";
import { nextViewMode, normalizeViewMode } from "../lib/panes";
import { canSuggest, cycleIndex, rankSuggestions, type SuggestEntry } from "../lib/suggest";
import { applyThemeToDocument, getTheme } from "../lib/themes";
import { TerminalSession } from "../terminal/TerminalSession";
import type {
  Favorite,
  FavoritePatch,
  Group,
  NewFavorite,
  PathsInfo,
  Profile,
  Lang,
  Settings,
  TabState,
  ViewMode,
  Workspace,
} from "../types";

/**
 * xterm örnekleri React durumunda tutulmuyor: her render'da yeniden
 * oluşturulmamaları ve karşılaştırılmamaları gerekiyor. Sekme kimliğinden
 * canlı oturuma giden bu harita modül düzeyinde duruyor.
 */
/**
 * Öneri kaynağında tutulacak en fazla komut.
 *
 * Geçmiş on binlerce kayıt olabiliyor; öneri için son birkaç yüz komut
 * yeterli ve her tuş vuruşunda taranacağı için listeyi kısa tutmak
 * gerekiyor.
 */
const SUGGEST_SOURCE_LIMIT = 400;

export const sessions = new Map<string, TerminalSession>();

/**
 * Onay penceresi çözücüleri.
 *
 * React durumunda tutulamaz: `Promise` çözücüsü serileştirilebilir bir değer
 * değil ve durumun içinde taşınması gereksiz yeniden çizim üretir. Kimliğe
 * göre modül düzeyinde duruyor; pencere kapanınca siliniyor.
 */
const confirmResolvers = new Map<number, (ok: boolean) => void>();
let confirmSeq = 0;

/** Onay penceresinin verdiği kararı bekleyen çağırana ulaştırır. */
export function resolveConfirm(id: number, ok: boolean) {
  const resolve = confirmResolvers.get(id);
  confirmResolvers.delete(id);
  const state = useStore.getState();
  if (state.ui.confirm?.id === id) {
    useStore.setState({ ui: { ...state.ui, confirm: null } });
  }
  resolve?.(ok);
}

export type HistoryScope = "tab" | "group" | "all";
/** Sag panel hangi listeyi gosteriyor. */
export type SidePanelMode = "history" | "favorites";

/**
 * Onay penceresi isteği.
 *
 * `window.confirm` yerine kendi penceremiz: webview iletişim pencereleri
 * temayı/dili taşımıyor ve gömülü webview'de görünmeme riski var — onay
 * penceresinin görünmemesi korumanın tümden kaybı demek.
 */
export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface UiState {
  historyOpen: boolean;
  historyScope: HistoryScope;
  panelMode: SidePanelMode;
  settingsOpen: boolean;
  paletteOpen: boolean;
  transferOpen: boolean;
  searchOpen: boolean;
  findOpen: boolean;
  renamingTabId: string | null;
  editingGroupId: string | null;
  toast: { text: string; tone: "ok" | "err" | "info" } | null;
  /** Açık onay penceresi; yoksa null. */
  confirm: ConfirmRequest | null;
  /**
   * Açık komut önerisi listesi.
   *
   * `items` en yeniden eskiye sıralı; `index` seçili öneri. Liste açıkken
   * yukarı/aşağı oklar kabuğa GİTMİYOR, listede geziniyor — bu yüzden liste
   * yalnızca kullanıcı bir şey yazdığında ve eşleşme varken açılıyor. Boş
   * satırda liste kapalı, ok tuşları kabuğun kendi geçmişine gidiyor.
   */
  suggest: { items: string[]; index: number; input: string } | null;
}

interface Store {
  ready: boolean;
  bootError: string | null;
  appVersion: string;
  /** Windows yapı numarası; oturumlara aktarılıyor. */
  windowsBuild: number;
  paths: PathsInfo | null;
  settings: Settings;
  groups: Group[];
  activeGroupId: string | null;
  restoredSession: boolean;
  ui: UiState;
  /** Sekme kimliği -> o sekmede komut çalışıyor mu. Göstergeler için. */
  running: Record<string, boolean>;
  /** Sekme kimliği -> kabuk süreci bitti mi. */
  exited: Record<string, boolean>;
  /** Favori komutlar; kullanıcının belirlediği sırada. */
  favorites: Favorite[];
  /**
   * Öneri kaynağı: en yeniden eskiye komut metinleri.
   *
   * Bellekte tutuluyor çünkü her tuş vuruşunda diske/IPC'ye gitmek
   * öneriyi yazma hızının gerisine düşürür. Açılışta bir kez yükleniyor,
   * sonra her yeni komut başa ekleniyor.
   */
  suggestHistory: SuggestEntry[];
  /** Oturum yeniden kurulduğunda artan sayaç; TerminalArea buna bakıp DOM'u yeniler. */
  sessionEpoch: Record<string, number>;
  /**
   * Durum çubuğunu yeniden çizdirmek için sayaç.
   *
   * Durum çubuğu canlı oturum nesnesinden okuyor (pid, entegrasyon, öneri)
   * ama oturumlar React durumunda değil; bu yüzden değişiklik bildirimi
   * geldiğinde bir kez yeniden çizmek gerekiyor.
   */
  statusTick: number;

  bootstrap: () => Promise<void>;
  persistNow: () => Promise<void>;
  schedulePersist: () => void;

  patchSettings: (patch: Partial<Settings>) => Promise<void>;
  patchAppearance: (patch: Partial<Settings["appearance"]>) => Promise<void>;
  patchBehavior: (patch: Partial<Settings["behavior"]>) => Promise<void>;
  setLanguage: (lang: Lang) => Promise<void>;
  setViewMode: (mode: ViewMode) => Promise<void>;
  toggleViewMode: () => Promise<void>;
  setProfiles: (profiles: Profile[], defaultProfileId?: string) => Promise<void>;
  resetSettings: () => Promise<void>;

  addGroup: (name?: string) => string;
  updateGroup: (id: string, patch: Partial<Group>) => void;
  deleteGroup: (id: string) => Promise<void>;
  setActiveGroup: (id: string) => void;
  moveGroup: (id: string, direction: -1 | 1) => void;
  /** Grubu belirli bir konuma taşır; sürükle-bırak bunu kullanıyor. */
  moveGroupTo: (id: string, targetIndex: number) => void;
  toggleGroupFavorite: (id: string) => void;
  toggleAllCollapsed: () => void;

  addTab: (opts?: { groupId?: string; profileId?: string; cwd?: string | null }) => string | null;
  closeTab: (tabId: string, options?: { confirm?: boolean }) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, patch: Partial<TabState>) => void;
  moveTabToGroup: (tabId: string, groupId: string) => void;
  /** Sürükle-bırak: sekmeyi hedef grubun verilen konumuna taşır. */
  moveTabTo: (tabId: string, targetGroupId: string, targetIndex: number) => void;
  toggleTabLock: (tabId: string) => void;
  closeOtherTabs: (keepId: string) => Promise<void>;
  moveTab: (tabId: string, direction: -1 | 1) => void;
  cycleTab: (direction: -1 | 1) => void;
  selectTabByIndex: (index: number) => void;

  ensureSession: (tabId: string) => Promise<TerminalSession | null>;
  restartTab: (tabId: string) => Promise<void>;
  reloadWorkspace: () => Promise<void>;
  activeTab: () => { group: Group; tab: TabState } | null;
  activeSession: () => TerminalSession | null;

  loadFavorites: () => Promise<void>;
  addFavorite: (favorite: NewFavorite) => Promise<Favorite | null>;
  updateFavorite: (id: string, patch: FavoritePatch) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  toggleFavorite: (command: string) => Promise<void>;
  moveFavorite: (id: string, direction: -1 | 1) => Promise<void>;
  runFavorite: (id: string, execute: boolean) => Promise<void>;
  isFavorite: (command: string) => boolean;

  setUi: (patch: Partial<UiState>) => void;
  /** Onay penceresini açar; kullanıcı karar verene kadar bekler. */
  askConfirm: (request: Omit<ConfirmRequest, "id">) => Promise<boolean>;
  loadSuggestHistory: () => Promise<void>;
  noteCommand: (command: string, cwd: string | null) => void;
  /**
   * `hintTail`: imlecin sağındaki metin kabuğun kendi satır içi önerisi mi.
   * İsteğe bağlı — yokluğu "hayalet metin yok" demek.
   */
  updateSuggestions: (state: { prefix: string; full: string; hintTail?: boolean }) => void;
  moveSuggestion: (direction: 1 | -1) => void;
  acceptSuggestion: () => void;
  acceptSuggestionAt: (index: number) => void;
  closeSuggestions: () => void;
  toast: (text: string, tone?: "ok" | "err" | "info") => void;
}

function newId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

const GROUP_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#bc8cff",
  "#39c5cf",
  "#ff7b72",
  "#f778ba",
  "#a371f7",
];

/**
 * Klasor yolunu `cd` icin alintiliyor. Bosluk iceren yollar (Program Files)
 * alintilanmazsa kabuk iki ayri argument goruyor.
 */
function quoteForShell(path: string): string {
  if (!/[\s&|<>^()]/.test(path)) return path;
  return `"${path.replace(/"/g, '""')}"`;
}

let persistTimer: number | null = null;
let settingsTimer: number | null = null;

/**
 * Ayarlari bellekte hemen, diske gecikmeli yazar. Kaydirma cubugu (font
 * boyutu, satir yuksekligi) surukleme sirasinda saniyede onlarca degisiklik
 * uretiyor; her birinde dosya yazmak anlamsiz.
 */
function scheduleSettingsWrite(settings: Settings, onError: (message: string) => void) {
  if (settingsTimer !== null) window.clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(() => {
    settingsTimer = null;
    void api.saveSettings(settings).catch((err) => onError(String(err)));
  }, 300);
}

/** Uygulama kapanirken bekleyen ayar yazimini hemen tamamlar. */
export async function flushSettings(): Promise<void> {
  if (settingsTimer === null) return;
  window.clearTimeout(settingsTimer);
  settingsTimer = null;
  await api.saveSettings(useStore.getState().settings).catch(() => {});
}

export const useStore = create<Store>((set, get) => ({
  ready: false,
  bootError: null,
  appVersion: "",
  windowsBuild: 0,
  paths: null,
  settings: {
    version: 1,
    appearance: {
      // Rust tarafı (model.rs default_font_family) doğru kaynak; bu yalnızca
      // açılış verisi gelmeden önceki ilk çizim için. Platforma göre olması
      // şart: Cascadia mac'te yok, jenerik monospace terminal için kötü.
      fontFamily: defaultFontStack(),
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: "nterminal-dark",
      cursorStyle: "bar",
      cursorBlink: true,
      scrollback: 10000,
      sidebarWidth: 240,
      panelWidth: 390,
      highlightLinks: true,
      viewMode: "tabs",
    },
    behavior: {
      restoreSession: true,
      restoreScrollback: true,
      scrollbackSaveLines: 2000,
      confirmCloseTab: "always",
      copyOnSelect: true,
      rightClickAction: "menu",
      ctrlCCopiesSelection: true,
      inheritCwd: true,
      historyLimit: 50000,
      historyDedupe: false,
      showOnlyFavoriteGroups: false,
      appSuggestions: true,
      shellPrediction: "list",
      // Varsayılan "background": uygulamanın menü çubuğunda / bildirim
      // alanında her zaman bir simgesi var, kapatma düğmesine basınca tümden
      // ölmesi bu varlıkla çelişiyordu — simge de kayboluyordu.
      closeAction: "background",
      macOptionIsMeta: false,
    },
    profiles: [],
    defaultProfileId: "",
    keybindings: {},
    language: "tr",
  },
  groups: [],
  activeGroupId: null,
  restoredSession: false,
  running: {},
  exited: {},
  sessionEpoch: {},
  statusTick: 0,
  favorites: [],
  suggestHistory: [],
  ui: {
    historyOpen: false,
    historyScope: "tab",
    panelMode: "history",
    settingsOpen: false,
    paletteOpen: false,
    transferOpen: false,
    searchOpen: false,
    findOpen: false,
    renamingTabId: null,
    editingGroupId: null,
    toast: null,
    confirm: null,
    suggest: null,
  },

  // ------------------------------------------------------------- başlangıç

  async bootstrap() {
    try {
      const boot = await api.bootstrap();
      // Platform en basta: dil ve tema metinleri dosya yoneticisi adini
      // ("Gezgin" / "Finder") ve Cmd/Ctrl yazimini buna gore uretiyor.
      applyPlatform(boot.platform);
      applyFileManager(boot.fileManager, boot.fileManagerEn);
      // Dil temadan once: hata iletileri de dogru dilde cikabilsin.
      applyLanguage(boot.settings.language);
      applyThemeToDocument(getTheme(boot.settings.appearance.theme));
      set({
        ready: true,
        appVersion: boot.appVersion,
        windowsBuild: boot.windowsBuild,
        paths: boot.paths,
        settings: boot.settings,
        groups: boot.workspace.groups,
        activeGroupId: boot.workspace.activeGroupId,
        restoredSession: boot.restored,
      });
      void get().loadFavorites();
      void get().loadSuggestHistory();
    } catch (err) {
      set({ ready: true, bootError: String(err) });
    }
  },

  async persistNow() {
    const { groups, activeGroupId } = get();
    const workspace: Workspace = {
      version: 1,
      activeGroupId,
      groups,
      savedAt: Date.now(),
    };
    await api.saveWorkspace(workspace).catch(() => {});
  },

  schedulePersist() {
    if (persistTimer !== null) window.clearTimeout(persistTimer);
    // Dizin değişimi her istemde tetiklenir; her seferinde diske yazmak yerine
    // kısa bir pencerede topluyoruz.
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      void get().persistNow();
    }, 700);
  },

  // ---------------------------------------------------------------- ayarlar

  async patchSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    applyLanguage(next.language);
    applyThemeToDocument(getTheme(next.appearance.theme));
    for (const session of sessions.values()) session.applySettings(next);
    scheduleSettingsWrite(next, (message) => get().toast(message, "err"));
  },

  async patchAppearance(patch) {
    const settings = get().settings;
    await get().patchSettings({ appearance: { ...settings.appearance, ...patch } });
  },

  async patchBehavior(patch) {
    const settings = get().settings;
    await get().patchSettings({ behavior: { ...settings.behavior, ...patch } });
  },

  async setLanguage(lang) {
    if (get().settings.language === lang) return;
    await get().patchSettings({ language: lang });
  },

  async setViewMode(mode) {
    if (get().settings.appearance.viewMode === mode) return;
    await get().patchAppearance({ viewMode: mode });
  },

  async toggleViewMode() {
    // normalizeViewMode: diskteki deger baska bir surumden gelmis olabilir.
    const current = normalizeViewMode(get().settings.appearance.viewMode);
    await get().setViewMode(nextViewMode(current));
  },

  async setProfiles(profiles, defaultProfileId) {
    const settings = get().settings;
    const nextDefault =
      defaultProfileId ??
      (profiles.some((p) => p.id === settings.defaultProfileId)
        ? settings.defaultProfileId
        : (profiles[0]?.id ?? ""));
    await get().patchSettings({ profiles, defaultProfileId: nextDefault });
  },

  async resetSettings() {
    try {
      const fresh = await api.resetSettings();
      set({ settings: fresh });
      applyThemeToDocument(getTheme(fresh.appearance.theme));
      for (const session of sessions.values()) session.applySettings(fresh);
      get().toast(t("store.settingsReset"), "ok");
    } catch (err) {
      get().toast(String(err), "err");
    }
  },

  // ----------------------------------------------------------------- gruplar

  addGroup(name) {
    const { groups, settings } = get();
    const id = newId("grp");
    const group: Group = {
      id,
      name: name?.trim() || t("group.newName", { n: groups.length + 1 }),
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
      icon: null,
      collapsed: false,
      favorite: false,
      defaultProfileId: settings.defaultProfileId || null,
      defaultCwd: null,
      env: {},
      activeTabId: null,
      tabs: [],
    };
    set({ groups: [...groups, group], activeGroupId: id });
    void get().persistNow();
    return id;
  },

  updateGroup(id, patch) {
    set({
      groups: get().groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });
    get().schedulePersist();
  },

  async deleteGroup(id) {
    const { groups } = get();
    if (groups.length <= 1) {
      get().toast(t("store.lastGroup"), "err");
      return;
    }
    const group = groups.find((g) => g.id === id);
    if (!group) return;

    if (!canDeleteGroup(group)) {
      const count = lockedTabs(group.tabs).length;
      get().toast(t("store.groupHasLocked", { n: count }), "err");
      return;
    }

    // Onay BURADA, cagiran bilesende degil: silme yolu birden fazla olabilir
    // (menu, kisayol, komut paleti) ve onayin her birinde tekrarlanmasi
    // kacinilmaz olarak birinde atlanmasiyla sonuclanir.
    const ok = await get().askConfirm({
      title: t("confirm.deleteGroupTitle"),
      message:
        group.tabs.length === 0
          ? t("confirm.deleteGroupEmptyMessage", { name: group.name })
          : t("confirm.deleteGroupMessage", { name: group.name, n: group.tabs.length }),
      confirmLabel: t("confirm.delete"),
      danger: true,
    });
    if (!ok) return;
    // Onay beklerken grup silinmis olabilir.
    if (!get().groups.some((g) => g.id === id)) return;

    for (const tab of group.tabs) {
      const session = sessions.get(tab.id);
      if (session) {
        await session.dispose(true);
        sessions.delete(tab.id);
      }
      await api.scrollbackDelete(tab.id).catch(() => {});
    }

    const remaining = groups.filter((g) => g.id !== id);
    set({
      groups: remaining,
      activeGroupId: get().activeGroupId === id ? remaining[0].id : get().activeGroupId,
    });
    await get().persistNow();
  },

  setActiveGroup(id) {
    if (get().activeGroupId === id) return;
    set({ activeGroupId: id });
    get().schedulePersist();
  },

  /** Favori grup isaretini ac/kapat. */
  toggleGroupFavorite(id) {
    const group = get().groups.find((g) => g.id === id);
    if (!group) return;
    get().updateGroup(id, { favorite: !group.favorite });
    get().toast(
      t(group.favorite ? "store.favoriteGroupRemoved" : "store.favoriteGroupAdded"),
      "ok",
    );
  },

  /** Tum gruplari katla ya da ac. Biri bile acıksa hepsi katlanir. */
  toggleAllCollapsed() {
    const groups = get().groups;
    const collapsed = nextCollapsedAll(groups);
    set({ groups: groups.map((g) => ({ ...g, collapsed })) });
    get().schedulePersist();
  },

  moveGroup(id, direction) {
    const groups = get().groups;
    const index = groups.findIndex((g) => g.id === id);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    // dropIndex ile ayni matematik: menuden ve surukle-biraktan gelen tasima
    // tek bir yoldan gecsin, iki ayri siralama mantigi tutmayalim.
    get().moveGroupTo(id, direction === 1 ? target + 1 : target);
  },

  moveGroupTo(id, targetIndex) {
    const groups = get().groups;
    const from = groups.findIndex((g) => g.id === id);
    if (from === -1) return;
    const next = reorder(groups, from, targetIndex);
    if (next === groups) return;
    set({ groups: next });
    get().schedulePersist();
  },

  // ----------------------------------------------------------------- sekmeler

  addTab(opts) {
    const { groups, activeGroupId, settings } = get();
    const groupId = opts?.groupId ?? activeGroupId;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return null;

    const profileId =
      opts?.profileId ??
      group.defaultProfileId ??
      settings.defaultProfileId ??
      settings.profiles[0]?.id ??
      "";
    if (!profileId) {
      get().toast(t("store.noProfiles"), "err");
      return null;
    }

    // Yeni sekmenin dizini: açıkça verildiyse o, yoksa (ayar açıksa) aktif
    // sekmenin bulunduğu dizin, yoksa grubun varsayılanı.
    let cwd = opts?.cwd ?? null;
    if (!cwd && settings.behavior.inheritCwd && group.activeTabId) {
      cwd = sessions.get(group.activeTabId)?.cwd ?? null;
    }
    if (!cwd) cwd = group.defaultCwd ?? null;

    const now = Date.now();
    const tab: TabState = {
      id: newId("tab"),
      title: "",
      customTitle: null,
      profileId,
      cwd,
      createdAt: now,
      lastActiveAt: now,
      hasScrollback: false,
      lastCommand: null,
      locked: false,
    };

    set({
      groups: groups.map((g) =>
        g.id === group.id ? { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id } : g,
      ),
      activeGroupId: group.id,
    });
    void get().persistNow();
    return tab.id;
  },

  async closeTab(tabId, options) {
    const { groups, settings } = get();
    const group = groups.find((g) => g.tabs.some((t) => t.id === tabId));
    if (!group) return;

    // Kilit her kapatma yolunda burada karsilaniyor: dugme, orta tus, Ctrl+W,
    // "digerlerini kapat" ve grup silme hepsi bu fonksiyondan geciyor.
    const target = group.tabs.find((t) => t.id === tabId);
    if (target && !canCloseTab(target)) {
      get().toast(t("store.tabLocked"), "err");
      return;
    }

    const session = sessions.get(tabId);

    // Onay: kullanicinin en sik sikayeti "yanlislikla carpiya bastim".
    // `options.confirm === false` yalnizca coklu kapatma yollari icin;
    // onlar tek bir onay soruyor, sekme basina tekrar sormuyor.
    if (options?.confirm !== false && target) {
      const mode = settings.behavior.confirmCloseTab;
      const running = !!session?.running;
      const ask = mode === "always" || (mode === "running" && running);
      if (ask) {
        const name = tabLabel(target);
        const ok = await get().askConfirm({
          title: t("confirm.closeTabTitle"),
          message: t("confirm.closeTabMessage", { name }),
          detail: running ? t("confirm.closeTabRunning") : t("confirm.closeTabDetail"),
          confirmLabel: t("confirm.close"),
          danger: true,
        });
        if (!ok) return;
        // Onay beklerken sekme kapanmis olabilir (baska bir yol,
        // kabugun olmesi). Durumu yeniden okuyup dogruluyoruz.
        const still = get()
          .groups.flatMap((g) => g.tabs)
          .some((tabItem) => tabItem.id === tabId);
        if (!still) return;
      }
    }

    if (session) {
      await session.dispose(true);
      sessions.delete(tabId);
    }
    await api.scrollbackDelete(tabId).catch(() => {});

    const nextTabs = group.tabs.filter((t) => t.id !== tabId);
    // Kapatılan sekme aktifse komşusuna geç: soldaki, yoksa sağdaki.
    let nextActive = group.activeTabId;
    if (group.activeTabId === tabId) {
      const index = group.tabs.findIndex((t) => t.id === tabId);
      const neighbour = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0] ?? null;
      nextActive = neighbour?.id ?? null;
    }

    set({
      groups: get().groups.map((g) =>
        g.id === group.id ? { ...g, tabs: nextTabs, activeTabId: nextActive } : g,
      ),
      running: Object.fromEntries(
        Object.entries(get().running).filter(([id]) => id !== tabId),
      ),
    });
    await get().persistNow();
  },

  setActiveTab(tabId) {
    // Sekme değişti: önceki sekmenin önerisi ekranda kalmasın.
    get().closeSuggestions();
    const groups = get().groups;
    const group = groups.find((g) => g.tabs.some((t) => t.id === tabId));
    if (!group) return;
    if (get().activeGroupId === group.id && group.activeTabId === tabId) return;

    set({
      activeGroupId: group.id,
      groups: groups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              activeTabId: tabId,
              tabs: g.tabs.map((t) =>
                t.id === tabId ? { ...t, lastActiveAt: Date.now() } : t,
              ),
            }
          : g,
      ),
    });
    get().schedulePersist();
  },

  updateTab(tabId, patch) {
    set({
      groups: get().groups.map((g) =>
        g.tabs.some((t) => t.id === tabId)
          ? { ...g, tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)) }
          : g,
      ),
    });
    get().schedulePersist();
  },

  moveTabToGroup(tabId, groupId) {
    const groups = get().groups;
    const from = groups.find((g) => g.tabs.some((t) => t.id === tabId));
    const to = groups.find((g) => g.id === groupId);
    if (!from || !to || from.id === to.id) return;
    const tab = from.tabs.find((t) => t.id === tabId)!;

    const session = sessions.get(tabId);
    if (session) session.groupId = groupId;

    const nextFromTabs = from.tabs.filter((t) => t.id !== tabId);
    set({
      groups: groups.map((g) => {
        if (g.id === from.id) {
          return {
            ...g,
            tabs: nextFromTabs,
            activeTabId:
              g.activeTabId === tabId ? (nextFromTabs[0]?.id ?? null) : g.activeTabId,
          };
        }
        if (g.id === to.id) {
          return { ...g, tabs: [...g.tabs, tab], activeTabId: tabId };
        }
        return g;
      }),
      activeGroupId: groupId,
    });
    void get().persistNow();
  },

  /** Kilidi ac/kapat. Kilitli sekme kapatilamaz. */
  toggleTabLock(tabId) {
    const groups = get().groups;
    const tab = groups.flatMap((g) => g.tabs).find((t) => t.id === tabId);
    if (!tab) return;
    get().updateTab(tabId, { locked: !tab.locked });
    get().toast(t(tab.locked ? "store.tabLockedOff" : "store.tabLockedOn"), "ok");
  },

  /** Bir sekme dısındakileri kapatir; kilitli olanlara dokunmaz. */
  async closeOtherTabs(keepId) {
    const groups = get().groups;
    const group = groups.find((g) => g.tabs.some((t) => t.id === keepId));
    if (!group) return;
    const targets = closableOthers(group.tabs, keepId);
    const skipped = group.tabs.length - 1 - targets.length;
    if (targets.length === 0) {
      if (skipped > 0) get().toast(tp("store.skippedLocked", skipped), "info");
      return;
    }

    // Tek onay, sekme basina degil: aksi halde "digerlerini kapat"
    // kullanicidan ust uste onay istiyordu.
    if (get().settings.behavior.confirmCloseTab !== "never") {
      const ok = await get().askConfirm({
        title: t("confirm.closeOthersTitle"),
        message: tp("confirm.closeOthers", targets.length),
        confirmLabel: t("confirm.close"),
        danger: true,
      });
      if (!ok) return;
    }
    for (const tab of targets) {
      await get().closeTab(tab.id, { confirm: false });
    }
    if (skipped > 0) {
      get().toast(tp("store.skippedLocked", skipped), "info");
    }
  },

  /**
   * Surukle-birak tasima: hem ayni grup icinde siralama hem gruplar arasi
   * tasima ayni yoldan geciyor. Tek eylem olmasi onemli - iki ayri kod yolu
   * olsa indeks duzeltmesi birinde yanlis kalirdi.
   */
  moveTabTo(tabId, targetGroupId, targetIndex) {
    const groups = get().groups;
    const from = groups.find((g) => g.tabs.some((t) => t.id === tabId));
    const to = groups.find((g) => g.id === targetGroupId);
    if (!from || !to) return;
    const fromIndex = from.tabs.findIndex((t) => t.id === tabId);
    if (fromIndex === -1) return;

    if (from.id === to.id) {
      const tabs = reorder(from.tabs, fromIndex, targetIndex);
      set({ groups: groups.map((g) => (g.id === from.id ? { ...g, tabs } : g)) });
      get().schedulePersist();
      return;
    }

    const tab = from.tabs[fromIndex];
    const session = sessions.get(tabId);
    if (session) session.groupId = targetGroupId;

    const nextFromTabs = from.tabs.filter((t) => t.id !== tabId);
    const nextToTabs = [...to.tabs];
    nextToTabs.splice(Math.max(0, Math.min(nextToTabs.length, targetIndex)), 0, tab);

    set({
      groups: groups.map((g) => {
        if (g.id === from.id) {
          return {
            ...g,
            tabs: nextFromTabs,
            activeTabId:
              g.activeTabId === tabId ? (nextFromTabs[0]?.id ?? null) : g.activeTabId,
          };
        }
        if (g.id === to.id) return { ...g, tabs: nextToTabs, activeTabId: tabId };
        return g;
      }),
      activeGroupId: targetGroupId,
    });
    void get().persistNow();
  },

  moveTab(tabId, direction) {
    const groups = get().groups;
    const group = groups.find((g) => g.tabs.some((t) => t.id === tabId));
    if (!group) return;
    const tabs = [...group.tabs];
    const index = tabs.findIndex((t) => t.id === tabId);
    const target = index + direction;
    if (target < 0 || target >= tabs.length) return;
    [tabs[index], tabs[target]] = [tabs[target], tabs[index]];
    set({ groups: groups.map((g) => (g.id === group.id ? { ...g, tabs } : g)) });
    get().schedulePersist();
  },

  cycleTab(direction) {
    const active = get().activeTab();
    if (!active) return;
    const { group, tab } = active;
    if (group.tabs.length < 2) return;
    const index = group.tabs.findIndex((t) => t.id === tab.id);
    const next = (index + direction + group.tabs.length) % group.tabs.length;
    get().setActiveTab(group.tabs[next].id);
  },

  selectTabByIndex(index) {
    const groups = get().groups;
    const group = groups.find((g) => g.id === get().activeGroupId);
    const tab = group?.tabs[index];
    if (tab) get().setActiveTab(tab.id);
  },

  // ---------------------------------------------------------------- oturumlar

  /**
   * Sekme ilk görüntülendiğinde kabuğu başlatır. Tembel davranıyoruz: 20
   * sekmeli bir çalışma alanı açılışta 20 kabuk süreci başlatmasın. Sekmeye
   * tıklandığında önce kaydedilmiş ekran çıktısı yazılıyor, sonra kabuk açılıyor.
   */
  async ensureSession(tabId) {
    const existing = sessions.get(tabId);
    if (existing) return existing;

    const { groups, settings } = get();
    const group = groups.find((g) => g.tabs.some((t) => t.id === tabId));
    const tab = group?.tabs.find((t) => t.id === tabId);
    if (!group || !tab) return null;

    const session = new TerminalSession({
      tabId: tab.id,
      groupId: group.id,
      profileId: tab.profileId,
      cwd: tab.cwd,
      env: group.env,
      settings,
      windowsBuild: get().windowsBuild,
      restoreScrollback: settings.behavior.restoreScrollback,
    });

    session.setCallbacks({
      onTitle: (title) => get().updateTab(tab.id, { title }),
      onCwd: (cwd) => get().updateTab(tab.id, { cwd }),
      onCommandStart: (command) => {
        set({ running: { ...get().running, [tab.id]: true } });
        get().updateTab(tab.id, { lastCommand: command });
        // Öneri kaynağı anında güncellensin: yeni çalıştırdığınız komut
        // hemen önerilebilir olmalı.
        get().noteCommand(command, sessions.get(tab.id)?.cwd ?? null);
        get().closeSuggestions();
      },
      onCommandEnd: () => {
        set({ running: { ...get().running, [tab.id]: false } });
      },
      onExit: () => {
        set({
          running: { ...get().running, [tab.id]: false },
          exited: { ...get().exited, [tab.id]: true },
        });
      },
      // Sessizce yutmuyoruz: baglanti acilmiyorsa kullanici bunu bilmeli,
      // yoksa "tikliyorum hicbir sey olmuyor" durumu geri gelir.
      onLinkFailed: (uri) => get().toast(t("term.linkFailed", { uri }), "err"),
      // Durum cubugu oturum nesnesini okuyor ama ona abone degil;
      // bildirim gelince bir kez yeniden cizdirmek icin sayaci artiriyoruz.
      onPrediction: () => set({ statusTick: get().statusTick + 1 }),
      onInput: (state) => {
        // Öneri yalnızca ETKİN sekme için: bölme kipinde arkadaki bir
        // sekmenin yazdığı metin listeyi değiştirmesin.
        if (get().activeTab()?.tab.id !== tab.id) return;
        get().updateSuggestions(state);
      },
    });

    sessions.set(tab.id, session);
    return session;
  },

  /**
   * Kabuk kapandıktan sonra (exit) veya kullanıcı istediğinde sekmeyi aynı
   * kimlikle yeniden kurar. sessionEpoch artınca TerminalArea eski DOM'u atıp
   * yenisini bağlıyor - xterm örneği bir kez open() edilebildiği için gerekli.
   */
  async restartTab(tabId) {
    const session = sessions.get(tabId);
    if (session) {
      await session.dispose(true);
      sessions.delete(tabId);
    }
    set({
      running: { ...get().running, [tabId]: false },
      exited: { ...get().exited, [tabId]: false },
      sessionEpoch: { ...get().sessionEpoch, [tabId]: (get().sessionEpoch[tabId] ?? 0) + 1 },
    });
  },

  /**
   * İçe alma (import) sonrası çağrılır: gelen yapılandırma grup/sekme
   * kimliklerini değiştirdiği için açık kabukları kapatıp durumu Rust
   * tarafından baştan okuyoruz. Aksi halde arayüz artık var olmayan
   * sekmelere bağlı oturumlar taşır.
   */
  async reloadWorkspace() {
    for (const [id, session] of [...sessions]) {
      await session.dispose(true);
      sessions.delete(id);
    }
    set({ running: {}, exited: {}, sessionEpoch: {} });
    await get().bootstrap();
  },

  activeTab() {
    const { groups, activeGroupId } = get();
    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return null;
    const tab = group.tabs.find((t) => t.id === group.activeTabId) ?? group.tabs[0];
    if (!tab) return null;
    return { group, tab };
  },

  activeSession() {
    const active = get().activeTab();
    return active ? (sessions.get(active.tab.id) ?? null) : null;
  },

  // -------------------------------------------------------------- favoriler

  async loadFavorites() {
    const favorites = await api.favoritesList().catch(() => [] as Favorite[]);
    set({ favorites });
  },

  async addFavorite(favorite) {
    try {
      const created = await api.favoritesAdd(favorite);
      await get().loadFavorites();
      return created;
    } catch (err) {
      get().toast(String(err), "err");
      return null;
    }
  },

  async updateFavorite(id, patch) {
    try {
      // Rust tarafi "dokunma" ile "temizle" ayrimi yapiyor: alani hic
      // gondermemek dokunma, null gondermek temizleme demek.
      await api.favoritesUpdate(id, patch);
      await get().loadFavorites();
    } catch (err) {
      get().toast(String(err), "err");
    }
  },

  async removeFavorite(id) {
    const favorite = get().favorites.find((f) => f.id === id);
    if (!favorite) return;
    const ok = await get().askConfirm({
      title: t("confirm.removeFavoriteTitle"),
      message: t("confirm.removeFavoriteMessage", {
        command: favorite.label || favorite.command,
      }),
      detail: t("confirm.removeFavoriteDetail"),
      confirmLabel: t("confirm.remove"),
      danger: true,
    });
    if (!ok) return;
    await api.favoritesRemove([id]).catch(() => 0);
    await get().loadFavorites();
  },

  /** Gecmis satirindaki yildiz: favorideyse kaldirir, degilse ekler. */
  async toggleFavorite(command) {
    const trimmed = command.trim();
    if (!trimmed) return;
    if (get().isFavorite(trimmed)) {
      // Yildiz bir anahtar gibi gorunuyor ama kapatmak favoriyi SILIYOR:
      // kisa ad, not ve klasor bilgisi de gidiyor. Geri tiklamak komutu
      // yeniden ekliyor ama o bilgileri getirmiyor.
      const ok = await get().askConfirm({
        title: t("confirm.removeFavoriteTitle"),
        message: t("confirm.removeFavoriteMessage", { command: trimmed }),
        detail: t("confirm.removeFavoriteDetail"),
        confirmLabel: t("confirm.remove"),
        danger: true,
      });
      if (!ok) return;
      await api.favoritesRemoveByCommand(trimmed).catch(() => 0);
      get().toast(t("store.favoriteRemoved"), "info");
    } else {
      const created = await get().addFavorite({ command: trimmed });
      if (created) get().toast(t("store.favoriteAdded"), "ok");
      return;
    }
    await get().loadFavorites();
  },

  async moveFavorite(id, direction) {
    const items = [...get().favorites];
    const index = items.findIndex((f) => f.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    set({ favorites: items });
    await api.favoritesReorder(items.map((f) => f.id)).catch(() => {});
  },

  /**
   * Favoriyi etkin sekmede uygular. Favoride klasor tanimliysa once oraya
   * geciyoruz: "bu komut su klasorde anlamli" bilgisi favorinin bir parcasi.
   */
  async runFavorite(id, execute) {
    const favorite = get().favorites.find((f) => f.id === id);
    if (!favorite) return;
    const session = get().activeSession();
    if (!session) {
      get().toast(t("store.noActiveTerminal"), "err");
      return;
    }
    if (favorite.cwd && favorite.cwd !== session.cwd) {
      session.insertCommand(`cd ${quoteForShell(favorite.cwd)}`, true);
    }
    session.insertCommand(favorite.command, execute);
    await api.favoritesMarkUsed(id).catch(() => {});
    await get().loadFavorites();
  },

  isFavorite(command) {
    const trimmed = command.trim();
    return get().favorites.some((f) => f.command === trimmed);
  },

  // --------------------------------------------------------------------- UI

  setUi(patch) {
    set({ ui: { ...get().ui, ...patch } });
  },

  async loadSuggestHistory() {
    // Tekrarlar zaten `rankSuggestions` içinde ayıklanıyor; burada dedupe
    // istemiyoruz ki sıra (en yeni önce) bozulmasın.
    const page = await api
      .historyQuery({ limit: SUGGEST_SOURCE_LIMIT, dedupe: false })
      .catch(() => null);
    if (!page) return;
    set({ suggestHistory: page.entries.map((e) => ({ command: e.command, cwd: e.cwd ?? null })) });
  },

  noteCommand(command, cwd) {
    const text = command.trim();
    if (!text) return;
    const next = [
      { command: text, cwd },
      ...get().suggestHistory.filter((e) => e.command !== text),
    ];
    // Liste sınırsız büyümesin: öneri için son birkaç yüz komut yeterli.
    set({ suggestHistory: next.slice(0, SUGGEST_SOURCE_LIMIT) });
  },

  updateSuggestions(state) {
    const { settings, ui } = get();
    if (!settings.behavior.appSuggestions) {
      if (ui.suggest) set({ ui: { ...ui, suggest: null } });
      return;
    }
    if (!canSuggest(state.prefix, state.full, state.hintTail)) {
      if (ui.suggest) set({ ui: { ...ui, suggest: null } });
      return;
    }

    // Dizin etkin oturumdan: aynı yerde çalıştırılmış komutlar önce gelsin.
    const items = rankSuggestions(
      get().suggestHistory,
      state.prefix,
      get().activeSession()?.cwd ?? null,
    );
    if (items.length === 0) {
      if (ui.suggest) set({ ui: { ...ui, suggest: null } });
      return;
    }
    // Ön ek değişmediyse seçimi koruyoruz: kullanıcı listede gezinirken
    // yeniden hesap seçimi başa atmasın.
    const keepIndex =
      ui.suggest && ui.suggest.input === state.prefix
        ? Math.min(ui.suggest.index, items.length - 1)
        : 0;
    set({ ui: { ...ui, suggest: { items, index: keepIndex, input: state.prefix } } });
  },

  moveSuggestion(direction) {
    const ui = get().ui;
    if (!ui.suggest) return;
    set({
      ui: {
        ...ui,
        suggest: {
          ...ui.suggest,
          index: cycleIndex(ui.suggest.index, ui.suggest.items.length, direction),
        },
      },
    });
  },

  acceptSuggestion() {
    get().acceptSuggestionAt(get().ui.suggest?.index ?? -1);
  },

  acceptSuggestionAt(index) {
    const ui = get().ui;
    const suggestion = ui.suggest?.items[index];
    if (!suggestion || !ui.suggest) return;
    const session = get().activeSession();
    // Satırdaki metin olarak öneriyi ÜRETEN öneki veriyoruz; ekranı yeniden
    // okumak hayalet metin yüzünden yanlış sonuç veriyordu.
    session?.acceptSuggestion(suggestion, ui.suggest.input);
    set({ ui: { ...get().ui, suggest: null } });
    // Listeye tıklanarak kabul edilmiş olabilir: odak terminale dönmeli,
    // yoksa kullanıcı yazmaya devam edemiyor.
    session?.focus();
  },

  closeSuggestions() {
    const ui = get().ui;
    if (!ui.suggest) return;
    set({ ui: { ...ui, suggest: null } });
  },

  askConfirm(request) {
    // Aynı anda iki onay isteği olursa öncekini iptal ediyoruz: iki
    // pencereyi üst üste göstermek yerine son istek geçerli olsun.
    const previous = get().ui.confirm;
    if (previous) resolveConfirm(previous.id, false);

    confirmSeq += 1;
    const id = confirmSeq;
    return new Promise<boolean>((resolve) => {
      confirmResolvers.set(id, resolve);
      set({ ui: { ...get().ui, confirm: { ...request, id } } });
    });
  },

  toast(text, tone = "info") {
    set({ ui: { ...get().ui, toast: { text, tone } } });
    window.setTimeout(() => {
      const current = get().ui.toast;
      if (current?.text === text) set({ ui: { ...get().ui, toast: null } });
    }, 3200);
  },
}));

/**
 * Uygulama kapanırken çağrılır: her sekmenin ekran çıktısını diske yazıp
 * çalışma alanını kaydeder. "Kaldığı yerden devam" bunun çıktısına dayanıyor.
 */
export async function flushAllState(): Promise<void> {
  await flushSettings();
  const state = useStore.getState();
  const saveScrollback = state.settings.behavior.restoreScrollback;

  const tasks: Promise<unknown>[] = [];
  const hasScrollback = new Set<string>();

  if (saveScrollback) {
    for (const [tabId, session] of sessions) {
      const data = session.serialize();
      if (data.trim().length > 0) {
        hasScrollback.add(tabId);
        tasks.push(api.scrollbackSave(tabId, data).catch(() => {}));
      } else {
        tasks.push(api.scrollbackDelete(tabId).catch(() => {}));
      }
    }
  }
  await Promise.all(tasks);

  const groups = state.groups.map((g) => ({
    ...g,
    tabs: g.tabs.map((t) => ({
      ...t,
      cwd: sessions.get(t.id)?.cwd ?? t.cwd,
      hasScrollback: hasScrollback.has(t.id),
    })),
  }));

  await api
    .saveWorkspace({
      version: 1,
      activeGroupId: state.activeGroupId,
      groups,
      savedAt: Date.now(),
    })
    .catch(() => {});
}
