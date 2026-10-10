import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { focusEscaped } from "../lib/focus";
import { formatBytes } from "../lib/format";
import { api } from "../lib/ipc";
import { LANGS, localeTag, tSplit, tp, useT, type Translate } from "../lib/i18n";
import {
  BUNDLED_FONTS,
  fontStack,
  installedMonoFonts,
  installedUiFonts,
  systemMonoName,
  uiFontStack,
} from "../lib/fonts";
import {
  actionLabel,
  comboConflicts,
  comboFromEvent,
  groupBindings,
  prettyCombo,
} from "../lib/keys";
import type { MsgKey } from "../lib/messages";
import { defaultFontStack, isMac } from "../lib/platform";
import { SECTIONS, searchSettings, type Section } from "../lib/settingsIndex";
import { LIMITS, terminalFontSize } from "../lib/settingsLimits";
import { sessions, useStore, type UpdateInstall } from "../store/useStore";
import type {
  Appearance,
  Behavior,
  CloseAction,
  ConfirmCloseTab,
  Lang,
  Profile,
  RightClickAction,
  ShellKind,
  ShellPrediction,
  ViewMode,
} from "../types";
import { ArgsInput } from "./ArgsInput";
import { BackupPanel } from "./BackupPanel";
import { ColorButton } from "./ColorPanel";
import { DesignPicker } from "./DesignPicker";
import { EnvEditor } from "./EnvEditor";
import {
  AppIcon,
  AppearanceIcon,
  ArchiveIcon,
  ClockIcon,
  InfoIcon,
  KeyboardIcon,
  LayersIcon,
  ProfileIcon,
  SearchIcon,
  SessionIcon,
  SlidersIcon,
  SpinnerIcon,
  TerminalIcon,
} from "./Icons";
import { HealthPanel } from "./HealthPanel";
import { NumberField } from "./NumberField";
import { SettingHint, SettingHints } from "./SettingHint";
import { SettingUndo } from "./SettingUndo";
import { ThemePicker } from "./ThemePicker";


const VIEW_MODES: { value: ViewMode; key: MsgKey }[] = [
  { value: "tabs", key: "view.tabs" },
  { value: "panes", key: "view.panes" },
];

/**
 * Kabuk adlari cevrilmiyor: "PowerShell 7+ (pwsh)" bir urun adi. Yalnizca
 * aciklama tasiyan iki girdi (cmd, ozel) ceviriden geliyor.
 */
/*
 * Premium tasarımın Ayarlar penceresi: bölüm simgeleri ve sayfa başlığının
 * altındaki açıklama. İşaretleme iki tasarımda da var, CSS yalnızca premium'da
 * gösteriyor (`global.css` klasikte gizliyor) — klasik görünüm aynen kalıyor.
 */
const SECTION_ICONS: Record<Section, (props: { size?: number }) => React.ReactElement> = {
  general: SlidersIcon,
  appearance: AppearanceIcon,
  terminal: TerminalIcon,
  session: SessionIcon,
  history: ClockIcon,
  profiles: ProfileIcon,
  groups: LayersIcon,
  keys: KeyboardIcon,
  backup: ArchiveIcon,
  about: InfoIcon,
};

const SECTION_DESC: Record<Section, MsgKey> = {
  general: "settings.descGeneral",
  appearance: "settings.descAppearance",
  terminal: "settings.descTerminal",
  session: "settings.descSession",
  history: "settings.descHistory",
  profiles: "settings.descProfiles",
  groups: "settings.descGroups",
  keys: "settings.descKeys",
  backup: "settings.descBackup",
  about: "settings.descAbout",
};

/**
 * Kaydırıcının dolu kısmı (premium): izin rengi `--fill` yüzdesine kadar vurgu.
 *
 * CSS bir `range`in değerini okuyamıyor; yüzdeyi buradan veriyoruz. Klasikte
 * bu değişkeni okuyan kural yok, yani etkisiz.
 */
function rangeFill(value: number, min: number, max: number): CSSProperties {
  const ratio = max > min ? (value - min) / (max - min) : 0;
  return { "--fill": `${Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10}%` } as CSSProperties;
}

/**
 * Sol menüde yön tuşunun karşılığı: bir aşağı / bir yukarı / baş / son.
 *
 * Değiştirici tuşlu bileşimler (⌘↑, ⌥↓ …) listeye ait değil: metin gezinme ya
 * da uygulama kısayolu olabilirler, dokunulmuyor.
 */
type ListStep = 1 | -1 | "first" | "last";

function listStep(e: React.KeyboardEvent, withHomeEnd: boolean): ListStep | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.key === "ArrowDown") return 1;
  if (e.key === "ArrowUp") return -1;
  if (withHomeEnd && e.key === "Home") return "first";
  if (withHomeEnd && e.key === "End") return "last";
  return null;
}

/** Listede `from`dan `step` kadar ilerlenen sıra; uçlarda durur (dönmez). */
function stepIndex(from: number, step: ListStep, length: number): number {
  if (step === "first") return 0;
  if (step === "last") return length - 1;
  return Math.min(length - 1, Math.max(0, from + step));
}

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

/** Kaynak deposu — "Hakkında › Geliştirici" bölümünde gösteriliyor. */
const REPO_URL = "https://github.com/NYAYAN/NTerminal";

/** Kurulumun ilerleyişi: "İndiriliyor… %42" ya da "Yeniden başlatılıyor…". */
function installProgress(install: UpdateInstall, t: Translate): string {
  if (install.phase === "restarting") return t("update.restarting");
  if (install.phase === "downloading" && install.total) {
    const p = Math.min(100, Math.floor((install.received / install.total) * 100));
    return t("update.downloading", { p });
  }
  return t("update.downloadingUnknown");
}

/**
 * Dosyanın veri klasörüne göre yolu ("settings.json"); klasörün dışındaysa
 * tam yol.
 *
 * Hakkında bölümü aynı kökü beş satırda tekrarlıyordu ve dar kutuda sonları
 * kırpılıyordu ("…/NTerminal/settin"): kök bir kez yazılıyor, dosyalar
 * adlarıyla. İki ayırıcı da deneniyor — yol Windows'ta `\`.
 */
function underRoot(root: string, path: string): string {
  for (const sep of ["/", "\\"]) {
    const prefix = root.endsWith(sep) ? root : root + sep;
    if (path.startsWith(prefix)) return path.slice(prefix.length);
  }
  return path;
}

