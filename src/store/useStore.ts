import { create } from "zustand";

import { api } from "../lib/ipc";
import { groupLabel, tabLabel } from "../lib/labels";
import {
  canCloseTab,
  canDeleteGroup,
  closableOthers,
  healTabProfiles,
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
import { applyUiFont } from "../lib/fonts";
import { SIGINT } from "../lib/inputMode";
import { nextViewMode, normalizeViewMode } from "../lib/panes";
import { applyDrop, type DropTarget } from "../lib/favoriteGroups";
import { cdQuery, cdSuggestions, descend, exactDir } from "../lib/cdSuggest";
import {
  canSuggest,
  cycleIndex,
  MAX_SUGGESTIONS,
  rankSuggestions,
  recentCommands,
  type SuggestEntry,
} from "../lib/suggest";
import type { Section } from "../lib/settingsIndex";
import { applyThemeToDocument, getTheme } from "../lib/themes";
import { TerminalSession } from "../terminal/TerminalSession";
import type {
  Favorite,
  FavoritePatch,
  Group,
  NewFavorite,
  PathsInfo,
  Profile,
  ReleaseInfo,
  Lang,
  Settings,
  TabState,
  ViewMode,
  Workspace,
  GitInfo,
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
 * Durdurma silahının açık kalma süresi (ms).
 *
 * Ölçü niyetin ömrü: "durdurmak istiyorum" düşüncesiyle ikinci kez basmak bir
 * saniyenin altında oluyor. Uzun bir pencere, çok daha sonra kopyalamak için
 * basılan Ctrl+C'yi durdurmaya çevirirdi — sessiz ve şaşırtıcı bir kayıp.
 */
const STOP_ARM_MS = 1500;

let stopTimer: number | null = null;

/**
 * Otomatik yeniden başlatmalar arasındaki en az süre (ms).
 *
 * Kabuk kapanınca sekme kendi kendine yeniden başlıyor — kullanıcının isteği
 * buydu: "doğrudan yeniden başlatma işlemi gerçekleşsin". Ama koşulsuz bir
 * yeniden başlatma, AÇILAMAYAN bir kabukta sonsuz döngü demek: profilde
 * olmayan bir yürütülebilir, bozuk bir `.zshrc`, silinmiş bir çalışma dizini —
 * hepsinde kabuk doğar doğmaz ölüyor ve uygulama saniyede yüzlerce süreç
 * başlatmaya çalışırdı.
 *
 * Kural bu yüzden "arka arkaya HEMEN ölme": kabuk bu süreden kısa yaşadıysa
 * ikinci kez denenmiyor, karar kullanıcıya bırakılıyor. Uzun yaşamışsa sorun
 * kabukta değil, kullanıcı `exit` yazmıştır — orada yeniden başlatmak doğru.
 */
const AUTO_RESTART_GAP_MS = 3000;

/** Sekme başına son otomatik yeniden başlatma anı. */
const lastAutoRestart = new Map<string, number>();

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
/**
 * Dizin başına son okunan git imzası.
 *
 * Depoda DEĞİL: bu bir önbellek, arayüzün çizdiği bir şey değil. Depoya
 * yazmak her yoklamada bütün aboneleri boşuna uyandırırdı.
 */
const gitFingerprints = new Map<string, string | null>();

export type SidePanelMode = "history" | "favorites" | "git" | "files";

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
  /** Ctrl+P: bulunulan dizindeki dosyalarda arama. */
  filePaletteOpen: boolean;
  transferOpen: boolean;
  searchOpen: boolean;
  /**
   * Dizin seçicinin açık olduğu yol; kapalıyken null.
   *
   * Yol DEPODA tutuluyor çünkü seçiciyi açan yer (blok başlığındaki rozet)
   * `overflow: hidden` bir katmanın içinde; pencereyi orada çizmek kırpardı.
   * Uygulamanın kökünde çiziliyor, hangi dizin için açıldığını buradan
   * öğreniyor.
   */
  dirPicker: string | null;
  /**
   * Dal seçicinin açık olduğu depo; kapalıyken null.
   *
   * Depoda tutuluyor çünkü seçiciyi açan yer (blok başlığındaki rozet) bir
   * katmanın içinde ve o katman `pointer-events: none`: orada çizilen bir
   * pencere tıklama almıyor, dolayısıyla KAPATILAMIYOR. Uygulamanın kökünde
   * çiziliyor, hangi depo için açıldığını buradan öğreniyor.
   */
  branchPicker: { cwd: string; current: string } | null;
  /**
   * Görüntüleyicide açık dosyanın yolu; ağaç görünümündeyken null.
   *
   * "Dosyalar" sekmesinin iki durumu var ve ayrım burada: yol varsa içerik,
   * yoksa ağaç. Beşinci bir sekme çoğu zaman boş dururdu.
   */
  viewerPath: string | null;
  findOpen: boolean;
  renamingTabId: string | null;
  editingGroupId: string | null;
  /**
   * Ayarlar penceresi hangi bölümde açılsın; `null` ise varsayılan.
   *
   * Durumda tutuluyor çünkü isteyen yer pencerenin DIŞINDA: durum çubuğundaki
   * güncelleme rozeti "Hakkında"yı açıyor. Pencere içindeki gezinme yine
   * kendi yerel durumunda — bu alan yalnızca AÇILIŞ bölümünü söylüyor.
   */
  settingsSection: Section | null;
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
  /**
   * Girdi kipini belirleyen sinyaller, sekme başına.
   *
   * Kip burada HESAPLANMIYOR: ayarla birleştirip karar veren yer
   * `lib/inputMode.ts`. Depo yalnızca oturumun bildirdiğini taşıyor.
   */
  inputSignals: Record<string, { atPrompt: boolean; altScreen: boolean; integration: boolean }>;
  /**
   * Çalışan komutun çıktısında görülen sunucu adresleri, sekme başına.
   *
   * Depoda çünkü şeridi çizen bileşen terminalin dışında; oturumdan doğrudan
   * okusaydı çıktı aktıkça yeniden çizilmesi için ayrı bir abonelik gerekirdi.
   * Liste seyrek değişiyor (sunucu adresini bir kez yazıyor), yani depo
   * güncellemesi ucuz.
   */
  runLinks: Record<string, string[]>;
  /**
   * Sekme en altta mı. Yokluğu "en altta" demek: yeni açılan terminal canlı
   * çıktıya bakıyor ve düğme görünmemeli.
   */
  scrollAtBottom: Record<string, boolean>;
  /**
   * Dizin başına git durumu; depo olmayan dizinler `null` olarak kayıtlı.
   *
   * `null` ile "hiç bakılmadı" (anahtar yok) AYRI tutuluyor: ikisini
   * birleştirmek, depo olmayan bir dizinde her komut sonrası yeniden `git`
   * çalıştırmak demekti.
   */
  gitInfo: Record<string, GitInfo | null>;
  /**
   * Uygulama komut satırı açıkken kabul edilen önerinin gideceği yer.
   *
   * `CommandInput` kendini buraya kaydediyor. Depodan bileşene doğrudan
   * erişim yok; bu kayıt olmadan `acceptSuggestionAt` iki ayrı yola
   * bölünürdü ve listeye tıklamak yalnızca ham kipte çalışırdı.
   */
  appInputSink: ((text: string, mode: "replace" | "append") => void) | null;
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
  /**
   * Durdurma isteği SİLAHLI olan sekme; hiçbiri değilse null.
   *
   * Ctrl+C çalışan komutu tek basışta durdurmuyor, çünkü aynı tuş kopyalama
   * da demek (Windows'ta her yerde, terminalde seçim varken). İlk basış
   * silahlıyor ve şeritte "tekrar basın" yazıyor; ikinci basış SIGINT
   * gönderiyor. Kısa bir pencereden sonra kendiliğinden düşüyor — yarım
   * kalmış bir niyet saatler sonra beklenmedik bir durdurmaya dönüşmemeli.
   *
   * Terminalin İÇİNDEKİ düz Ctrl+C bu kuralın dışında: orası kabuğun kendi
   * tuşu ve tek basışta gitmeli (gerekçesi `App.tsx`).
   */
  stopArmed: string | null;
  /**
   * GitHub'da bekleyen yeni sürüm; yoksa null.
   *
   * Yalnızca DAHA YENİ bir sürüm varsa doluyor — karşılaştırmayı Rust yapıyor
   * (bkz. `update.rs`). Arayüz bu yüzden hiçbir yerde sürüm karşılaştırmıyor:
   * dolu olması "güncelleme var" demek.
   */
  update: ReleaseInfo | null;

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
  /**
   * Boşa düşmüş sekme-profil bağlarını onarır. Profil listesi her
   * değiştiğinde çağrılıyor; gerekçe `lib/tabs.ts` içindeki
   * `healTabProfiles` açıklamasında.
   */
  healProfileLinks: () => void;

  addGroup: (name?: string) => string;
  /** Hiçbir gruba ait olmayan sekme; kova yoksa kuruluyor. */
  addLooseTab: (opts?: { profileId?: string; cwd?: string | null }) => string | null;
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
  /**
   * Yeni sürüm var mı diye bakar. Denetim YAPILABİLDİYSE `true`.
   *
   * `manual` elle basılan düğme için: ayar yalnızca KENDİLİĞİNDEN yapılan
   * denetimi kapatıyor, düğmeye basmak isteğin kendisi.
   */
  checkUpdate: (manual?: boolean) => Promise<boolean>;
  /** Çalışan komuta SIGINT gönderir. */
  stopRunning: (tabId: string) => void;
  /** Durdurmayı silahlar; pencere dolunca kendiliğinden düşüyor. */
  armStop: (tabId: string) => void;
  disarmStop: () => void;

  loadFavorites: () => Promise<void>;
  addFavorite: (favorite: NewFavorite) => Promise<Favorite | null>;
  updateFavorite: (id: string, patch: FavoritePatch) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  toggleFavorite: (command: string) => Promise<void>;
  moveFavorite: (id: string, direction: -1 | 1) => Promise<void>;
  /**
   * Sürükleyerek taşıma: hem sırayı hem klasörü tek işlemde günceller.
   * Hesap `lib/favoriteGroups.ts` içinde ve saf.
   */
  moveFavoriteTo: (id: string, target: DropTarget) => Promise<void>;
  runFavorite: (id: string, execute: boolean) => Promise<void>;
  isFavorite: (command: string) => boolean;

  setUi: (patch: Partial<UiState>) => void;
  /** Onay penceresini açar; kullanıcı karar verene kadar bekler. */
  askConfirm: (request: Omit<ConfirmRequest, "id">) => Promise<boolean>;
  loadSuggestHistory: () => Promise<void>;
  refreshGit: (cwd: string | null) => Promise<void>;
  pollGit: (cwd: string | null) => Promise<void>;
  noteCommand: (command: string, cwd: string | null) => void;
  /**
   * `hintTail`: imlecin sağındaki metin kabuğun kendi satır içi önerisi mi.
   * İsteğe bağlı — yokluğu "hayalet metin yok" demek.
   */
  updateSuggestions: (state: { prefix: string; full: string; hintTail?: boolean }) => void;
  moveSuggestion: (direction: 1 | -1) => void;
  acceptSuggestion: () => void;
  acceptSuggestionAt: (index: number) => void;
  /** Boş satırda yukarı ok: geçmiş panelini açar. Geçmiş boşsa `false`. */
  openHistorySuggestions: () => boolean;
  closeSuggestions: () => void;
  setAppInputSink: (sink: ((text: string, mode: "replace" | "append") => void) | null) => void;
  insertPath: (path: string) => void;
  openFile: (path: string) => void;
  insertCommand: (command: string, execute: boolean) => void;
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

/**
 * `cd` önerisi için son okunan dizin listesi.
 *
 * Modül düzeyinde, depoda DEĞİL: her tuş vuruşunda diske gitmemek için bir
 * önbellek, ama arayüzün abone olması gereken bir durum değil — çizimi
 * tetikleyen şey `ui.suggest`.
 *
 * Anahtar dizinin kendisi; kaç dizin tutulduğu ve ne zaman boşaldığı
 * aşağıdaki `dirListings` açıklamasında.
 */
/*
 * Birden çok dizin BİRDEN tutuluyor, tek bir tane değil.
 *
 * Tek girdilik önbellek "tam eşleşen klasöre in" kuralıyla çalışamıyor: o
 * kural hem bulunulan dizinin listesini (eşleşme var mı?) hem alt klasörün
 * listesini (çocuklar neler?) aynı hesapta istiyor. Tek girdi ikisinden birini
 * her seferinde düşürür ve iki dizin arasında sonsuz bir getir-at döngüsü
 * kurulurdu. Sınır küçük: öneri için yalnızca son gezilen birkaç dizin lazım.
 *
 * Bir komut BİTİNCE önbellek boşalıyor (`onCommandEnd`): `mkdir` yeni klasör
 * açmış olabilir ve eski liste onu görmezdi. Tuş vuruşları arasında ise
 * tazelenmiyor — kazanç her harfte bir dosya sistemi çağrısından kaçınmak.
 */
const dirListings = new Map<string, string[]>();
const DIR_LISTING_LIMIT = 8;
/** Şu an getirilmekte olan dizinler: aynı dizin için ikinci istek açılmasın. */
const dirListingPending = new Set<string>();

export function forgetDirListings() {
  dirListings.clear();
}

/**
 * Dizin listesini verir; yoksa getirmeyi başlatır ve `null` döner.
 *
 * Liste geldiğinde `rerun` çağrılıyor: hesap, kullanıcının O ANKİ girdisiyle
 * yeniden koşuyor. Okunamayan klasör (izin, silinmiş) boş liste sayılıyor —
 * tekrar tekrar denemek her tuşta bir hata çağrısı demek olurdu.
 */
function dirNames(dir: string, rerun: () => void): string[] | null {
  const hit = dirListings.get(dir);
  if (hit) return hit;
  if (dirListingPending.has(dir)) return null;
  dirListingPending.add(dir);
  void api
    .listDirs(dir)
    .then(
      (names) => names,
      () => [] as string[],
    )
    .then((names) => {
      if (dirListings.size >= DIR_LISTING_LIMIT) {
        const eldest = dirListings.keys().next().value;
        if (eldest !== undefined) dirListings.delete(eldest);
      }
      dirListings.set(dir, names);
      dirListingPending.delete(dir);
      rerun();
    });
  return null;
}
/**
 * Son öneri girdisi.
 *
 * Dizin listesi ASENKRON geliyor; geldiğinde hesabı aynı girdiyle yeniden
 * çalıştırmak gerekiyor. Kullanıcı bu arada yazmaya devam etmiş olabilir, o
 * yüzden saklanan şey "en son ne yazıldığı".
 */
let lastSuggestInput: { prefix: string; full: string; hintTail?: boolean } | null = null;

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
      // Boş: arayüz sistemin kendi ailesini kullanıyor (CSS'teki `--ui-font`).
      uiFontFamily: "",
      uiFontSize: 13,
      theme: "nterminal-dark",
      cursorStyle: "bar",
      cursorBlink: true,
      scrollback: 10000,
      sidebarWidth: 240,
      panelWidth: 390,
      highlightLinks: true,
      viewMode: "tabs",
      showShellBadge: true,
      sidebarCollapsed: false,
      collapsedFavoriteFolders: [],
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
      historyDedupe: true,
      showOnlyFavoriteGroups: false,
      appSuggestions: true,
      shellPrediction: "inline",
      promptAtBottom: true,
      appInput: true,
      commandBlocks: true,
      blockHeaders: true,
      // Varsayılan "background": uygulamanın menü çubuğunda / bildirim
      // alanında her zaman bir simgesi var, kapatma düğmesine basınca tümden
      // ölmesi bu varlıkla çelişiyordu — simge de kayboluyordu.
      closeAction: "background",
      macOptionIsMeta: false,
      checkUpdates: true,
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
  stopArmed: null,
  update: null,
  favorites: [],
  suggestHistory: [],
  inputSignals: {},
  runLinks: {},
  scrollAtBottom: {},
  gitInfo: {},
  appInputSink: null,
  ui: {
    historyOpen: false,
    historyScope: "tab",
    panelMode: "history",
    settingsOpen: false,
    paletteOpen: false,
    filePaletteOpen: false,
    transferOpen: false,
    searchOpen: false,
    dirPicker: null,
    branchPicker: null,
    viewerPath: null,
    findOpen: false,
    renamingTabId: null,
    editingGroupId: null,
    settingsSection: null,
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
      applyUiFont(boot.settings.appearance.uiFontFamily, boot.settings.appearance.uiFontSize);
      set({
        ready: true,
        appVersion: boot.appVersion,
        windowsBuild: boot.windowsBuild,
        paths: boot.paths,
        settings: boot.settings,
        // Diskteki çalışma alanı, diskteki ayarlardan bağımsız eskimiş
        // olabiliyor (silinmiş profil, sıfırlanmış ayar dosyası). Bağı burada
        // onarmak, ilk çizimden önce doğru rozetle açılmayı sağlıyor.
        groups: healTabProfiles(
          boot.workspace.groups,
          boot.settings.profiles,
          boot.settings.defaultProfileId,
        ),
        activeGroupId: boot.workspace.activeGroupId,
        restoredSession: boot.restored,
      });
      void get().loadFavorites();
      void get().loadSuggestHistory();
      // Denetim ARKA PLANDA: açılışı bekletmiyor ve düşerse hiçbir şey
      // olmuyor. Sürüm karşılaştırması Rust tarafında.
      void get().checkUpdate();
    } catch (err) {
      set({ ready: true, bootError: String(err) });
    }
  },

  async persistNow() {
    const { groups, activeGroupId, ready, bootError } = get();
    /*
     * Açılış tamamlanmadan YAZMA.
     *
     * ÖLÇÜLEN VERİ KAYBI: geliştirme kipinde Vite modülleri sıcak
     * değiştirdiğinde depo yeni ve BOŞ bir örnekle kuruluyor (`groups: []`),
     * `bootstrap()` ise henüz koşmamış oluyor. O aralıkta bir kaydetme
     * tetiklenirse diskteki `workspace.json` dokuz sekmelik düzenin yerine
     * boş bir dosyayla değiştiriliyordu — kullanıcının bütün grupları,
     * Rust tarafının yedeği (`snapshot_if_shrinking`) olmasa gitmişti.
     *
     * Sıcak değiştirme yalnızca tetikleyiciydi, kural genel: açılıştan önceki
     * durum "kaydedilecek bir şey" değil, "henüz okunmamış" demek. Aynı
     * boşluk açılış hata verdiğinde (`bootError`) de var — orada da diskteki
     * düzeni ezmek son kalan sağlam kopyayı yok etmek olurdu.
     */
    if (!ready || bootError) return;
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
    applyUiFont(next.appearance.uiFontFamily, next.appearance.uiFontSize);
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
    // Silinen profile bağlı sekmeler geride kalmasın.
    get().healProfileLinks();
  },

  healProfileLinks() {
    const { groups, settings } = get();
    const healed = healTabProfiles(groups, settings.profiles, settings.defaultProfileId);
    // Kimlik korunuyorsa değişiklik yok: ne yeniden çizim ne disk yazımı.
    if (healed === groups) return;
    set({ groups: healed });
    void get().persistNow();
  },

  async resetSettings() {
    try {
      const fresh = await api.resetSettings();
      set({ settings: fresh });
      applyThemeToDocument(getTheme(fresh.appearance.theme));
      applyUiFont(fresh.appearance.uiFontFamily, fresh.appearance.uiFontSize);
      for (const session of sessions.values()) session.applySettings(fresh);
      // Sıfırlama profilleri yeniden tarıyor ve hepsine YENİ kimlik veriyor;
      // bu çağrı olmadan açık her sekmenin bağı aynı anda kopuyor.
      get().healProfileLinks();
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
      ungrouped: false,
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

  /**
   * GRUPTAN BAĞIMSIZ sekme.
   *
   * BİLDİRİLEN İSTEK: "Bir sekmeyi illa gruba eklemeye gerek olmamalı."
   * Doğruydu — sekme açmanın her yolu bir grubun içine düşüyordu, çünkü her
   * zaman bir grup seçili.
   *
   * Model DEĞİŞMEDİ: sekmeler yine bir grubun içinde yaşıyor. Değiştirmek
   * "sekme nerede" sorusunu geçmiş kaydından favori süzgecine, bölme
   * kipinden aktarıma kadar her yerde ikiye bölerdi. Bunun yerine TEK bir
   * grup "gruplanmamış" olarak işaretleniyor ve kenar çubuğunda başlıksız,
   * düz bir liste olarak çiziliyor. Kullanıcının gördüğü şey istenen şey:
   * hiçbir gruba ait olmayan sekmeler.
   *
   * Kova TALEP ÜZERİNE kuruluyor ve listenin BAŞINA giriyor: gruplanmamış
   * sekmeler grupların üstünde duruyor, tıpkı bir dosya yöneticisinde köke
   * bırakılmış dosyalar gibi. Son sekmesi kapanınca kendiliğinden kayboluyor
   * (bkz. `closeTab`) — boş ve adsız bir bölüm ekranda yalnızca soru
   * doğururdu.
   */
  addLooseTab(opts) {
    const existing = get().groups.find((g) => g.ungrouped);
    if (!existing) {
      const bucket: Group = {
        id: newId("grp"),
        // Ad BOŞ: etiketi `groupLabel` çeviriden veriyor, böylece dil
        // değişince menülerde eski dilde takılı kalmıyor.
        name: "",
        color: null,
        icon: null,
        collapsed: false,
        favorite: false,
        ungrouped: true,
        defaultProfileId: null,
        defaultCwd: null,
        env: {},
        activeTabId: null,
        tabs: [],
      };
      set({ groups: [bucket, ...get().groups] });
      return get().addTab({ ...opts, groupId: bucket.id });
    }
    return get().addTab({ ...opts, groupId: existing.id });
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
          ? t("confirm.deleteGroupEmptyMessage", { name: groupLabel(group) })
          : t("confirm.deleteGroupMessage", { name: groupLabel(group), n: group.tabs.length }),
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
    /*
     * GRUPLANMAMIŞ kova her zaman en üstte kalıyor.
     *
     * Kova sürüklenemiyor (başlığı yok, tutunacak bir yer de yok) ama bir
     * GRUP onun üstüne bırakılabiliyordu ve o zaman gruplanmamış sekmeler
     * listenin ortasında bir yerde kalıyordu — başlıksız oldukları için de
     * kime ait oldukları anlaşılmıyordu.
     */
    const hasBucket = groups[0]?.ungrouped === true;
    const target = hasBucket && id !== groups[0].id ? Math.max(1, targetIndex) : targetIndex;
    const next = reorder(groups, from, target);
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

    /*
     * Boşalan GRUPLANMAMIŞ kova kalkıyor.
     *
     * Kova bir grup değil, "grubu olmayanlar" için bir yer; boşken ekranda
     * adsız ve başlıksız bir hiçlik olarak durması yalnızca "bu ne" sorusu
     * doğururdu. Gerçek gruplar boş kalabiliyor ve kalmalı — kullanıcı onları
     * kendisi kurdu, adları ve rengi var.
     *
     * Son grup asla silinmiyor: bir sonraki sekmenin gidecek yeri kalmalı.
     */
    const dropBucket = group.ungrouped && nextTabs.length === 0 && get().groups.length > 1;
    const nextGroups = dropBucket
      ? get().groups.filter((g) => g.id !== group.id)
      : get().groups.map((g) =>
          g.id === group.id ? { ...g, tabs: nextTabs, activeTabId: nextActive } : g,
        );

    set({
      groups: nextGroups,
      activeGroupId:
        dropBucket && get().activeGroupId === group.id
          ? (nextGroups[0]?.id ?? null)
          : get().activeGroupId,
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
      onCwd: (cwd) => {
        get().updateTab(tab.id, { cwd });
        // Yeni dizin başka bir depo (ya da hiç depo değil) olabilir.
        void get().refreshGit(cwd);
      },
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
        // Komut klasör açmış/silmiş olabilir (`mkdir`, `rm`): `cd` önerisinin
        // dizin listeleri bir sonraki tuşta diskten yeniden okunsun.
        forgetDirListings();
        // Komut dosya değiştirmiş olabilir; rozet komutun SONRAKİ hâlini
        // göstermeli. En sık örnek: `git add` sonrası sayacın düşmesi.
        void get().refreshGit(sessions.get(tab.id)?.cwd ?? null);
      },
      /*
       * Kabuk kapandı: SEKME KENDİ KENDİNE yeniden başlıyor.
       *
       * Önceki hâli "Bu sekmedeki kabuk kapandı" kutusunu çiziyor ve iki
       * düğme sunuyordu. Kullanıcının isteği doğrudan yeniden başlatmaktı:
       * kutunun sorduğu soru zaten çoğu zaman tek bir yanıta çıkıyor ve
       * sekmeyi kapatmanın yolu (kenar çubuğu, sekme çubuğu) hep açık.
       *
       * Kutu tümden kalkmadı: kabuk AÇILAMIYORSA geriye o kalıyor. Ayrımı
       * `AUTO_RESTART_GAP_MS` yapıyor — arka arkaya hemen ölen bir kabuk
       * yeniden denenmiyor, yoksa saniyede yüzlerce süreç doğardı.
       */
      onExit: () => {
        set({ running: { ...get().running, [tab.id]: false } });

        const now = Date.now();
        const last = lastAutoRestart.get(tab.id) ?? 0;
        if (now - last >= AUTO_RESTART_GAP_MS) {
          lastAutoRestart.set(tab.id, now);
          void get().restartTab(tab.id);
          return;
        }

        // İkinci kez hemen öldü: kabuk açılamıyor. Karar kullanıcının.
        lastAutoRestart.delete(tab.id);
        set({ exited: { ...get().exited, [tab.id]: true } });
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
      onRunLinks: (urls) => {
        set({ runLinks: { ...get().runLinks, [tab.id]: urls } });
      },
      onScrollState: (atBottom) => {
        // Sekme başına: bölme kipinde her bölmenin kendi kaydırma durumu var.
        set({ scrollAtBottom: { ...get().scrollAtBottom, [tab.id]: atBottom } });
      },
      onInputSignals: (signals) => {
        // Sinyaller SEKME BAŞINA tutuluyor: bölme kipinde arkadaki sekmede
        // komut çalışırken öndeki istemde bekliyor olabilir.
        set({ inputSignals: { ...get().inputSignals, [tab.id]: signals } });
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
      /*
       * EKRAN KORUNUYOR.
       *
       * Yeniden başlatma xterm örneğini yeniden kuruyor (bkz. `sessionEpoch`)
       * ve yeni örnek boş açılıyor — yani yeniden başlatmak kullanıcının
       * çıktısını siliyordu. Elle basılan bir düğmede bu göze alınabilir bir
       * bedeldi; kabuk kapanınca KENDİLİĞİNDEN yeniden başladığı için artık
       * değil: `exit` yazan biri ekranının silinmesini beklemiyor.
       *
       * Yol yeni değil — oturum geri yükleme zaten böyle çalışıyor. Ekran
       * kaydırma tamponu olarak yazılıyor, barındırıcı da onu okuyup
       * "önceki oturum burada bitti" ayıracıyla birlikte çiziyor.
       */
      const screen = session.serialize();
      if (screen.trim() && get().settings.behavior.restoreScrollback) {
        await api.scrollbackSave(tabId, screen).catch(() => {});
        get().updateTab(tabId, { hasScrollback: true });
      }
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

    /*
     * Epoch'lar SIFIRLANMIYOR, ARTIRILIYOR.
     *
     * BİLDİRİLEN HATA: içe aktarmadan sonra bir sekmede komut çalıştırmak
     * "Etkin bir terminal yok" diyordu.
     *
     * Sebep: `TerminalArea` her sekme barındırıcısını `tabId:epoch`
     * anahtarıyla çiziyor ve oturumu yaratan etki `[tabId, epoch]`e bağlı.
     * Yukarıda bütün oturumlar kapatıldı; ama epoch'ları sıfırlamak hiç
     * yeniden başlatılmamış bir sekmede (epoch zaten 0) anahtarı
     * DEĞİŞTİRMİYOR. React barındırıcıyı yerinde bırakıyor, etki yeniden
     * koşmuyor ve o sekme arkasında kabuk OLMADAN canlı görünüyor.
     *
     * Belirtinin yalnızca bazı sekmelerde çıkmasının sebebi de bu: daha önce
     * yeniden başlatılmış bir sekmenin epoch'u 1+ olduğu için sıfırlama onu
     * kazara düzeltiyordu.
     *
     * Artırma her sekme için anahtarı değiştiriyor; barındırıcı yeniden
     * kuruluyor ve oturumunu yaratıyor. İçe aktarmayla GELEN yeni sekmeler
     * zaten yeni kimlikte, onlar kendiliğinden kuruluyor.
     */
    const epochs = { ...get().sessionEpoch };
    for (const group of get().groups) {
      for (const tab of group.tabs) epochs[tab.id] = (epochs[tab.id] ?? 0) + 1;
    }
    set({ running: {}, exited: {}, sessionEpoch: epochs });
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

  /**
   * Yeni sürüm denetimi.
   *
   * Açılışta bir kez koşuyor ve Ayarlar › Hakkında'daki düğmeden elle de
   * çağrılabiliyor. Hata YUTULUYOR: ağ yok, depo görünmüyor, hız sınırı
   * aşılmış — hepsinin doğru karşılığı aynı, bildirim gösterilmemesi. Bir
   * güncelleme denetimi kullanıcıya hata penceresi açmamalı; istediği bir şey
   * değildi, bir kolaylık.
   */
  async checkUpdate(manual = false) {
    // Ayar yalnızca KENDİLİĞİNDEN yapılan denetimi kapatıyor.
    if (!manual && !get().settings.behavior.checkUpdates) return true;
    const current = get().appVersion;
    if (!current) return false;

    /*
     * `undefined` ile `null` AYRI şeyler ve ayrımın taşınması gerekiyor:
     * `null` "yeni sürüm yok" (denetim başarılı), `undefined` ise "denetim
     * yapılamadı". İkisini birleştirmek, ağı olmayan bir makinede "bu sürüm
     * güncel" yazdırırdı — yani bilmediğimiz bir şeyi biliyormuş gibi.
     */
    const found = await api.checkUpdate(current).catch(() => undefined);
    if (found === undefined) return false;
    // `null` da yazılıyor: elle yapılan ikinci denetim eski haberi temizlesin.
    set({ update: found });
    return true;
  },

  /**
   * Çalışan komutu durdurur.
   *
   * Bayt `SIGINT` sabitinden geliyor ve bu bilinçli: komut kutusunun kaçış
   * kapısı da aynı sabiti gönderiyor. İki yerde elle yazılsaydı biri
   * değiştiğinde öteki sessizce çalışmayan bir tuş göndermeye başlardı.
   *
   * Eskiden buradan `passThroughSequence` çağrılıyordu — bir DÜĞME için sahte
   * bir tuş olayı kurup ("c", ctrl, shift yok…) sonucu boşa karşı denetliyordu.
   * Tuş kuralı her sıkılaştığında (shift, alt, meta) bu çağrı da yeni sahte
   * alanlar istiyordu; kural bir gün düğmenin uydurduğu olayı geçirmezse
   * düğme sessizce çalışmayı bırakırdı. Düğmenin klavyeyle işi yok; bayt yeter.
   */
  stopRunning(tabId) {
    get().disarmStop();
    sessions.get(tabId)?.sendKeys(SIGINT);
  },

  armStop(tabId) {
    if (stopTimer !== null) window.clearTimeout(stopTimer);
    set({ stopArmed: tabId });
    stopTimer = window.setTimeout(() => {
      stopTimer = null;
      if (get().stopArmed === tabId) set({ stopArmed: null });
    }, STOP_ARM_MS);

    /*
     * Geri bildirim ŞERİTTE, yalnızca şerit yoksa bildirim balonunda.
     *
     * Hiçbir şey yapmıyormuş gibi görünen bir ilk basış, iki basış kuralını
     * bir arızaya çeviriyor. Şerit ("Komut çalışıyor…") kullanıcının zaten
     * baktığı yer ve orada duruyor; koşulu `CommandInput` ile aynı, o yüzden
     * ikisi ayrışamıyor. Şeridin çizilmediği durumlar (tam ekran program,
     * entegrasyonsuz profil) balona düşüyor.
     */
    const signals = get().inputSignals[tabId];
    const stripVisible = !!signals?.integration && !signals.altScreen;
    if (!stripVisible) get().toast(t("input.stopAgain"), "info");
  },

  disarmStop() {
    if (stopTimer !== null) window.clearTimeout(stopTimer);
    stopTimer = null;
    if (get().stopArmed !== null) set({ stopArmed: null });
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

  async moveFavoriteTo(id, target) {
    const before = get().favorites;
    const out = applyDrop(before, id, target);
    if (!out) return;

    /*
     * Sıra ve klasör TEK karar, iki yazma.
     *
     * Önce bellekteki listeyi yeni hâline getiriyoruz: sürükleme bittiğinde
     * satır beklemeden yerine oturmalı, yoksa bırakma "tutmadı" gibi görünüp
     * kullanıcı ikinci kez sürüklüyor.
     */
    const byId = new Map(before.map((f) => [f.id, f]));
    const next = out.ids
      .map((fid) => byId.get(fid))
      .filter((f): f is Favorite => !!f)
      .map((f) => (f.id === id ? { ...f, folder: out.folder } : f));
    set({ favorites: next });

    const eski = before.find((f) => f.id === id)?.folder ?? null;
    if (eski !== out.folder) {
      await api.favoritesUpdate(id, { folder: out.folder }).catch(() => {});
    }
    await api.favoritesReorder(out.ids).catch(() => {});
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
    get().insertCommand(favorite.command, execute);
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

  /**
   * Bir dizinin git durumunu tazeler.
   *
   * Her çağrı bir `git` süreci başlatıyor, o yüzden çağıran yerler SEYREK:
   * dizin değiştiğinde ve komut bittiğinde. Aynı dizin için eşzamanlı ikinci
   * bir çağrı zararsız — sonuç aynı yere yazılıyor.
   */
  async refreshGit(cwd) {
    if (!cwd) return;
    const info = await api.gitInfo(cwd).catch(() => null);
    const imza = await api.gitFingerprint(cwd).catch(() => null);
    gitFingerprints.set(cwd, imza);
    set({ gitInfo: { ...get().gitInfo, [cwd]: info } });
  },

  /**
   * Dışarıdan yapılan değişiklikleri yakalar — ucuza.
   *
   * ÖLÇÜLEN SORUN: dal başka bir uygulamadan (IDE, başka bir terminal)
   * değiştirildiğinde rozet eski dalı göstermeye devam ediyordu. Tazeleme
   * yalnızca dizin değişince ve komut bitince koşuyordu, yani NTerminal'de bir
   * şey yapmadıkça hiçbir şey fark edilmiyordu.
   *
   * Her yoklamada `git status` koşturmak çözüm DEĞİL: büyük bir depoda saniye
   * mertebesinde bir süreç ve bu saniyede bir tekrarlanırdı. Onun yerine iki
   * dosya okumasından bir imza alınıyor (`HEAD` içeriği + `index` zamanı) ve
   * tam sorgu ancak imza değişince koşuyor.
   */
  async pollGit(cwd) {
    if (!cwd) return;
    const imza = await api.gitFingerprint(cwd).catch(() => null);
    // Bilinmeyen dizin: ilk okuma tam sorguyu da tetiklesin.
    if (!gitFingerprints.has(cwd)) {
      await get().refreshGit(cwd);
      return;
    }
    if (gitFingerprints.get(cwd) === imza) return;
    await get().refreshGit(cwd);
  },

  async loadSuggestHistory() {
    // Tekrarlar zaten `rankSuggestions` içinde ayıklanıyor; burada dedupe
    // istemiyoruz ki sıra (en yeni önce) bozulmasın.
    const page = await api
      .historyQuery({ limit: SUGGEST_SOURCE_LIMIT, dedupe: false })
      .catch(() => null);
    if (!page) return;
    set({
      suggestHistory: page.entries.map((e) => ({
        command: e.command,
        cwd: e.cwd ?? null,
        at: e.startedAt,
      })),
    });
  },

  noteCommand(command, cwd) {
    const text = command.trim();
    if (!text) return;
    const next = [
      { command: text, cwd, at: Date.now() },
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

    const cwd = get().activeSession()?.cwd ?? null;

    /*
     * `cd` yazılıyorsa cevap GEÇMİŞTE değil, DİSKTE.
     *
     * Kullanıcının bildirdiği istek buydu: "cd ile yazmaya başlıyorsam
     * bulunduğum konum altındaki klasörleri getirsin, eski kullandığım cd
     * komutlarını değil". Eski bir `cd` başka bir projede yazılmış olabiliyor
     * ve o yolun burada karşılığı yok.
     *
     * Ayrıştırma `lib/cdSuggest.ts` içinde ve saf; burada yalnızca listeyi
     * getirip sonucu bağlıyoruz.
     */
    const query = cdQuery(state.prefix, cwd);
    if (query) {
      lastSuggestInput = state;
      // Liste geldiğinde hesap kullanıcının O ANKİ girdisiyle yeniden koşuyor;
      // kullanıcı bu arada yazmaya devam etmiş olabilir.
      const rerun = () => {
        if (lastSuggestInput) get().updateSuggestions(lastSuggestInput);
      };
      const names = dirNames(query.dir, rerun);
      if (!names) {
        // Liste gelene kadar GEÇMİŞE DÜŞMÜYORUZ: bir an için yanlış cevabı
        // gösterip hemen değiştirmek listeyi zıplatır.
        if (ui.suggest) set({ ui: { ...ui, suggest: null } });
        return;
      }

      /*
       * Yazılan ad bir klasörle TAM eşleşiyorsa onun İÇİ önce geliyor.
       *
       * BİLDİRİLEN HATA: "cd NYAYAN yazdığımda NYAYAN altındaki dizinler için
       * tamamlama yok; cd yapınca geliyor, bir yol yazdıktan sonra gelmiyor."
       * Canlıda ölçülen: panel 1/1 açılıyor, tek satırı yazılanın kendisi.
       * Kabuğun sekme tamamlaması burada bir kat aşağı iner; kullanıcı da onu
       * bekliyor. Çocuklar önce, aynı adla BAŞLAYAN kardeşler sonra
       * (`Work` yazana `Work\Docs`… ve `Workspace`): ikisi de olası niyet,
       * ama tam ad yazan kişi çoğu zaman içine girmek istiyor.
       *
       * Alt klasörün listesi henüz gelmediyse kardeşlerle yetiniyoruz; liste
       * gelince `rerun` tamamını yeniden kuruyor.
       */
      const exact = exactDir(query, names);
      const children = exact ? dirNames(descend(query, exact).dir, rerun) : null;
      const inner = exact && children ? cdSuggestions(descend(query, exact), children, quoteForShell) : [];
      const siblings = cdSuggestions(query, names, quoteForShell);
      const dirs = [...inner, ...siblings].slice(0, MAX_SUGGESTIONS);
      if (dirs.length === 0) {
        if (ui.suggest) set({ ui: { ...ui, suggest: null } });
        return;
      }
      const index =
        ui.suggest && ui.suggest.input === state.prefix
          ? Math.min(ui.suggest.index, dirs.length - 1)
          : 0;
      set({ ui: { ...ui, suggest: { items: dirs, index, input: state.prefix } } });
      return;
    }

    // Dizin etkin oturumdan: aynı yerde çalıştırılmış komutlar önce gelsin.
    const items = rankSuggestions(get().suggestHistory, state.prefix, cwd);
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
    // Uygulama komut satırı açıkken satır kabukta DEĞİL, kutuda: öneriyi
    // kabuğa DEL tuşlarıyla yazmak yanlış olurdu (kabuğun satırı zaten boş).
    // Kabul etme yine tek yerden geçiyor, yalnızca varış noktası değişiyor.
    const sink = get().appInputSink;
    if (sink) {
      sink(suggestion, "replace");
      set({ ui: { ...get().ui, suggest: null } });
      return;
    }
    const session = get().activeSession();
    // Satırdaki metin olarak öneriyi ÜRETEN öneki veriyoruz; ekranı yeniden
    // okumak hayalet metin yüzünden yanlış sonuç veriyordu.
    session?.acceptSuggestion(suggestion, ui.suggest.input);
    set({ ui: { ...get().ui, suggest: null } });
    // Listeye tıklanarak kabul edilmiş olabilir: odak terminale dönmeli,
    // yoksa kullanıcı yazmaya devam edemiyor.
    session?.focus();
  },

  setAppInputSink(sink) {
    set({ appInputSink: sink });
  },

  /**
   * Bir dosyayı görüntüleyicide açar.
   *
   * Sekmeyi de açıyor: kullanıcı paletten ya da ağaçtan bir dosya seçtiğinde
   * içeriğin nerede göründüğünü aramak zorunda kalmamalı.
   */
  openFile(path) {
    set({ ui: { ...get().ui, historyOpen: true, panelMode: "files", viewerPath: path } });
  },

  /**
   * Bir dosya yolunu yazılanın SONUNA ekler.
   *
   * `insertCommand` yerine ayrı bir yol, çünkü işi farklı: orada komutun
   * TAMAMI geliyor ve satırı değiştiriyor. Dosya yolu ise yarım bir komutun
   * argümanı — `code ` yazıp Ctrl+P'ye basan biri yolun yazdığının yerine
   * geçmesini değil, arkasına eklenmesini bekliyor.
   *
   * Boşluk içeren yol tırnaklanıyor: tırnaksız gönderilen böyle bir yol kabukta
   * iki ayrı argümana bölünüyor ve komut sessizce yanlış çalışıyor.
   */
  insertPath(path) {
    const text = /[\s'"`]/.test(path) ? `"${path}"` : path;
    const sink = get().appInputSink;
    if (sink) {
      sink(text, "append");
      return;
    }
    get().activeSession()?.insertCommand(text, false);
  },

  /**
   * Hazır bir komutu satıra koyar (geçmiş, favoriler, geçmiş paneli).
   *
   * Neden depoda ve tek yerde: uygulama komut satırı açıkken satır kabukta
   * değil, kutuda. Metni kabuğa yazmak onu ızgarada gösterir ve kutu boş
   * kalırdı — kullanıcı düzenleyemediği bir komuta bakar.
   *
   * ÇALIŞTIRMA hâli ayrı: komut Enter'ıyla birlikte gidiyor, satırda
   * kalmıyor, dolayısıyla iki kipte de aynı iş.
   */
  insertCommand(command, execute) {
    const sink = get().appInputSink;
    if (sink && !execute) {
      sink(command, "replace");
      return;
    }
    get().activeSession()?.insertCommand(command, execute);
  },

  /**
   * Boş komut satırında yukarı ok: geçmiş listesini açar.
   *
   * Warp'ın davranışı: kutuya odaklanıp yukarı oka basınca ÜSTÜNDE "HISTORY"
   * başlıklı bir panel açılıyor, ok tuşlarıyla geziliyor, Esc kapatıyor.
   * Bizde panel zaten var (`SuggestionBar`) ve başlığı da "GEÇMİŞ"; eksik olan
   * yalnızca onu boş satırda AÇAN yoldu — öneri en az iki harf istiyor.
   *
   * Önceki hâli Ctrl+R penceresini açıyordu. Doğru işi yapıyordu ama ekranın
   * ortasında bir ÖRTÜ olarak: göz komut satırından kopuyor ve kapatınca geri
   * dönüyordu. Panel yazdığınız yerin hemen üstünde ve satırı örtmüyor.
   *
   * Geçmiş boşsa `false` dönüyor: gösterilecek bir şey yokken boş bir panel
   * açmak, tuşun bozuk olduğunu düşündürür.
   */
  openHistorySuggestions() {
    const items = recentCommands(get().suggestHistory);
    if (items.length === 0) return false;
    // `input: ""` sonradan okunuyor: kabul etme yolu bununla "kullanıcı
    // hiçbir şey yazmamıştı" ayrımını yapıyor.
    set({ ui: { ...get().ui, suggest: { items, index: 0, input: "" } } });
    return true;
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

  /*
   * Düzeni yalnızca açılış BAŞARIYLA tamamlandıysa yaz — gerekçe
   * `persistNow` içinde. Ayarlar yukarıda zaten yazıldı: onlar kullanıcının
   * o oturumda yaptığı gerçek düzenlemeler ve açılıştan bağımsız.
   */
  if (!state.ready || state.bootError) return;
  const saveScrollback = state.settings.behavior.restoreScrollback;

  const tasks: Promise<unknown>[] = [];
  const hasScrollback = new Set<string>();

  if (saveScrollback) {
    /*
     * Yalnizca ÇIKTISI DEĞİŞMİŞ sekme yeniden yazılıyor.
     *
     * Bu işlev iki dakikada bir de koşuyor (App içindeki güvenlik kaydı) ve
     * her sekme için `serialize()` çağırmak on sekmede on kez 2000 satırın
     * metne çevrilmesi demek — hepsi ana iş parçacığında, iki dakikada bir
     * görünür bir takılma. Sekmeye yeni çıktı gelmediyse diskteki kopya
     * zaten doğru.
     *
     * Atlanan sekmenin `hasScrollback` bayrağı ÖNCEKİ değerinden taşınıyor:
     * kümeye eklemeyi atlamak "bu sekmenin kaydı yok" demek olurdu ve açılışta
     * ekran çıktısı geri yüklenmezdi — dosya diskte dururken.
     */
    const oncekiKayit = new Set(
      state.groups.flatMap((g) => g.tabs.filter((t) => t.hasScrollback).map((t) => t.id)),
    );
    for (const [tabId, session] of sessions) {
      if (!session.hasUnsavedOutput()) {
        if (oncekiKayit.has(tabId)) hasScrollback.add(tabId);
        continue;
      }
      const data = session.serialize();
      if (data.trim().length > 0) {
        hasScrollback.add(tabId);
        tasks.push(
          api
            .scrollbackSave(tabId, data)
            .then(() => session.markOutputSaved())
            .catch(() => {}),
        );
      } else {
        tasks.push(
          api
            .scrollbackDelete(tabId)
            .then(() => session.markOutputSaved())
            .catch(() => {}),
        );
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