export function SettingsDialog() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  /*
   * GRUPLANMAMIŞ kova bu listede YOK.
   *
   * Buradaki her alan bir grubun kimliğini düzenliyor: ad, renk, varsayılan
   * profil, klasör, ortam değişkenleri. Kova bir grup değil — adı bile
   * çeviriden geliyor. Listede görünseydi kullanıcı ona ad vermeyi denerdi
   * ve o ad hiçbir yerde görünmezdi.
   */
  const groups = useStore((s) => s.groups).filter((g) => !g.ungrouped);
  const paths = useStore((s) => s.paths);
  const appVersion = useStore((s) => s.appVersion);
  const editingGroupId = useStore((s) => s.ui.editingGroupId);
  const setUi = useStore((s) => s.setUi);

  /*
   * Açılış bölümü: istekle gelen (durum çubuğundaki güncelleme rozeti
   * "Hakkında"yı açıyor), yoksa düzenlenen grup, yoksa "Genel".
   */
  const update = useStore((s) => s.update);
  const install = useStore((s) => s.updateInstall);
  const installing = install.phase === "downloading" || install.phase === "restarting";
  /** Elle denetim sürüyor mu ve son denetimin sonucu ne oldu. */
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<"ok" | "failed" | null>(null);

  const [section, setSection] = useState<Section>(
    editingGroupId ? "groups" : (useStore.getState().ui.settingsSection ?? "general"),
  );

  /*
   * İstek TÜKETİLİYOR: bir açılış için geçerli, sonra siliniyor.
   *
   * `settingsSection` ve `editingGroupId` birer YÖNLENDİRME, kalıcı durum
   * değil — ikisi de yalnızca yukarıdaki `useState` başlangıçlarında okunuyor
   * ve pencere her açılışta yeniden kuruluyor (`{settingsOpen && ...}`).
   *
   * Silinmeselerdi yönlendirme YAPIŞIR: durum çubuğundaki güncelleme rozetiyle
   * bir kez "Hakkında"ya giden kullanıcı, sonraki her açılışta oraya düşerdi —
   * dişlisiyle, Ctrl+, ile ya da paletten açsa bile.
   *
   * Neden `close()` içinde DEĞİL: pencereyi kapatan üç yol var ve yalnızca
   * biri oradan geçiyor (ötekiler `App`teki Escape işleyicisi ve "Aktarma"
   * düğmesi). Tüketimi açılışa bağlamak üçünü de kapsıyor.
   */
  useEffect(() => {
    const { settingsSection, editingGroupId: duzenlenen } = useStore.getState().ui;
    if (settingsSection === null && duzenlenen === null) return;
    setUi({ settingsSection: null, editingGroupId: null });
    // Yalnızca kurulumda: bağımlılık listesi bilerek boş.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selectedProfileId, setSelectedProfileId] = useState(settings.profiles[0]?.id ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState(editingGroupId ?? groups[0]?.id ?? "");
  const [capturing, setCapturing] = useState<string | null>(null);

  /**
   * Makinede kurulu eş aralıklı yazı tipleri.
   *
   * Ölçüm SÜREÇTE bir kez yapılıyor ve `lib/fonts` içinde önbellekte duruyor;
   * gerekçe orada. Burada `useMemo` gereksiz: önbellek aynı diziyi döndürüyor,
   * yani başvuru da kararlı.
   */
  /*
   * Platformun kendi yazı tipi ilk seçenek ve fabrika ayarı o. Kurulu
   * listede ikinci kez görünmesin (Windows'ta Cascadia Mono iki yığınla iki
   * satır olurdu).
   */
  const systemFont = systemMonoName();
  const systemStack = defaultFontStack();
  const installedFonts = installedMonoFonts().filter((f) => f !== systemFont);

  /**
   * Menüde seçili duran değer.
   *
   * Kayıtlı ayar bir seçeneğin yığınıyla birebir eşleşmiyorsa "özel" kipe
   * düşüyoruz — aksi hâlde menü eşleşmeyen bir değerde boş görünür ve
   * kullanıcı kendi yazdığı yazı tipinin kaybolduğunu sanır.
   *
   * Fabrika ayarı da listede: önceki hâlinde menüde yoktu ve ilk açılışta
   * yazı tipi "Özel…" olarak, altında çiğ bir yığınla görünüyordu.
   */
  const [customFont, setCustomFont] = useState(false);
  const bilinen = useMemo(
    () => [
      systemStack,
      ...BUNDLED_FONTS.map((f) => f.stack),
      ...installedFonts.map((f) => fontStack(f)),
    ],
    // `installedFonts` her çizimde süzülen yeni bir dizi; içerik süreçte sabit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [systemStack],
  );
  const fontChoice =
    !customFont && bilinen.includes(settings.appearance.fontFamily)
      ? settings.appearance.fontFamily
      : CUSTOM_FONT;

  /*
   * Arayüz yazı tipi de bir menü: sistem yazı tipi + makinede kurulu olanlar
   * + "Özel…" (gerekçe `lib/fonts.ts` UI_FONT_CANDIDATES). Değer biçimi eskisi
   * gibi (`uiFontStack`), yani kayıtlı ayarlar olduğu gibi tanınıyor.
   */
  const uiFonts = installedUiFonts();
  const [customUiFont, setCustomUiFont] = useState(false);
  const uiFontChoice =
    !customUiFont &&
    (settings.appearance.uiFontFamily === "" ||
      uiFonts.some((f) => uiFontStack(f) === settings.appearance.uiFontFamily))
      ? settings.appearance.uiFontFamily
      : CUSTOM_FONT;
  const [query, setQuery] = useState("");
  /** Aramadan gidilen ayar: bulunduğunda kısa bir vurgu alıyor. */
  const [highlight, setHighlight] = useState<string | null>(null);
  const [historySize, setHistorySize] = useState<string>("");
  /** Geçmişteki kayıt sayısı: sınırı küçültmek kayıt siliyor mu, ona bakılıyor. */
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);

  const store = useStore.getState;
  // `editingGroupId` BURADA temizlenmiyor: yönlendirmeyi açılış tüketiyor
  // (yukarıdaki etki) ve kapanış yollarının yalnızca biri buradan geçiyor.
  const close = () => setUi({ settingsOpen: false });

  const modalRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const titleId = useId();
  /**
   * Arama sonuçlarında Enter'ın hedefi. Sorgu değişince ilk sonuca dönüyor
   * (`onChange`); görünen sonuç sayısından büyükse son sonuca kırpılıyor.
   */
  const [activeHit, setActiveHit] = useState(0);

  /*
   * Klavye odağı pencerede.
   *
   * ÖLÇÜLEN: ⌘, ile açılan pencerede odak arkadaki terminalin gizli
   * textarea'sında kalıyordu; yazılan harf kabuğa gidiyordu (`pty_write`) ve
   * Enter komutu çalıştırırdı. Açılışta odak arama kutusuna alınıyor — "⌘, ve
   * yaz" aynı zamanda bir ayarı bulmanın en kısa yolu. Sonradan dışarı kaçan
   * odak (Tab, terminalin kendi odak çağrıları) geri çekiliyor; kapanışta odak
   * açılıştaki yerine dönüyor ki kullanıcı yazmaya kaldığı yerden devam etsin.
   */
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    const onFocusIn = (event: FocusEvent) => {
      const modal = modalRef.current;
      if (modal && focusEscaped(event.target, modal)) searchRef.current?.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      if (back?.isConnected) back.focus();
    };
  }, []);

  /**
   * Kaydırma tamponunu kaydeder; küçültmek açık sekmelerden satır SİLİYORSA
   * önce sorar ("silme her zaman sorar", `deleteConfirm.test.ts`).
   *
   * xterm tampon küçülünce sığmayan en eski satırları hemen atıyor ve bu geri
   * gelmiyor. Değer depodan okunuyor, kapanıştan değil: kutu pencere kapanırken
   * de kaydedebiliyor (bkz. `NumberField`).
   */
  const commitScrollback = async (next: number): Promise<boolean> => {
    if (next < store().settings.appearance.scrollback) {
      let lost = 0;
      for (const session of sessions.values()) {
        lost += Math.max(0, session.scrollbackLines() - next);
      }
      if (lost > 0) {
        const ok = await store().askConfirm({
          title: t("confirm.scrollbackShrinkTitle"),
          message: tp("confirm.scrollbackShrinkMessage", lost, {
            n: lost.toLocaleString(localeTag()),
          }),
          detail: t("confirm.scrollbackShrinkDetail", { limit: next.toLocaleString(localeTag()) }),
          confirmLabel: t("confirm.delete"),
          danger: true,
        });
        if (!ok) return false;
      }
    }
    await store().patchAppearance({ scrollback: next });
    return true;
  };

  /**
   * Geçmiş sınırını kaydeder; sınırın altında kalan kayıtlar silinecekse önce
   * sorar. Rust tarafı sınırı kayıt anında uyguluyor ve günlük sıkıştırılınca
   * silinen kayıtlar dosyadan da gidiyor.
   */
  const commitHistoryLimit = async (next: number): Promise<boolean> => {
    // Sayı henüz gelmediyse (bölüm yeni açıldı) beklenmeden sorulamaz: silme
    // onaysız geçmesin diye burada okunuyor.
    const total =
      historyTotal ??
      (await api
        .historyStats()
        .then((stats) => stats.total)
        .catch(() => 0));
    if (next < store().settings.behavior.historyLimit && next < total) {
      const lost = total - next;
      const ok = await store().askConfirm({
        title: t("confirm.historyShrinkTitle"),
        message: tp("confirm.historyShrinkMessage", lost, {
          n: lost.toLocaleString(localeTag()),
        }),
        detail: t("confirm.historyShrinkDetail", { limit: next.toLocaleString(localeTag()) }),
        confirmLabel: t("confirm.delete"),
        danger: true,
      });
      if (!ok) return false;
    }
    await store().patchBehavior({ historyLimit: next });
    return true;
  };

  /**
   * Pencere ACILDIGI ANDAKI ayarlar - satir basina "geri al"in olcutu.
   *
   * Fabrika varsayilani DEGIL, bilincli olarak: gerekce `SettingUndo` icinde
   * (varsayilanla karsilastirmak, kullanicinin aylar once kurdugu her ayari
   * "degismis" sayip neredeyse her satira bir dugme koyuyordu).
   *
   * Kopya cikarmaya gerek yok: depo yamalari BAGISIK, her yama ic nesneleri
   * yeniden kuruyor (`patchAppearance`: `{ ...settings.appearance, ...patch }`).
   * Yani ilk cizimde tutulan bu basvuru degismeden kaliyor.
   *
   * Pencere kapanip yeniden acildiginda bilesen sifirdan doguyor, dolayisiyla
   * olcut de yenileniyor - kullanicinin istedigi tam buydu: "cikis yapip giris
   * yaptiysam artik gormemeliyim".
   */
  const [opened] = useState(() => settings);

  /**
   * Tek bir ayarin degisikligini geri alan dugme.
   *
   * Besi ayri ayri yazilmis cunku bes ayri yol var: gorunum ve davranis
   * alanlari icin genel yamalar, dil ve gorunum kipi icin kendi eylemleri
   * (`setLanguage` yalniz ayari degil sozlugu de degistiriyor), kisayollar
   * icinse eylem adi basina bir harita.
   */
  function undoAppearance<K extends keyof Appearance>(key: K) {
    return (
      <SettingUndo
        changed={settings.appearance[key] !== opened.appearance[key]}
        onUndo={() =>
          void store().patchAppearance({ [key]: opened.appearance[key] } as Partial<Appearance>)
        }
      />
    );
  }

  function undoBehavior<K extends keyof Behavior>(key: K) {
    return (
      <SettingUndo
        changed={settings.behavior[key] !== opened.behavior[key]}
        onUndo={() =>
          void store().patchBehavior({ [key]: opened.behavior[key] } as Partial<Behavior>)
        }
      />
    );
  }

  function undoLanguage() {
    return (
      <SettingUndo
        changed={settings.language !== opened.language}
        onUndo={() => void store().setLanguage(opened.language)}
      />
    );
  }

  function undoViewMode() {
    return (
      <SettingUndo
        changed={settings.appearance.viewMode !== opened.appearance.viewMode}
        onUndo={() => void store().setViewMode(opened.appearance.viewMode)}
      />
    );
  }

  function undoKey(action: string) {
    const before = opened.keybindings[action];
    if (before === undefined) return null;
    return (
      <SettingUndo
        changed={settings.keybindings[action] !== before}
        onUndo={() =>
          void store().patchSettings({
            keybindings: { ...settings.keybindings, [action]: before },
          })
        }
      />
    );
  }

  /**
   * Yalnızca kısayolları fabrika ayarına döndürür; öteki ayarlara dokunmaz.
   *
   * Varsayılanlar Rust'tan (platforma göre: mac'te Cmd). Bu sürümün
   * tanımadığı eylemler (başka bir sürümden gelen) olduğu gibi kalıyor.
   */
  const resetKeys = () => {
    void store()
      .askConfirm({
        title: t("confirm.resetKeysTitle"),
        message: t("confirm.resetKeysMessage"),
        detail: t("confirm.resetKeysDetail"),
        confirmLabel: t("confirm.reset"),
        danger: true,
      })
      .then(async (ok) => {
        if (!ok) return;
        try {
          const defaults = await api.defaultKeybindings();
          await store().patchSettings({
            keybindings: { ...store().settings.keybindings, ...defaults },
          });
        } catch (err) {
          store().toast(String(err), "err");
        }
      });
  };

  /** Pencere altligindaki genel sifirlama; onay sorup HER SEYI geri aliyor. */
  const resetAll = () => {
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
  };

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
    // Tür platformun kabuğu: mac'te yeni profil PowerShell türünde açılıyordu
    // ve kabuk yolu boşken "türe göre varsayılan" pwsh'i arıyordu — çoğu mac'te
    // kurulu değil. `-l`: mac'te PATH'i login kabuğu kuruyor (gerekçe Rust
    // `shells.rs` default_args).
    const fresh: Profile = {
      id,
      name: t("settings.newProfileName"),
      kind: isMac() ? "zsh" : "pwsh",
      shell: "",
      args: isMac() ? ["-l"] : [],
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
          setHistoryTotal(stats.total);
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
  const active = Math.min(activeHit, hits.length - 1);

  /*
   * Sol menüde yön tuşları.
   *
   * İSTEK: "Ayarlarda sol menüde geçişleri yön tuşları ile de yapabileyim."
   *
   * - Bölüm düğmesinde ↑/↓ bir önceki / sonraki bölümü AÇIYOR ve odağı ona
   *   taşıyor; Home/End ilk / son bölüm. Uçlarda duruyor, başa sarmıyor.
   * - Arama kutusu boşken ↑/↓ aynı işi yapıyor, odak kutuda kalıyor: pencere
   *   açılınca odak zaten orada (bkz. odak etkisi) ve macOS'ta Tab varsayılan
   *   olarak düğmelere gitmiyor — tek klavye yolu bu.
   * - Arama varken ↑/↓ sonuçlar arasında geziniyor (vurgulu satır), Enter onu
   *   açıyor. Bir sonuç düğmesindeyken de oklar sonuçlar arasında; ilk sonuçta
   *   ↑ arama kutusuna dönüyor, yazmaya devam edilebilsin.
   *
   * Sekme sırası "gezici": listede yalnızca seçili öğe Tab ile odaklanıyor
   * (`tabIndex`), liste içinde oklarla geziliyor — dokuz bölümü tek tek
   * Tab'lamak gerekmiyor.
   */
  const moveSection = (from: Section, step: ListStep, focus: boolean) => {
    const index = SECTIONS.findIndex((s) => s.id === from);
    const next = SECTIONS[stepIndex(index, step, SECTIONS.length)].id;
    if (next !== section) setSection(next);
    const button = navRef.current?.querySelector<HTMLElement>(`[data-section="${next}"]`);
    if (focus) button?.focus();
    else button?.scrollIntoView?.({ block: "nearest" });
  };

  const moveHit = (from: number, step: ListStep, focus: boolean) => {
    if (hits.length === 0) return;
    const next = stepIndex(from, step, hits.length);
    setActiveHit(next);
    const row = navRef.current?.querySelectorAll<HTMLElement>(".settings-result")[next];
    if (focus) row?.focus();
    else row?.scrollIntoView?.({ block: "nearest" });
  };

  const openHit = (hit: (typeof hits)[number]) => {
    setSection(hit.section);
    setHighlight(hit.key);
  };
  const conflicts = comboConflicts(settings.keybindings);

  return (
    <div className="overlay" onMouseDown={close}>
      <div
        ref={modalRef}
        className="modal settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Başlıkta ayar dosyasının yolu YOK: aynı yol Hakkında › Dosya
            konumları'nda duruyor ve başlığın en göze çarpan şeyi oydu. */}
        <div className="modal-head">
          <h2 id={titleId}>{t("settings.title")}</h2>
          {/* Sayfa başlığı: yalnızca premium tasarımda görünüyor (klasikte
              bölüm adı gezinmede zaten seçili duruyor). */}
          <div className="settings-page">
            <h3 className="settings-page-title">
              {t(SECTIONS.find((s) => s.id === section)!.key)}
            </h3>
            <p className="settings-page-desc">{t(SECTION_DESC[section])}</p>
          </div>
          <button
            className="icon-btn"
            title={t("common.close")}
            aria-label={t("common.close")}
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="settings-body">
          {/* Dikey gezinme: dokuz bölüm yatay bir şeride sığmıyor ve her
              yeni ayar şeridi biraz daha daraltıyordu. */}
          <nav
            className="settings-nav"
            ref={navRef}
            onKeyDown={(e) => {
              const target = e.target as HTMLElement;
              const step = listStep(e, true);
              if (step === null) return;
              if (target.dataset.section) {
                e.preventDefault();
                moveSection(target.dataset.section as Section, step, true);
                return;
              }
              if (target.classList.contains("settings-result")) {
                e.preventDefault();
                const rows = [...(navRef.current?.querySelectorAll(".settings-result") ?? [])];
                const index = rows.indexOf(target);
                if (step === -1 && index === 0) searchRef.current?.focus();
                else moveHit(index, step, true);
              }
            }}
          >
            <div className="settings-search">
              <span className="settings-search-ico" aria-hidden="true">
                <SearchIcon size={13} />
              </span>
              <input
                ref={searchRef}
                value={query}
                placeholder={t("settings.searchPlaceholder")}
                // Doluyken Esc aramayı temizliyor, boşken pencereyi kapatıyor
                // (bkz. `escapeOwnedBy`).
                data-owns-escape={query ? "" : undefined}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveHit(0);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setQuery("");
                  // Yalnız ↑/↓: Home/End kutuda imleci taşımaya devam ediyor.
                  const step = listStep(e, false);
                  if (step !== null) {
                    e.preventDefault();
                    if (query) moveHit(active, step, false);
                    else moveSection(section, step, false);
                  }
                  // Enter: vurgulu sonuca (başta ilki) git. Arama kutusundan
                  // elini çekmeden en olası hedefe ulaşmak için.
                  if (e.key === "Enter" && hits.length > 0) openHit(hits[active]);
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
                {hits.map((hit, i) => (
                  <button
                    key={`${hit.section}:${hit.key}`}
                    className={i === active ? "settings-result on" : "settings-result"}
                    tabIndex={i === active ? 0 : -1}
                    onClick={() => openHit(hit)}
                  >
                    <span className="settings-result-label">{hit.label}</span>
                    {/* Bölüm › başlık: iki "Boyut" (terminal ve arayüz) ancak
                        başlığıyla ayırt ediliyor. */}
                    <span className="settings-result-where">
                      <span className="settings-result-section">{hit.sectionLabel}</span>
                      {hit.groupLabel && (
                        <span className="settings-result-group"> › {hit.groupLabel}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              SECTIONS.map((s) => {
                const Icon = SECTION_ICONS[s.id];
                return (
                  <button
                    key={s.id}
                    data-section={s.id}
                    className={section === s.id ? "on" : ""}
                    aria-current={section === s.id}
                    tabIndex={section === s.id ? 0 : -1}
                    onClick={(e) => {
                      setSection(s.id);
                      // macOS (WebKit) tıklanan düğmeye odak vermiyor; odak
                      // pencerenin gövdesine düşüyor ve ardından basılan ok
                      // tuşu hiçbir yere gitmiyordu. Odağı açıkça veriyoruz.
                      e.currentTarget.focus();
                    }}
                  >
                    <span className="nav-ico" aria-hidden="true">
                      <Icon size={13} />
                    </span>
                    {t(s.key)}
                  </button>
                );
              })
            )}
          </nav>

          {/* Aciklama katmanlarinin kabi. `key={section}`: `useId` agactaki
              KONUMA gore kimlik uretiyor, yani bolum degisince ayni konumdaki
              yeni aciklama eskisinin kimligini alip kendiliginden acik
              gorunurdu. Kap yenilenince acik olan sifirlaniyor. */}
          <SettingHints key={section}>
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
                  <SettingHint>{t("settings.languageHint")}</SettingHint>
                  {undoLanguage()}
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
                  <SettingHint>
                    {t(settings.appearance.viewMode === "panes" ? "view.panesHint" : "view.tabsHint")}{" "}
                    {t("view.shortcut", {
                      keys: prettyCombo(settings.keybindings.toggleViewMode ?? "Ctrl+Shift+E"),
                    })}
                  </SettingHint>
                  {undoViewMode()}
                </div>
              </div>
            </>
          )}

          {section === "appearance" && (
            <>
              <div className="section">
                <h3>{t("settings.design")}</h3>
                {/* Tasarım renk temasından ayrı bir eksen (gerekçe `lib/design.ts`):
                    tema RENGİ, tasarım BİÇİMİ seçiyor. Kartlar `DesignPicker` içinde. */}
                <div className="field top" data-setting="settings.designLabel">
                  <label>{t("settings.designLabel")}</label>
                  <DesignPicker
                    value={settings.appearance.design}
                    onChange={(design) => void store().patchAppearance({ design })}
                  />
                  <SettingHint>{t("settings.designHint")}</SettingHint>
                  {undoAppearance("design")}
                </div>
              </div>

              <div className="section">
                <h3>{t("settings.theme")}</h3>
                {/* Renk örnekli kartlar (gerekçe `ThemePicker` içinde). İlk
                    kart "Sistemi izle": ayarda `system` duruyor, çizilen tema
                    sistemin görünümüne göre çözülüyor (`themes.ts`). */}
                <div className="field top" data-setting="settings.colorTheme">
                  <label>{t("settings.colorTheme")}</label>
                  <ThemePicker
                    value={settings.appearance.theme}
                    onChange={(theme) => void store().patchAppearance({ theme })}
                  />
                  <SettingHint>{t("settings.themeSystemHint")}</SettingHint>
                  {undoAppearance("theme")}
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

                    İlk seçenek platformun kendi yazı tipi ve fabrika ayarı:
                    mac'te SF Mono (`ui-monospace`), Windows'ta Cascadia Mono.
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
                    <option value={systemStack} style={{ fontFamily: systemStack }}>
                      {t("settings.fontSystem", { name: systemFont })}
                    </option>
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
                  {undoAppearance("fontFamily")}
                </div>
                {/* Kaydırıcı ile ⌘= / ⌘- aynı sınırları kullanıyor
                    (`settingsLimits`; önceden 28'e karşı 32'ydi). Kaydırıcı
                    ayarı değiştiriyor ve kısayolla yapılmış yakınlaştırmayı
                    sıfırlıyor: elle seçilen boyut, görünen boyut. */}
                <div className="field" data-setting="settings.fontSize">
                  <label>{t("settings.fontSize", { n: settings.appearance.fontSize })}</label>
                  <input
                    type="range"
                    min={LIMITS.fontSize.min}
                    max={LIMITS.fontSize.max}
                    value={settings.appearance.fontSize}
                    style={rangeFill(
                      settings.appearance.fontSize,
                      LIMITS.fontSize.min,
                      LIMITS.fontSize.max,
                    )}
                    onChange={(e) =>
                      void store().patchAppearance({
                        fontSize: Number(e.target.value),
                        fontZoom: 0,
                      })
                    }
                  />
                  {undoAppearance("fontSize")}
                  {terminalFontSize(settings.appearance) !== settings.appearance.fontSize && (
                    <div className="hintline">
                      {t("settings.fontZoomed", {
                        n: terminalFontSize(settings.appearance),
                        keys: prettyCombo(settings.keybindings.zoomReset ?? ""),
                      })}
                    </div>
                  )}
                </div>
                <div className="field" data-setting="settings.lineHeightLabel">
                  <label>
                    {t("settings.lineHeightLabel", {
                      n: settings.appearance.lineHeight.toFixed(2),
                    })}
                  </label>
                  <input
                    type="range"
                    min={LIMITS.lineHeight.min}
                    max={LIMITS.lineHeight.max}
                    step={0.05}
                    value={settings.appearance.lineHeight}
                    style={rangeFill(
                      settings.appearance.lineHeight,
                      LIMITS.lineHeight.min,
                      LIMITS.lineHeight.max,
                    )}
                    onChange={(e) =>
                      void store().patchAppearance({ lineHeight: Number(e.target.value) })
                    }
                  />
                  {undoAppearance("lineHeight")}
                </div>
                {/* Adım 1: xterm harf aralığını tam piksele yuvarlıyor, yarım
                    adımların yarısı hiçbir şey değiştirmiyordu (ölçüm
                    `settingsLimits` LIMITS.letterSpacing yanında). */}
                <div className="field" data-setting="settings.letterSpacingLabel">
                  <label>
                    {t("settings.letterSpacingLabel", { n: settings.appearance.letterSpacing })}
                  </label>
                  <input
                    type="range"
                    min={LIMITS.letterSpacing.min}
                    max={LIMITS.letterSpacing.max}
                    step={1}
                    value={settings.appearance.letterSpacing}
                    style={rangeFill(
                      settings.appearance.letterSpacing,
                      LIMITS.letterSpacing.min,
                      LIMITS.letterSpacing.max,
                    )}
                    onChange={(e) =>
                      void store().patchAppearance({ letterSpacing: Number(e.target.value) })
                    }
                  />
                  {undoAppearance("letterSpacing")}
                </div>
              </div>

              {/*
                Arayüz yazı tipi TERMİNALİNKİNDEN AYRI bir bölümde.

                Aynı bölüme koymak "boyut" alanının hangisine ait olduğunu
                belirsiz bırakıyordu; ölçülen soru da tam buydu — Görünüm'den
                seçilen yazı tipinin yalnızca terminali etkilediği fark
                edilmiyordu.

                Aile listesi terminalinki gibi bir AÇILIR MENÜ: sistem yazı
                tipi, makinede kurulu olanlar (her biri kendi yazı tipiyle) ve
                "Özel…". Önceki öneri listesinin (`datalist`) kusurları
                `lib/fonts.ts` içinde. Özel bir ad kurulu değilse yığın
                sistemin kendi ailesine düşüyor (`applyUiFont`), yani yanlış
                bir giriş bozuk bir arayüz üretmiyor.
              */}
              <div className="section">
                <h3>{t("settings.uiFont")}</h3>
                <div className="field" data-setting="settings.uiFontFamily">
                  <label>{t("settings.uiFontFamily")}</label>
                  <select
                    value={uiFontChoice}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_FONT) {
                        setCustomUiFont(true);
                        return;
                      }
                      setCustomUiFont(false);
                      void store().patchAppearance({ uiFontFamily: e.target.value });
                    }}
                  >
                    <option value="">{t("settings.uiFontSystem")}</option>
                    {uiFonts.length > 0 && (
                      <optgroup label={t("settings.fontInstalled")}>
                        {uiFonts.map((family) => (
                          <option
                            key={family}
                            value={uiFontStack(family)}
                            style={{ fontFamily: uiFontStack(family) }}
                          >
                            {family}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value={CUSTOM_FONT}>{t("settings.fontCustom")}</option>
                  </select>
                  {uiFontChoice === CUSTOM_FONT && (
                    <input
                      className="font-custom"
                      value={settings.appearance.uiFontFamily}
                      placeholder={t("settings.fontCustomHint")}
                      onChange={(e) =>
                        void store().patchAppearance({ uiFontFamily: e.target.value })
                      }
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  )}
                  {undoAppearance("uiFontFamily")}
                </div>
                <div className="field" data-setting="settings.uiFontSize">
                  <label>{t("settings.uiFontSize", { n: settings.appearance.uiFontSize })}</label>
                  <input
                    type="range"
                    min={LIMITS.uiFontSize.min}
                    max={LIMITS.uiFontSize.max}
                    value={settings.appearance.uiFontSize}
                    style={rangeFill(
                      settings.appearance.uiFontSize,
                      LIMITS.uiFontSize.min,
                      LIMITS.uiFontSize.max,
                    )}
                    onChange={(e) =>
                      void store().patchAppearance({ uiFontSize: Number(e.target.value) })
                    }
                  />
                  <SettingHint>{t("settings.uiFontHint")}</SettingHint>
                  {undoAppearance("uiFontSize")}
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
                  {undoAppearance("cursorStyle")}
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
                {undoAppearance("cursorBlink")}
              </div>

              <div className="section">
                <h3>{t("settings.tabsHeading")}</h3>
                <div className="check-row" data-setting="settings.shellBadge">
                  <input
                    id="showShellBadge"
                    type="checkbox"
                    checked={settings.appearance.showShellBadge}
                    onChange={(e) =>
                      void store().patchAppearance({ showShellBadge: e.target.checked })
                    }
                  />
                  <label htmlFor="showShellBadge">{t("settings.shellBadge")}</label>
                </div>
                {/* Örnek kodlar platformun kabuklarından: mac'te PS/CMD/WSL yok. */}
                <SettingHint>
                  {t(isMac() ? "settings.shellBadgeHintMac" : "settings.shellBadgeHint")}
                </SettingHint>
                {undoAppearance("showShellBadge")}
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
                {undoBehavior("copyOnSelect")}
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
                  {undoBehavior("rightClickAction")}
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
                    <SettingHint>{t("settings.ctrlCHint")}</SettingHint>
                    {undoBehavior("ctrlCCopiesSelection")}
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
                <SettingHint>{t("settings.highlightLinksHint")}</SettingHint>
                {undoAppearance("highlightLinks")}
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
                <SettingHint>{t("settings.commandBlocksHint")}</SettingHint>
                {undoBehavior("commandBlocks")}
                {/* Blok basligi bloklara BAGLI: bloklar kapaliyken cizilecek
                    bir baslik da yok. Bagi girinti de gosteriyor (`.sub`):
                    yalnizca soluklasan bir satir neden kapali oldugunu
                    soylemiyordu. */}
                <div className="check-row sub" data-setting="settings.blockHeaders">
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
                <SettingHint>{t("settings.blockHeadersHint")}</SettingHint>
                {undoBehavior("blockHeaders")}
                <div className="check-row" data-setting="settings.appInput">
                  <input
                    id="appInput"
                    type="checkbox"
                    checked={settings.behavior.appInput}
                    onChange={(e) => void store().patchBehavior({ appInput: e.target.checked })}
                  />
                  <label htmlFor="appInput">{t("settings.appInput")}</label>
                </div>
                <SettingHint>{t("settings.appInputHint")}</SettingHint>
                {undoBehavior("appInput")}
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
                <SettingHint>{t("settings.promptAtBottomHint")}</SettingHint>
                {undoBehavior("promptAtBottom")}
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
                <SettingHint>{t("settings.appSuggestionsHint")}</SettingHint>
                {undoBehavior("appSuggestions")}
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
                  {/* Aciklama dugmesi uyaridan ONCE: izgarada kesin sutunu
                      (bilgi sutunu) olan bir oge, kendinden onceki ogenin
                      satirina yerlesiyor. Uyari araya girse dugme uyarinin
                      satirina duserdi, denetimin degil. */}
                  <SettingHint>
                    {t(isMac() ? "settings.predictionHintMac" : "settings.predictionHint")}
                  </SettingHint>
                  {undoBehavior("shellPrediction")}
                  {settings.behavior.promptAtBottom &&
                    settings.behavior.shellPrediction === "list" && (
                      <div className="hintline warn">
                        {t("settings.predictionListBlocked")}
                      </div>
                    )}
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
                  <SettingHint>{t("settings.macOptionIsMetaHint")}</SettingHint>
                  {undoBehavior("macOptionIsMeta")}
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
                {undoBehavior("restoreSession")}
              </div>

              {/*
                Ekran çıktısının iki sayısı YAN YANA: bellekte tutulan
                (kaydırma tamponu) ve diske yazılan. Önceden biri Görünüm'de
                biri burada duruyordu; ikincisi birincisini geçemiyor ve bu
                ilişki ancak yan yana görünüyor.

                Sayı kutuları yazarken değil, kutudan çıkınca kaydediyor
                (gerekçe ve ölçüm `NumberField` içinde).
              */}
              <div className="section">
                <h3>{t("settings.screenOutput")}</h3>
                <div className="field" data-setting="settings.scrollbackLines">
                  <label>{t("settings.scrollbackLines")}</label>
                  <NumberField
                    value={settings.appearance.scrollback}
                    limit={LIMITS.scrollback}
                    step={500}
                    onCommit={commitScrollback}
                  />
                  <SettingHint>{t("settings.scrollbackHint")}</SettingHint>
                  {/* Geri alma da küçültebilir: o da sorarak (`commitScrollback`). */}
                  <SettingUndo
                    changed={settings.appearance.scrollback !== opened.appearance.scrollback}
                    onUndo={() => void commitScrollback(opened.appearance.scrollback)}
                  />
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
                {undoBehavior("restoreScrollback")}
                {/* Ekran çıktısı geri yüklenmiyorsa diske yazılan satır sayısının
                    bir etkisi yok: kutu kapalı. */}
                <div className="field" data-setting="settings.scrollbackPerTab">
                  <label>{t("settings.scrollbackPerTab")}</label>
                  <NumberField
                    value={settings.behavior.scrollbackSaveLines}
                    limit={{
                      ...LIMITS.scrollbackSaveLines,
                      max: Math.min(LIMITS.scrollbackSaveLines.max, settings.appearance.scrollback),
                    }}
                    step={100}
                    disabled={!settings.behavior.restoreScrollback}
                    onCommit={(lines) => void store().patchBehavior({ scrollbackSaveLines: lines })}
                  />
                  <SettingHint>{t("settings.scrollbackPerTabHint")}</SettingHint>
                  {undoBehavior("scrollbackSaveLines")}
                </div>
              </div>

              {/* "Oturum devamlılığı" değil: yeni sekmenin nerede açılacağı,
                  açılışta neyin geri geleceğiyle ilgili değil. */}
              <div className="section">
                <h3>{t("settings.newTabs")}</h3>
                <div className="check-row" data-setting="settings.inheritCwd">
                  <input
                    id="inheritCwd"
                    type="checkbox"
                    checked={settings.behavior.inheritCwd}
                    onChange={(e) => void store().patchBehavior({ inheritCwd: e.target.checked })}
                  />
                  <label htmlFor="inheritCwd">{t("settings.inheritCwd")}</label>
                </div>
                {undoBehavior("inheritCwd")}
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
                  <SettingHint>{t("settings.confirmCloseTabHint")}</SettingHint>
                  {undoBehavior("confirmCloseTab")}
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
                  <SettingHint>{t("settings.closeActionHint")}</SettingHint>
                  {undoBehavior("closeAction")}
                </div>
              </div>
            </>
          )}

          {section === "history" && (
            <div className="section">
              <h3>{t("settings.history")}</h3>
              {/* Sınırı küçültmek kayıt SİLİYOR: kutu yazarken değil kutudan
                  çıkınca kaydediyor ve silinecek kayıt varsa önce soruyor
                  (`commitHistoryLimit`). Geri alma da aynı yoldan. */}
              <div className="field" data-setting="settings.historyLimit">
                <label>{t("settings.historyLimit")}</label>
                <NumberField
                  value={settings.behavior.historyLimit}
                  limit={LIMITS.historyLimit}
                  step={1000}
                  onCommit={commitHistoryLimit}
                />
                <SettingHint>
                  {t("settings.historyLimitHint", {
                    size: historySize || t("settings.historyReading"),
                  })}
                </SettingHint>
                <SettingUndo
                  changed={settings.behavior.historyLimit !== opened.behavior.historyLimit}
                  onUndo={() => void commitHistoryLimit(opened.behavior.historyLimit)}
                />
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
              {undoBehavior("historyDedupe")}
            </div>
          )}

          {section === "profiles" && (
            <div className="profile-grid">
              <div>
                {/* Satırlar DÜĞME: önceki `div`ler yalnızca fareyle
                    seçilebiliyordu, klavyeyle odak bile almıyordu. */}
                <div className="profile-list">
                  {settings.profiles.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={p.id === selectedProfileId ? "row on" : "row"}
                      aria-pressed={p.id === selectedProfileId}
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
                    </button>
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
                      <SettingHint>{t("settings.shellKindHint")}</SettingHint>
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
                      {/* Kutu kendi metnini tutuyor: önceki hâli sondaki
                          boşluğu her tuşta siliyordu ("-l -i" → "-l-i").
                          Boşluk içeren argüman tırnakla (`lib/args.ts`). */}
                      <ArgsInput
                        args={profile.args}
                        placeholder={t("settings.argsPlaceholder")}
                        onChange={(args) => updateProfile({ args })}
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
                      {/* Yerel renk girdisi değil: macOS'ta seçicisi ekranın sol
                          alt köşesinde açılıyordu (bkz. `ColorPanel`). */}
                      <ColorButton
                        value={profile.color}
                        label={t("common.color")}
                        onChange={(color) => updateProfile({ color })}
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
                    {/*
                      Onay kutusu DEĞİL: her zaman tam bir varsayılan profil
                      var, yani işaret kaldırılamıyordu — tıklamak hiçbir şey
                      yapmıyordu. Varsayılan olmayan profilde bir düğme,
                      varsayılanda durumun kendisi.
                    */}
                    <div className="field">
                      <label>{t("settings.defaultProfile")}</label>
                      {settings.defaultProfileId === profile.id ? (
                        <span className="dim">{t("settings.isDefault")}</span>
                      ) : (
                        <button
                          type="button"
                          className="outline default-btn"
                          onClick={() => void store().setProfiles(settings.profiles, profile.id)}
                        >
                          {t("settings.makeDefault")}
                        </button>
                      )}
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
                  <button
                    type="button"
                    key={g.id}
                    className={g.id === selectedGroupId ? "row on" : "row"}
                    aria-pressed={g.id === selectedGroupId}
                    onClick={() => setSelectedGroupId(g.id)}
                  >
                    <span
                      className="dot"
                      style={{ background: g.color ?? "#666", width: 8, height: 8, borderRadius: "50%" }}
                    />
                    <span className="nm">{g.name}</span>
                    <span className="kbd">{g.tabs.length}</span>
                  </button>
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
                      <ColorButton
                        value={group.color}
                        label={t("common.color")}
                        onChange={(color) => store().updateGroup(group.id, { color })}
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
                      <SettingHint>{t("settings.groupProfileHint")}</SettingHint>
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
            <>
              <div className="section">
                <h3>{t("settings.keysHeading")}</h3>
                <p className="dim" style={{ fontSize: 11, marginTop: 0 }}>
                  {t("settings.keysHint")}
                </p>
                {/*
                  Yalnızca kısayolları geri alan TOPLU düğme. Satır başına
                  "varsayılana dön" bilinçli olarak yok: satırdaki geri al
                  bu oturumdaki değişiklik için (gerekçe `SettingUndo`),
                  fabrika ayarına dönüş toplu. Önceden bunun tek yolu bütün
                  ayarları sıfırlamaktı.
                */}
                <button type="button" className="outline keys-reset" onClick={resetKeys}>
                  {t("keys.resetAll")}
                </button>
              </div>
              {/*
                Gruplu ve sabit sırada (`keys.ts` ACTION_GROUPS): önceki liste
                eylem kimliğine göre alfabetikti ve kullanıcıya rastgele
                görünüyordu.

                Aynı tuş iki eyleme atanmışsa İKİ satır da uyarıyor: genel
                dinleyici ilk eşleşeni çalıştırıyor, öteki eylem kısayoldan
                sessizce erişilemez oluyordu.
              */}
              {groupBindings(settings.keybindings).map((group) => (
                <div className="section" key={group.key}>
                  <h3>{t(group.key)}</h3>
                  {group.actions.map((action) => {
                    const clash = conflicts.get(action);
                    return (
                      <div className="field" key={action}>
                        <label>{actionLabel(action)}</label>
                        {/* Kayıt sırasında Esc kaydı iptal ediyor, pencereyi
                            kapatmıyor (`data-owns-escape`, bkz. `escapeOwnedBy`). */}
                        <input
                          className="mono key-capture"
                          readOnly
                          data-owns-escape={capturing === action ? "" : undefined}
                          value={
                            capturing === action
                              ? t("settings.pressKey")
                              : prettyCombo(settings.keybindings[action])
                          }
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
                        {undoKey(action)}
                        {clash && (
                          <div className="hintline warn">
                            {t("keys.conflict", { actions: clash.map(actionLabel).join(", ") })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {section === "backup" && <BackupPanel />}

          {section === "about" && (
            <>
              <div className="section about-hero">
                <AppIcon className="about-icon" size={56} />
                <h3>N-Terminal {appVersion}</h3>
                <p className="dim">{t("settings.aboutBlurb")}</p>
              </div>

              {/*
                Güncelleme.

                Yayın imzalıysa ve bu kopya kurulu bir paketse (`installable`)
                "Güncelle ve yeniden başlat" uygulamanın İÇİNDEN kuruyor;
                değilse yalnızca indirme sayfası. İndirme sayfası her durumda
                duruyor: kurulum düşerse elle kurmanın yolu o.

                Sürüm notları BURADA gösteriliyor, bir düğmenin arkasında
                değil: "güncelleyeyim mi" kararını veren şey tam olarak o
                metin ve onu okumak için tarayıcı açmak gerekmemeli.
              */}
              <div className="section">
                <h3>{t("update.heading")}</h3>

                {/* Etiket "Yüklü sürüm": önceki etiket ("Güncellemeleri
                    denetle") yanındaki düğmenin metninin aynısıydı. */}
                <div className="field" data-setting="update.check">
                  <label>{t("update.installedVersion")}</label>
                  <div
                    style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}
                  >
                    <span className="mono">{appVersion}</span>
                    <button
                      className="outline"
                      disabled={checking}
                      onClick={() => {
                        setChecking(true);
                        setResult(null);
                        void useStore
                          .getState()
                          .checkUpdate(true)
                          .then((ok) => setResult(ok ? "ok" : "failed"))
                          .finally(() => setChecking(false));
                      }}
                    >
                      {checking ? t("update.checking") : t("update.check")}
                    </button>
                    {/* Elle denetimden sonra SONUÇ yazıyor: hiçbir şey
                        değişmeyen bir düğme, çalışmamış gibi görünüyor.
                        "Güncel" ile "denetlenemedi" ayrı: ağı olmayan bir
                        makinede "bu sürüm güncel" demek, bilmediğimiz bir şeyi
                        biliyormuş gibi yapmak olurdu. */}
                    {!checking && result === "failed" && (
                      <span className="err-text">{t("update.failed")}</span>
                    )}
                    {!checking && result === "ok" && !update && (
                      <span className="dim">{t("update.upToDate")}</span>
                    )}
                  </div>
                </div>

                {update && (
                  <>
                    <div className="field" data-setting="update.newVersion">
                      <label>{t("update.newVersion")}</label>
                      {/* `wrap`: dar pencerede iki düğme denetim sütununa
                          sığmıyor; nowrap düğmeler sütundan taşardı. */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <span className="mono">{update.version}</span>
                        {/* Commit/Push düğmeleriyle aynı dil: sürerken çark,
                            yazı sabit (genişlik zıplamıyor); ilerleme altta ve
                            ipucunda. */}
                        {update.installable && (
                          <button
                            className="primary update-install"
                            disabled={installing}
                            aria-busy={installing}
                            title={installing ? installProgress(install, t) : undefined}
                            onClick={() => void store().installUpdate()}
                          >
                            {installing && <SpinnerIcon size={12} />}
                            <span>{t("update.install")}</span>
                          </button>
                        )}
                        {/* Kurulum varken ikincil; kurulum düşerse elle yol. */}
                        <button
                          className={update.installable ? "outline" : "primary"}
                          onClick={() => void api.openExternal(update.url).catch(() => {})}
                        >
                          {t("update.openPage")}
                        </button>
                      </div>
                      {/* Düğmelerin satırında değil ALTINDA: yanda sütuna
                          sığmayıp alt satıra kayıyor ve etiketi iki satırın
                          ortasına itiyordu (WebKit'te görüldü). */}
                      {installing && (
                        <div className="hintline update-progress">{installProgress(install, t)}</div>
                      )}
                      {/* "Seçtiğin şey yürümedi" ipucu (`hintline warn`): neyin
                          düştüğü ve elle yol; ham hata ikinci satırda. */}
                      {install.phase === "failed" && (
                        <div className="hintline warn update-failed">
                          {t("update.installFailed")}
                          <br />
                          <span className="mono">{install.error}</span>
                        </div>
                      )}
                    </div>
                    {update.notes && (
                      <div className="field" data-setting="update.notes">
                        <label>{t("update.notes")}</label>
                        <pre className="release-notes">{update.notes}</pre>
                      </div>
                    )}
                  </>
                )}

                <div className="check-row" data-setting="update.autoCheck">
                  <input
                    id="checkUpdates"
                    type="checkbox"
                    checked={settings.behavior.checkUpdates}
                    onChange={(e) =>
                      void store().patchBehavior({ checkUpdates: e.target.checked })
                    }
                  />
                  <label htmlFor="checkUpdates">{t("update.autoCheck")}</label>
                </div>
                <SettingHint>{t("update.autoCheckHint")}</SettingHint>
              </div>

              {/*
                Geliştirici bilgileri kendi bölümünde.

                Önceki hâli "Hakkında"nın açıklama metninin altındaki tek bir
                soluk satırdı ("Geliştirici · Nurullah YAYAN") — sürümün ve
                teknoloji cümlesinin arasında kaybolan bir dipnot. Uygulamayı
                kimin yazdığı, kaynağın nerede olduğu ve hangi lisansla
                dağıtıldığı birbirine bağlı üç bilgi; birlikte ve etiketli
                duruyorlar.

                Kaynak bağlantısı TIKLANABİLİR değil, yanında bir düğme var:
                uygulama bir tarayıcı değil ve dış bağlantıyı açmak kullanıcının
                kararı olmalı — kazara tıklamayla tarayıcı açılmıyor.
              */}
              <div className="section">
                <h3>{t("settings.developerHeading")}</h3>
                <div className="field" data-setting="settings.developerLabel">
                  <label>{t("settings.developerLabel")}</label>
                  <span>{t("settings.developerName")}</span>
                </div>
                <div className="field" data-setting="settings.sourceCode">
                  <label>{t("settings.sourceCode")}</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input readOnly className="mono" style={{ flex: 1 }} value={REPO_URL} />
                    <button
                      className="outline"
                      title={t("settings.openInBrowser")}
                      onClick={() => void api.openExternal(REPO_URL).catch(() => {})}
                    >
                      {t("settings.openFolderShort")}
                    </button>
                  </div>
                </div>
                <div className="field" data-setting="settings.licenseLabel">
                  <label>{t("settings.licenseLabel")}</label>
                  <span>{t("settings.licenseValue")}</span>
                </div>
                <div className="hintline">{t("settings.copyright")}</div>
              </div>
              <div className="section">
                <h3>{t("settings.fileLocations")}</h3>
                {paths && (
                  <>
                    <div className="field" data-setting="settings.dataFolder">
                      <label>{t("settings.dataFolder")}</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input readOnly className="mono" style={{ flex: 1 }} value={paths.root} />
                        <button className="outline" onClick={() => void api.revealInExplorer(paths.root)}>
                          {t("settings.openFolderShort")}
                        </button>
                      </div>
                      <SettingHint>
                        {t(paths.portable ? "settings.portableOn" : "settings.portableOff")}
                      </SettingHint>
                    </div>
                    {/* Dosyalar veri klasörüne GÖRE: kök bir kez, yukarıda.
                        Önceden her satır tam yolu tekrarlıyordu ve dar kutuda
                        sonları kırpılıyordu ("…/settin"). Tam yol ipucunda. */}
                    <div className="field">
                      <label>{t("app.settings")}</label>
                      <span className="mono path-rel" title={paths.settingsFile}>
                        {underRoot(paths.root, paths.settingsFile)}
                      </span>
                    </div>
                    <div className="field" data-setting="settings.workspaceFile">
                      <label>{t("settings.workspaceFile")}</label>
                      <span className="mono path-rel" title={paths.workspaceFile}>
                        {underRoot(paths.root, paths.workspaceFile)}
                      </span>
                    </div>
                    <div className="field">
                      <label>{t("settings.history")}</label>
                      <span className="mono path-rel" title={paths.historyFile}>
                        {underRoot(paths.root, paths.historyFile)}
                      </span>
                    </div>
                    <div className="field" data-setting="settings.integrationDir">
                      <label>{t("settings.integrationDir")}</label>
                      <span className="mono path-rel" title={paths.integrationDir}>
                        {underRoot(paths.root, paths.integrationDir)}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {/* Teşhis okuması EN ALTTA: günlük kullanımda kimsenin
                  aramadığı, bir sorun çıktığında bakılan sayılar. Gerekçesi
                  `HealthPanel` içinde. */}
              <HealthPanel />
            </>
          )}
          </div>
          </SettingHints>
        </div>

        <div className="modal-foot">
          <span className="dim">{t("settings.savedInstantly")}</span>
          <span className="spacer" />
          {/* Genel sifirlama altlikta: onceki yeri Hakkinda bolumunun dibiydi,
              yani ayari degistiren kullanicinin bulundugu yerden dort tik
              uzakta. Altlik her bolumde gorunuyor. */}
          <button className="outline" onClick={resetAll}>
            {t("settings.resetAll")}
          </button>
          <button className="primary" onClick={close}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
