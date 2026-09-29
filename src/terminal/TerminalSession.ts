import { Terminal, type IBufferLine, type IDisposable, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { api, onPtyData, onPtyExit } from "../lib/ipc";
import { t } from "../lib/i18n";
import { hasVisibleContent, type BlockView } from "../lib/blocks";
import { scanForServerUrls } from "../lib/serverScan";
import { linkCellRanges, type CellLike } from "../lib/links";
import { acceptKeys, effectiveShellPrediction } from "../lib/suggest";
import { resolveCtrlC, type CtrlCAction } from "../lib/inputMode";
import { typingOutsideTerminal } from "../lib/focus";
import { cwdFromFileUri, parseOsc133, parseOsc633 } from "../lib/osc";
import { isMac, platform } from "../lib/platform";
import { getTheme } from "../lib/themes";
import {
  MAX_WEBGL,
  demote as lruDemote,
  drop as lruDrop,
  evictions as lruEvictions,
  touch as lruTouch,
} from "../lib/webglLru";
import type { Settings } from "../types";

interface BufferMark {
  y: number;
  x: number;
}

/**
 * Bir komut bloğu: istem satırı, komut ve çıktısı.
 *
 * Başlangıç bir xterm İŞARETÇİSİ (marker). Düz satır numarası tutmak
 * çalışmıyor: kaydırma geçmişi dolduğunda xterm en eski satırları atıyor ve
 * mutlak numaralar kayıyor. İşaretçiyi xterm kendisi güncelliyor, satır
 * geçmişten düşünce de kendini kapatıyor (`isDisposed`).
 *
 * Bitiş AYRI TUTULMUYOR: bir bloğun sonu, bir sonraki bloğun başlangıcının bir
 * üstü. İkinci bir işaretçi hem gereksiz hem de senkron tutulması gereken
 * ikinci bir gerçek olurdu.
 */
interface TrackedBlock {
  id: string;
  marker: IMarker;
  command: string | null;
  /**
   * İstem çizilirken geçerli olan dizin.
   *
   * O ANDA yakalanıyor, sonradan okunmuyor: `cd` çalıştıran bir komuttan sonra
   * oturumun dizini değişiyor ve blok başlığı komutun ÇALIŞTIĞI yeri
   * göstermeli, sonrasını değil.
   */
  cwd: string | null;
  exitCode: number | null;
  durationMs: number | null;
  running: boolean;
}

/**
 * Bellekte tutulan en fazla blok.
 *
 * Sınır gerekiyor: uzun bir oturumda binlerce blok birikir ve her biri bir
 * işaretçi tutar. Yüz blok, kaydırma geçmişinde geriye doğru gözle bakılacak
 * mesafeden fazlası.
 */
const MAX_BLOCKS = 100;

/**
 * Calisan komut basina tutulan en fazla sunucu adresi.
 *
 * Dort yetiyor: bir sunucu genelde bir ya da iki adres yaziyor (http + https,
 * ya da yerel + ag). Fazlasi rozet seridini komut satirindan genis yapiyor.
 */
const RUN_URL_LIMIT = 4;

/**
 * Tek taramada okunacak en fazla satir.
 *
 * Maliyet siniri: buyuk bir cikti patlamasinda binlerce satiri tek karede
 * okumak arayuzu bekletir. Adres bir sunucunun ciktisinda baslarda geciyor,
 * dolayisiyla pratikte bir sey kacmiyor.
 */
const MAX_SCAN_LINES = 2000;

/**
 * Kabuğun komut önerisi durumu.
 *
 * `unsupported` = kabuk destekliyor ama sürümü yetmiyor (PSReadLine 2.0).
 * `unknown` = kabuk hiç bildirmedi (cmd, bash, entegrasyonsuz profil).
 */
export type PredictionState = "unknown" | "off" | "inline" | "list" | "unsupported";

export interface SessionCallbacks {
  onTitle?: (title: string) => void;
  onCwd?: (cwd: string) => void;
  onCommandStart?: (command: string) => void;
  onCommandEnd?: (command: string, exitCode: number | null) => void;
  onExit?: (code: number | null) => void;
  onBell?: () => void;
  /** Terminal içinden yeni sekme / kapatma gibi bir kısayol geldiğinde. */
  onShortcut?: (action: string) => boolean;
  /** Bağlantı açılamadı (tarayıcı başlatılamadı, şema desteklenmiyor). */
  onLinkFailed?: (uri: string) => void;
  /** Kabuk komut önerisini açabildi mi. */
  onPrediction?: (state: PredictionState) => void;
  /** İstem satırında yazılmakta olan metin değişti. */
  onInput?: (state: { prefix: string; full: string; hintTail: boolean }) => void;
  /**
   * Girdi kipini belirleyen sinyaller değişti.
   *
   * Karar burada verilmiyor (bkz. `lib/inputMode.ts`): oturum yalnızca ne
   * gördüğünü bildiriyor, ayarı ve sonucu arayüz birleştiriyor.
   */
  /** Çalışan komutun çıktısında bir sunucu adresi görüldü. */
  onRunLinks?: (urls: string[]) => void;
  /**
   * Görünüm en altta mı — yani kullanıcı geçmişe kaydırmış durumda mı.
   *
   * Yalnızca DEĞİŞTİĞİNDE bildiriliyor: her kaydırma karesinde depoyu
   * güncellemek akan çıktıda saniyede onlarca yeniden çizim demek.
   */
  onScrollState?: (atBottom: boolean) => void;
  onInputSignals?: (signals: {
    atPrompt: boolean;
    altScreen: boolean;
    integration: boolean;
  }) => void;
}

export interface SessionInit {
  tabId: string;
  groupId: string;
  profileId: string;
  cwd: string | null;
  env: Record<string, string>;
  settings: Settings;
  /** Windows yapı numarası; xterm'in ConPTY kipini seçmesi için gerekli. */
  windowsBuild: number;
  restoreScrollback: boolean;
}

/** Enter'dan sonra kabuk entegrasyonunun 133;C göndermesi için beklenen süre. */
/**
 * Bağlantı renklendirmesi erteleme penceresi (ms).
 *
 * Gözle fark edilmeyecek kadar kısa, `onRender` fırtınasını kesecek kadar
 * uzun. Yoğun çıktıda (derleme kayıtları) çizim başına tarama yapmak
 * gereksiz.
 */
const LINK_HIGHLIGHT_DELAY = 90;

/**
 * Yazılan metni okuma gecikmesi (ms).
 *
 * Tuşa basıldığı anda ekran tamponu HENÜZ o karakteri içermiyor: karakter
 * kabuğa gidiyor, kabuk yansıtıyor, sonra tamponda görünüyor. Hemen okumak
 * bir karakter geride kalmış bir ön ek veriyor ve öneri yanlış çıkıyor.
 */
const INPUT_NOTIFY_DELAY = 70;

const INTEGRATION_GRACE_MS = 220;

/**
 * WebGL bağlamı tutan oturumlar, en son kullanılan SONDA.
 *
 * Modül düzeyinde çünkü tavan TÜM terminaller için geçerli: motorun sınırı
 * pencere başına, oturum başına değil. Gerekçe ve ölçüm `lib/webglLru.ts`
 * başında; buradaki tek iş sırayı tutmak.
 */
let webglOrder: TerminalSession[] = [];

export class TerminalSession {
  readonly tabId: string;
  groupId: string;
  profileId: string;

  readonly term: Terminal;
  private readonly fit = new FitAddon();
  private readonly serializer = new SerializeAddon();
  readonly search = new SearchAddon();
  private webgl: WebglAddon | null = null;
  /** Kabuğun bildirdiği komut önerisi durumu; durum çubuğu gösteriyor. */
  prediction: PredictionState = "unknown";
  /** Bağlantı renklendirmesi için kaydedilen imleç ve dekorasyonlar. */
  private linkDecorations: IDisposable[] = [];
  /**
   * EKRANDA BOYALI olanın imzası; `null` ise boyalı bir şey yok.
   *
   * Yalnızca bir önbellek değil, döngü kıran şey — gerekçesi
   * `refreshLinkHighlight` içinde.
   */
  private linkSignature: string | null = null;
  private linkTimer: number | null = null;
  private inputTimer: number | null = null;

  private container: HTMLElement | null = null;
  /**
   * Terminal EKRANDA mi.
   *
   * Gizli sekmeler duzenden cikarilmiyor (`visibility: hidden`, gerekce
   * `TerminalArea`da): xterm'in olcumu bozulmasin diye. Bedeli sessizce
   * buraya biniyordu - gizli bir sekmeye cikti aktikca kare basina bir React
   * yeniden cizimi (blok katmani) ve 90ms'de bir bag lanti taramasi kosuyordu,
   * kimsenin gormedigi bir terminal icin. On sekmeli bir pencerede bu
   * carpiliyor.
   *
   * Varsayilan `true` BILINCLI: `setDisplay` cagrilmayan bir yol kalirsa
   * eksik cizim degil fazla is olur - sessizce bos ekran gostermekten iyi.
   */
  private visible = true;
  /**
   * Blok katmaninin OLCULEN geometrisi.
   *
   * `getBoundingClientRect` yerlesimi zorluyor (React'in bekleyen degisiklikleri
   * varsa hemen hesaplaniyor) ve bu deger kare basina okunuyordu. Oysa yalnizca
   * olcu degisince degisiyor: yeniden boyutlandirma, `fit`, yazi tipi/boyut.
   * Onlar `invalidateGeometry` ile bu onbellegi dusuruyor. `viewportTop` ve
   * `rows` onbellege GIRMIYOR: ikisi de ucuz alan okumasi ve her karede
   * degisiyor.
   */
  private geometry: { top: number; left: number; width: number; cellHeight: number } | null =
    null;
  /**
   * Son diske yazimdan bu yana ekrana yeni cikti geldi mi.
   *
   * `flushAllState` iki dakikada bir BUTUN sekmeleri seri hale getiriyordu;
   * on sekme x 2000 satir, ana is parcaciginda. Ciktisi degismemis sekmenin
   * diskteki dosyasi zaten dogru.
   */
  private outputSinceSave = false;
  private resizeObserver: ResizeObserver | null = null;
  private disposables: IDisposable[] = [];
  private unlisteners: UnlistenFn[] = [];

  private settings: Settings;
  private env: Record<string, string>;

  cwd: string | null;
  title = "";
  pid: number | null = null;
  shell = "";
  /** Kabuk entegrasyonu devrede mi (komut metni ve çıkış kodu güvenilir mi)? */
  integration = false;
  exited = false;
  exitCode: number | null = null;
  spawned = false;

  // --- kabuk entegrasyonu durum makinesi
  private promptEndMark: BufferMark | null = null;
  private oscCommand: string | null = null;
  private enterSnapshot: string | null = null;
  private fallbackTimer: number | null = null;
  private durationOverride: number | null = null;

  private activeHistoryId: string | null = null;
  private activeCommand: string | null = null;
  /**
   * Bu istem (prompt) icin bir kayit acildi mi?
   *
   * Yedek zamanlayici ile kabuk entegrasyonu yarisabiliyor: zamanlayici 220 ms
   * sonra tampondan okudugu metinle kaydi acar, hemen ardindan gec kalan
   * `OSC 133;C` gelirse ayni komut icin ikinci kayit acilirdi. Bayrak
   * `133;A`/`133;B` ile (yeni istem) ve komut bitince sifirlaniyor, dolayisiyla
   * "onceki komut hala calisiyor" durumu ile karismiyor.
   */
  private openedForCurrentPrompt = false;
  /** Kabuk istemde bekliyor mu: OSC 133;B geldi, 133;C gelmedi. */
  private atPrompt = false;
  /** İkincil ekran tamponu etkin mi (vim, less, htop). */
  private altScreen = false;
  private blocks: TrackedBlock[] = [];
  private blockSeq = 0;
  private blockSyncFrame: number | null = null;
  private blockListener: (() => void) | null = null;
  /** Kabuk görünür istem yerine boş satır bırakıyor mu (OSC 633;P;BlockHeader). */
  private blockHeaderMode = false;
  /** Uygulama komut satırı etkin mi (imleç gizli, stdin kapalı). */
  private appInputActive = false;
  /** Çalışan komutun çıktısında görülen sunucu adresleri. */
  /**
   * Geri yükleme ayıracının satırı.
   *
   * Ayıraç terminale metin olarak yazılmıyor (gerekçesi `start` içinde);
   * yalnızca boş bir satır açılıp işaretleniyor ve katman onu buradan
   * buluyor. Terminal temizlenirse xterm işaretçiyi düşürüyor ve satır
   * `-1` oluyor — o zaman ayıraç da çizilmiyor.
   */
  private restoreMarker: IMarker | null = null;
  private serverUrls: string[] = [];
  /**
   * Görünüm en altta mı. Başlangıçta evet: yeni açılan terminal en altta.
   *
   * Doğru değer her zaman xterm'in tamponundan okunuyor (`readAtBottom`); bu
   * alan yalnızca "değişti mi" karşılaştırması için duruyor, yoksa her
   * kaydırma karesinde arayüz yeniden çizilirdi.
   */
  private atBottom = true;
  /**
   * Adres taramasının geldiği son satır (mutlak tampon satırı).
   *
   * Komut başlarken o anki satıra kuruluyor: bir komutun çıktısı yalnızca
   * kendi ürettiği satırlardan okunuyor.
   */
  /**
   * Komutun başladığı satırın işaretçisi — taramanın ÇAPASI.
   *
   * Düz bir sayı DEĞİL ve bu düzeltilmiş bir hatanın izi. Mutlak satır
   * numarası tutulduğunda kaydırma geçmişi dolunca tarama kalıcı olarak
   * duruyordu: xterm en eski satırı atıp yenisini eklediği için `baseY`
   * büyümeyi bırakıyor, akan çıktıda `baseY + cursorY` sabit kalıyor ve
   * "imleç ilerledi mi" koşulu bir daha hiç sağlanmıyordu. Kullanıcının
   * gördüğü: "uzun süre kullanınca açılan sunucunun portu görünmüyor."
   *
   * İşaretçiyi xterm kendisi güncelliyor (kırpmada aşağı çekiyor, satır
   * büsbütün düşünce kapatıyor), dolayısıyla çapa ile imleç birlikte kayıyor
   * ve aradaki fark doğru kalıyor. Komut blokları da aynı sebeple işaretçi
   * kullanıyor.
   */
  private scanAnchor: IMarker | null = null;
  /** Çapadan kaç satır ileri tarandı (bkz. `ScanState.scannedAhead`). */
  private scannedAhead = 0;
  private activeStartedAt = 0;
  /** Komut çalışıyor mu? Sekme kapatma onayı ve göstergeler için. */
  running = false;

  private callbacks: SessionCallbacks = {};

  constructor(init: SessionInit) {
    this.tabId = init.tabId;
    this.groupId = init.groupId;
    this.profileId = init.profileId;
    this.cwd = init.cwd;
    this.env = init.env;
    this.settings = init.settings;

    const theme = getTheme(init.settings.appearance.theme);
    this.term = new Terminal({
      allowProposedApi: true,
      fontFamily: init.settings.appearance.fontFamily,
      fontSize: init.settings.appearance.fontSize,
      lineHeight: init.settings.appearance.lineHeight,
      letterSpacing: init.settings.appearance.letterSpacing,
      cursorStyle: init.settings.appearance.cursorStyle,
      cursorBlink: init.settings.appearance.cursorBlink,
      scrollback: init.settings.appearance.scrollback,
      theme: theme.xterm,
      convertEol: false,
      /*
       * Kaydırma çubuğunun genişliği BURADAN geliyor.
       *
       * xterm kendi çubuğunu çiziyor (VS Code'un kaydırılabilir öğesi), yani
       * `::-webkit-scrollbar` kuralları ona ULAŞMIYOR — uygulamanın geri kalanı
       * 9px'ken terminalinki 14px kalıyordu ve gözle farkı belliydi.
       * Genişliği veren tek seçenek bu: xterm içeride
       * `verticalScrollbarSize = overviewRuler?.width || 14` diyor.
       *
       * İkinci etkisi bilinçli: `width` verilmeden genel bakış sütunu HİÇ
       * çizilmiyor. Arama eklentisi zaten `matchOverviewRuler` ve
       * `activeMatchColorOverviewRuler` renklerini veriyordu
       * (bkz. TerminalFind.tsx) ama sütun kapalı olduğu için o renkler
       * ölüydü — artık eşleşmeler çubuğun yanında işaretleniyor ve uzun
       * çıktıda eşleşmenin nerede olduğu kaydırmadan görünüyor.
       */
      overviewRuler: { width: 9 },
      // macOS'ta Option'ı Meta yapmak kullanıcının seçimi. Varsayılan kapalı:
      // Türkçe Mac klavyesinde `@` = Option+Q ve açık olsa `@` yazılamazdı —
      // terminalde `@angular/cli` ya da bir e-posta adresi yazmak imkânsız
      // olurdu. Açıkken Option+B/F kelime kelime gezinmeyi veriyor (Windows'ta
      // Alt'ın yaptığı iş). Diğer platformlarda ayarın etkisi yok.
      macOptionIsMeta: isMac() && init.settings.behavior.macOptionIsMeta,
      rightClickSelectsWord: false,
      // windowsPty YALNIZCA Windows'ta verilmeli.
      //
      // Windows'ta buildNumber şart: xterm satır akışını (reflow)
      // `backend === "conpty" && buildNumber >= 21376` koşuluyla açıyor.
      // Vermezsek Windows 11'de bile eski kipte kalır ve pencere yeniden
      // boyutlandırıldığında uzun satırlar yanlış birleşir.
      //
      // macOS'ta ise vermek AKTIF ZARARLI: xterm o bayrağı görünce ConPTY'ye
      // özgü düzeltmeleri uyguluyor — satırın son karakteri boşluk değilse
      // "bu satır kaydırılmış" varsayıyor. Gerçek bir Unix PTY'de bu varsayım
      // yanlış ve alakasız satırlar birleşmiş görünüyor.
      ...(platform() === "windows"
        ? {
            windowsPty: {
              backend: "conpty" as const,
              ...(init.windowsBuild > 0 ? { buildNumber: init.windowsBuild } : {}),
            },
          }
        : {}),
    });

    this.term.loadAddon(this.fit);
    this.term.loadAddon(this.serializer);
    this.term.loadAddon(this.search);
    // Baglanti tiklamasi: varsayilan handler `window.open` cagiriyor, Tauri
    // webview'unde bu hicbir sey yapmadigi icin linkler tiklanamaz
    // gorunuyordu. Isletim sisteminin varsayilan tarayicisina Rust tarafindan
    // gonderiyoruz.
    this.term.loadAddon(
      new WebLinksAddon(
        (event, uri) => {
          event.preventDefault();
          void api.openExternal(uri).catch(() => {
            this.callbacks.onLinkFailed?.(uri);
          });
        },
        {
          hover: () => this.container?.classList.add("link-hover"),
          leave: () => this.container?.classList.remove("link-hover"),
        },
      ),
    );

    const unicode = new Unicode11Addon();
    this.term.loadAddon(unicode);
    this.term.unicode.activeVersion = "11";

    this.registerHandlers();
  }

  /** Dikkat: bütün geri çağırmaları DEĞİŞTİRİR, birleştirmez. */
  setCallbacks(callbacks: SessionCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Blok katmanının yeniden çizim aboneliği.
   *
   * `setCallbacks` yerine AYRI bir yol, çünkü o bütün kancaları değiştiriyor:
   * bileşenden çağrılsaydı deponun kancalarını (başlık, dizin, komut başladı)
   * sessizce siler ve sekme başlığından geçmiş kaydına kadar her şey dururdu.
   */
  setBlockListener(listener: (() => void) | null) {
    this.blockListener = listener;
  }

  // ------------------------------------------------------------- yaşam döngüsü

  /**
   * Terminali DOM'a bağlar. Aynı oturum için birden çok kez çağrılabilir.
   *
   * ## Neden ikinci çağrı `open()` DEĞİL
   *
   * ÖLÇÜLEN HATA: ilk grupta çalışan bir sekme varken yeni bir grup açmak, o
   * sekmenin ekranını BOŞALTIYORDU — yazılanlar da, çalışan komutun çıktısı
   * da gidiyordu.
   *
   * Zincir şöyleydi: yeni grubun sekmesi yok, `TerminalArea` bir çizim boyunca
   * "hiç sekme yok" kutusuna dönüyor ve bütün barındırıcıları söküyordu
   * (düzeltmesi orada). React yeni düğümleri kurunca `attach` yeniden
   * çağrılıyor ve eskiden burada `term.open()` vardı — ama xterm ikinci
   * çağrıda HİÇBİR ŞEY YAPMIYOR:
   *
   *     open(e) { ...; if (this.element?.ownerDocument.defaultView && this._coreBrowserService) return; ... }
   *
   * Yani terminalin kendi düğümü ESKİ (artık ağaçtan kopmuş) kabın içinde
   * kalıyor, yeni kap boş duruyordu. Kabuk arkada yaşamaya devam ettiği için
   * belirti "silinmiş" gibi görünüyordu, oysa ekran hiç taşınmamıştı.
   *
   * Doğrusu taşımak: xterm'in düğümü zaten kurulu, tampon ve kaydırma konumu
   * onun içinde. Yeni kaba eklemek her ikisini de olduğu gibi getiriyor.
   */
  attach(container: HTMLElement) {
    if (this.container === container) return;
    this.container = container;

    const opened = this.term.element;
    if (opened) container.appendChild(opened);
    else this.term.open(container);

    this.invalidateGeometry();
    this.safeFit();

    this.syncCellHeight();

    // Eski kabın gözlemcisi burada bırakılıyor: kap değiştiğinde eskisi artık
    // ölçülmemeli, yoksa kopmuş bir düğümün boyutu terminali yeniden
    // boyutlandırmaya çalışır.
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.onContainerResize());
    this.resizeObserver.observe(container);
  }

  /**
   * Kap yeniden boyutlandı: ölçüleri tazele ve blok katmanını yeniden çizdir.
   *
   * Ayrı bir yöntem çünkü `ResizeObserver` geri çağrısı jsdom'da test
   * edilemiyor (`attach`, gözlemci kurulmadan önce xterm'in canvas bağlamına
   * takılıp düşüyor); bu yöntemi doğrudan çağırmak fitin ETKİSİZ olduğu
   * durumu — hatanın çıktığı durumu — test edilebilir kılıyor
   * (`resizeBlocks.test.ts`).
   */
  private onContainerResize() {
    // Kap boyu degisti: `safeFit` satir/sutun ayni kalirsa erken donuyor,
    // ama dikdortgen yine kaymis olabiliyor - onbellek her durumda dusuyor.
    this.invalidateGeometry();
    this.safeFit();
    this.syncCellHeight();
    /*
     * Blok katmanini KOSULSUZ tazele.
     *
     * OLCULEN HATA: sag panel acilip kapaninca terminalin son satirlarinda
     * eski blok basliklari (dizin rozeti, sure rozeti) yanlis satira cizili
     * kaliyor - ciktinin ustune biniyor. Kaydirinca duzeliyordu.
     *
     * KOK NEDEN: katman kendini xterm'in `onRender`ina bagli tazeliyor. Panel
     * ac-kapa net boyut degisimini sifira indirdiginde `safeFit` satir/sutun
     * ayni kaldigi icin erken donuyor - `fit` yok, `onRender` yok, katmani
     * yeniden cizen kimse yok. Ama genislik degisti ve onbellek dustu, yani
     * katman eski geometriyle ekranda kaliyor. Ekran statikse duzeltecek bir
     * sonraki cizim de gelmiyor.
     *
     * Kap her boyutlandiginda bir kez cizdirmek bu bosluğu kapatiyor:
     * `notifyBlocks` yalnizca bir yeniden cizim tetikliyor (bkz.
     * `scheduleBlockSync`), taze geometriyi katman kendi okuyor. `setDisplay`
     * gorunur olurken zaten ayni isi yapiyor.
     */
    this.notifyBlocks();
  }

  /**
   * Kabuğu başlatır. Önce varsa önceki oturumun ekran çıktısını yazıyoruz:
   * kullanıcı "kaldığı yeri" görsün, ama bunun canlı çıktı olmadığı da belli olsun.
   */
  async start(restoreData: string | null) {
    if (this.spawned) return;
    this.spawned = true;

    if (restoreData) {
      this.term.write(restoreData);
      /*
       * Ay\u0131ra\u00e7 terminale YAZILMIYOR; uygulama \u00e7iziyor.
       *
       * \u00d6L\u00c7\u00dcLEN HATA: "\u00f6nceki oturum burada bitti" sat\u0131r\u0131 yaz\u0131ld\u0131\u011f\u0131 andaki
       * geni\u015fli\u011fe donuyordu. Sa\u011fdaki \u00e7ekmece a\u00e7\u0131l\u0131p terminal daral\u0131nca sat\u0131r
       * ta\u015f\u0131p alt sat\u0131ra sark\u0131yor, pencere geni\u015fleyince de eski dar
       * geni\u015fli\u011finde kal\u0131p ortalanm\u0131\u015f de\u011fil SOLA YAPI\u015eIK g\u00f6r\u00fcn\u00fcyordu.
       *
       * Bu, metin olarak yazman\u0131n ka\u00e7\u0131n\u0131lmaz sonucu: tampona giren bir sat\u0131r
       * art\u0131k sabit bir metin, yeniden \u00f6l\u00e7\u00fclendirmede kendini ortalayamaz.
       * Tek \u00e7\u00f6z\u00fcm onu DOM'da \u00e7izmek \u2014 blok ba\u015fl\u0131klar\u0131 da ayn\u0131 sebeple \u00f6yle
       * \u00e7iziliyor (bkz. `TerminalBlocks`) ve ayn\u0131 geometriyi kullan\u0131yor.
       *
       * Terminale yaln\u0131zca BO\u015e bir sat\u0131r a\u00e7\u0131l\u0131yor ve o sat\u0131r i\u015faretleniyor;
       * katman i\u015faret\u00e7inin bulundu\u011fu sat\u0131r\u0131n \u00fcst\u00fcne yaz\u0131y\u0131 ve \u00e7izgileri
       * \u00e7iziyor. Bo\u015f sat\u0131r \u015fart: katman kayd\u0131rmayla birlikte hareket ediyor
       * ama alt\u0131ndaki metni \u00f6rtmemeli.
       */
      await new Promise<void>((resolve) => this.term.write("\r\n", () => resolve()));
      this.restoreMarker = this.term.registerMarker(0);
      await new Promise<void>((resolve) => this.term.write("\r\n", () => resolve()));
    }

    /*
     * Dinleyiciler SPAWN'DAN ÖNCE kuruluyor. Sıra süs değil, hatanın kendisi.
     *
     * ÖLÇÜLEN BELİRTİ: yeni bir sekmede komut kutusu hiç açılmıyor; sekmeyi
     * yeniden başlatmak düzeltiyor.
     *
     * KÖK NEDEN: Rust tarafı PTY'yi doğurur doğurmaz okumaya başlıyor ve
     * çıktıyı `app.emit` ile yayımlıyor. Tauri'nin olay yayını TAMPONSUZ — o an
     * kayıtlı dinleyici yoksa veri düşüyor, birikmiyor. Kurulum tersken
     * `ptySpawn`ın yanıtı ile `listen` kaydı arasında en az bir IPC gidiş
     * dönüşü vardı ve kabuğun ilk istemi o aralığa denk gelebiliyordu. Kutu
     * "istemde miyiz" bilgisini o istemin OSC 133;B işaretinden alıyor; işaret
     * kaçınca kabuk istemde SESSİZCE beklediği için bir daha gelmiyor ve kutu
     * kalıcı olarak kapalı kalıyordu.
     *
     * Yarış olduğu için belirti aralıklıydı: makine meşgulken (oturum geri
     * yüklenirken, yeni grubun sekmesi on sekmenin yanında açılırken) sık.
     *
     * Bu sırada pencere tümden kapanıyor: olay adı sekme kimliğinden türüyor ve
     * kimlik spawn'dan önce belli, yani dinlemeye erken başlamanın sakıncası
     * yok. Kayıt spawn başarısız olsa da duruyor; o kimlik için hiç olay
     * gelmiyor ve `dispose` ikisini de kapatıyor.
     */
    this.unlisteners.push(
      await onPtyData(this.tabId, (bytes) => {
        /*
         * Adres taramasi YAZMA BITTIKTEN SONRA, geri cagirmada.
         *
         * Ayni parca hem komut baslangici isaretini (OSC 133;C) hem sunucunun
         * adresini tasiyabiliyor. Tarama once kossaydi adres, o parcadaki
         * baslangic isareti daha ayristirilmamisken toplanir ve hemen ardindan
         * gelen "yeni komut, yeni liste" temizligi onu silerdi. Tersi de oluyor:
         * eski listeye eklenip iki rozet yan yana kaliyordu.
         *
         * `write` ESZAMANSIZ: parcayi kuyruga alip zamanlanmis olarak
         * ayristiriyor. Bu yuzden hemen ardindan cagirmak da yetmiyor - sirayi
         * ancak geri cagirma garantiliyor.
         */
        this.outputSinceSave = true;
        this.term.write(bytes, () => this.scanNewLines());
      }),
    );
    this.unlisteners.push(
      await onPtyExit(this.tabId, (code) => this.handleExit(code)),
    );

    try {
      const result = await api.ptySpawn({
        id: this.tabId,
        profileId: this.profileId,
        cwd: this.cwd,
        env: {
          ...this.env,
          // Kabuk betigi bunu okuyup PSReadLine tahminini aciyor. Ayar
          // olarak tasiniyor cunku kullanici kapatabilmeli.
          // Liste gorunumu istem dipteyken calisamiyor; kural tek yerde
          // (bkz. `effectiveShellPrediction`).
          NTERMINAL_PREDICTION: effectiveShellPrediction(
            this.settings.behavior.shellPrediction,
            this.settings.behavior.promptAtBottom,
          ),
          // Istemi ekranin dibine iten kod da kabukta: satiri kabuk ciziyor,
          // bosluk eklemesi de onun akisinda olmali (bkz. nterminal.ps1).
          NTERMINAL_PROMPT_BOTTOM: this.settings.behavior.promptAtBottom ? "1" : "0",
          // Gorunur istemi kabuk yazmiyor; basligi arayuz ciziyor.
          NTERMINAL_BLOCK_HEADER:
            this.settings.behavior.commandBlocks && this.settings.behavior.blockHeaders
              ? "1"
              : "0",
        },
        cols: this.term.cols,
        rows: this.term.rows,
      });
      this.pid = result.pid;
      this.shell = result.shell;
      this.integration = result.integration;
      // Temel durumu hemen bildir: arayüzün deposunda bir kayıt olmadan
      // yeniden çizim tetiklenmiyor.
      this.emitInputSignals();
      // `updateCwd` — duz atama DEGIL.
      //
      // Duz atama oturumun kendi alanini dolduruyordu ama `onCwd` cagrilmadigi
      // icin SEKMEYE hic ulasmiyordu. Sonuc: kabuk entegrasyonu olmayan bir
      // profilde (Ozel profil, entegrasyonu kapatilmis profil) `tab.cwd`
      // kalici olarak bos kaliyor ve "Klasoru ... ac" menu ogesi hic
      // gorunmuyordu - klasor belliyken.
      //
      // `result.cwd` kabugun GERCEKTEN basladigi dizin (Rust tarafi profil,
      // grup ve ev dizini sirasiyla cozuyor), yani entegrasyon bildirene kadar
      // dogru cevap bu.
      if (result.cwd) this.updateCwd(result.cwd);
    } catch (err) {
      this.term.write(
        `\r\n\x1b[31m${t("term.spawnFailed")}\x1b[0m ${String(err)}\r\n`,
      );
      this.exited = true;
      return;
    }
  }

  /**
   * Bu terminalin ekrandaki durumu.
   *
   * "Görünür" ve "odaklı" ayrı iki şey: bölme kipinde birden çok terminal
   * aynı anda görünür ama yalnızca biri odaklı olur.
   *
   * WebGL bağlamı GÖRÜNÜR olana veriliyor ve görünmez olunca GERİ
   * ALINMIYOR — tavan (`MAX_WEBGL`) zorlamadıkça kalıyor. Gerekçesi ve
   * ölçülen sayılar [`lib/webglLru.ts`](../lib/webglLru.ts) başında: bağlamı
   * odakla birlikte alıp vermek her sekme geçişinde İKİ oluşturucu kurulumu
   * ödetiyordu (biri DOM, biri WebGL) ve altı sekmeli bir pencerede geçiş
   * 50-84 ms sürüyordu.
   */
  setDisplay(visible: boolean, focused: boolean) {
    const wasVisible = this.visible;
    this.visible = visible;
    if (!visible) {
      // Bağlam BIRAKILMIYOR: geri dönülürse kurulum bedeli ödenmesin. Yalnızca
      // sırada geriye atılıyor, yeni bir istek gelirse ilk kurban bu olur.
      this.demoteWebgl();
      return;
    }
    this.requestWebgl();
    // Sekme gizliyken pencere yeniden boyutlanmis olabilir.
    this.invalidateGeometry();
    this.safeFit();
    if (focused) this.focusTerminal();
    /*
     * Gizliyken atlanan iki isi burada BIR KEZ yapiyoruz: katmanin yeniden
     * cizimi ve baglanti renklendirmesi. Yoksa sekmeye donuldugunde bloklar
     * bir sonraki ciktiya kadar eski yerinde kalirdi - komut bitmis, sekme
     * sessiz duruyorsa hic gelmeyebilir.
     */
    if (!wasVisible) {
      this.notifyBlocks();
      this.scheduleLinkHighlight();
    }
  }

  /** Görünür ve odaklı olmanın çakıştığı sekme kipi için kısayol. */
  setActive(active: boolean) {
    this.setDisplay(active, active);
  }

  /**
   * Terminale odağı verir - ama kullanıcı bir metin kutusuna yazıyorsa
   * dokunmaz.
   *
   * Bunu koşulsuz yapmak sekme adlandırmayı kullanılamaz hâle getiriyordu:
   * sekmeye çift tıklandığında adlandırma kutusu açılıyor, hemen ardından
   * (sekme ilk kez açılıyorsa kabuk başlatıldıktan sonra, asenkron olarak)
   * `setActive` terminale odaklanıyor, kutu `onBlur` ile kapanıp kaydediyordu.
   * Kuralın kendisi `lib/focus.ts` içinde: komut kutusu da aynısına uyuyor.
   */
  private focusTerminal() {
    if (typingOutsideTerminal()) return;
    this.term.focus();
  }

  /**
   * Bu terminale bağlam ver ve sırada öne al; tavan aşılırsa başkasını bırak.
   *
   * Sıralama mantığı saf ve ayrı modülde (`lib/webglLru.ts`); ölçülen hata ve
   * tavanın neden dört olduğu da orada.
   */
  private requestWebgl() {
    webglOrder = lruTouch(webglOrder, this);
    this.enableWebgl();
    for (const kurban of lruEvictions(webglOrder, MAX_WEBGL, this, (s) => s.visible)) {
      kurban.disableWebgl();
    }
  }

  /** Görünmez oldu: bağlamı KORU ama sırada ilk düşecek yere al. */
  private demoteWebgl() {
    webglOrder = lruDemote(webglOrder, this);
  }

  private enableWebgl() {
    if (this.webgl || !this.container) return;
    try {
      const addon = new WebglAddon();
      // Bağlam kaybında (GPU sürücü sıfırlaması, çok fazla bağlam) sessizce
      // DOM oluşturucuya dönüyoruz; terminal çalışmaya devam etsin.
      addon.onContextLoss(() => {
        addon.dispose();
        if (this.webgl === addon) {
          this.webgl = null;
          // Sıradan da düş: bağlamı olmayan bir oturumu tavana saymak, gerçek
          // bağlam sayısını olduğundan yüksek gösterip başkasını boşuna
          // düşürürdü.
          webglOrder = lruDrop(webglOrder, this);
        }
      });
      this.term.loadAddon(addon);
      this.webgl = addon;
    } catch {
      this.webgl = null;
      webglOrder = lruDrop(webglOrder, this);
    }
  }

  private disableWebgl() {
    // Sıradan düşürme KOŞULSUZ: bağlam zaten yoksa bile referansı bırakmak
    // gerekiyor, yoksa kapanmış oturumlar modül düzeyindeki dizide birikir.
    webglOrder = lruDrop(webglOrder, this);
    if (!this.webgl) return;
    try {
      this.webgl.dispose();
    } catch {
      /* yoksay */
    }
    this.webgl = null;
  }

  applySettings(settings: Settings) {
    this.settings = settings;
    this.term.options.fontFamily = settings.appearance.fontFamily;
    this.term.options.fontSize = settings.appearance.fontSize;
    this.term.options.lineHeight = settings.appearance.lineHeight;
    this.term.options.letterSpacing = settings.appearance.letterSpacing;
    this.term.options.cursorStyle = settings.appearance.cursorStyle;
    this.term.options.cursorBlink = settings.appearance.cursorBlink;
    this.term.options.scrollback = settings.appearance.scrollback;
    // Tema ve imleç TEK YERDEN: burada `theme.xterm`i doğrudan yazmak, uygulama
    // komut satırı açıkken gizlenmiş imleci geri getiriyordu.
    this.applyCursorVisibility();
    // Yazi tipi, boyut ve satir araligi hucre olcusunu degistiriyor.
    this.invalidateGeometry();
    this.safeFit();
    this.syncCellHeight();
    // Kaydedilecek satir sayisi degismis olabilir: diskteki kopya artik
    // ayarla ortusmuyor.
    this.outputSinceSave = true;
    // Vurgu rengi temayla degisiyor ve renklendirme kapatilabiliyor: ikisi de
    // mevcut dekorasyonlari gecersiz kiliyor.
    this.clearLinkDecorations();
    this.scheduleLinkHighlight();
  }

  /**
   * Teşhis sayaçları: bu terminalin taşıdığı biriken durum.
   *
   * Neden bu dört sayı: donma araştırmasında (bkz. `lib/health.ts`) iş yükü
   * hipotezleri ölçümle elendi, geriye BİRİKEN DURUM kaldı. Aşağıdakilerin
   * hepsi kare başına ya da kaydırma başına iş üretiyor ve zamanla büyüyor;
   * hangisinin büyüdüğünü görmeden doğru yeri aramak tahmindir.
   *
   * `markers` xterm'de deneysel ama okuması bedava ve tam olarak aradığımız
   * şey: dekorasyonlar ve bloklar buna bağlı yaşıyor, sızıntı olursa burada
   * görünür.
   */
  healthCounters(): {
    bufferLines: number;
    markers: number;
    decorations: number;
    blocks: number;
    visible: boolean;
    webgl: boolean;
  } {
    return {
      bufferLines: this.term.buffer.active.length,
      markers: this.term.markers.length,
      decorations: this.linkDecorations.length,
      blocks: this.blocks.length,
      visible: this.visible,
      webgl: this.webgl !== null,
    };
  }

  /** Diske yazılacak ekran çıktısı. */
  serialize(): string {
    try {
      return this.serializer.serialize({
        scrollback: this.settings.behavior.scrollbackSaveLines,
      });
    } catch {
      return "";
    }
  }

  fitNow() {
    this.safeFit();
  }

  /**
   * İmlecin bulunduğu satırın ekrandaki yeri (görünüm koordinatları).
   *
   * Öneri listesi buna göre konumlanıyor. Neden gerekli: liste eskiden ızgarada
   * ayrı bir satırdı ve yüksekliği öneri sayısıyla değişiyordu; her değişim
   * terminal alanını küçültüp büyütüyor, `ResizeObserver` `fit()` çağırıyor ve
   * kabuk istemi yeniden çiziyordu. Kullanıcının gördüğü titreme buydu —
   * terminal hücresi ~17px, öneri satırı ~24px olduğu için tek bir önerinin
   * eklenmesi bile ekranı bir iki satır kaydırıyordu.
   *
   * Liste artık yüzüyor ve terminale hiç dokunmuyor; nereye konduğunu
   * `lib/anchor.ts` belirliyor.
   *
   * Hücre yüksekliği `.xterm-screen`den ölçülüyor, xterm'in iç
   * `_renderService`inden değil: o özel bir alan ve sürümle birlikte sessizce
   * değişiyor. Ekran yüksekliğini satır sayısına bölmek aynı sonucu veriyor ve
   * herkese açık.
   */
  cursorAnchor(): {
    top: number;
    left: number;
    width: number;
    bottom: number;
    cellHeight: number;
  } | null {
    if (!this.container) return null;
    const screen = this.container.querySelector<HTMLElement>(".xterm-screen");
    if (!screen || this.term.rows < 1) return null;

    const rect = screen.getBoundingClientRect();
    if (rect.height < 1) return null;
    const cellHeight = rect.height / this.term.rows;

    // İki AYRI dikdörtgen, bilinçli:
    //
    //  - satır hesabı ekran dikdörtgeninden (`.xterm-screen`): imlecin hangi
    //    piksele denk geldiğini yalnızca o biliyor.
    //  - panelin genişliği ve dibi KAPSAYICIDAN: `.xterm` ögesinin 8-10px
    //    dolgusu var ve ekran dikdörtgeni o kadar içeride. Paneli ona
    //    dayadığımızda kenarlardan boşluk kalıyor, kutu da "yüzen bir ipucu"
    //    gibi görünüyordu. İstenen bunun tersi: kenardan kenara bir şerit.
    const hostRect = this.container.getBoundingClientRect();

    // `cursorY` görünüme göre (0..rows-1), kaydırmadan bağımsız.
    const row = Math.min(Math.max(this.term.buffer.active.cursorY, 0), this.term.rows - 1);
    return {
      top: rect.top + row * cellHeight,
      left: hostRect.left,
      width: hostRect.width,
      // Listenin sabit durdugu yer: terminal alaninin dibi.
      bottom: hostRect.bottom,
      cellHeight,
    };
  }

  /**
   * Bir terminal satırının yüksekliğini kapsayıcıya CSS değişkeni olarak yazar.
   *
   * Komut satırının ÜSTÜNDEKİ ayırıcı çizgi buna dayanıyor: istem dipteyken
   * girdi alanı her zaman son satır, yani çizginin yeri "dip eksi bir satır".
   * CSS bunu tek başına bilemiyor — satır yüksekliği yazı tipine, boyuta ve
   * satır aralığı ayarına bağlı.
   *
   * Neden CSS değişkeni ve her tuş vuruşunda değil: çizginin yeri yalnızca
   * ölçü değişince (pencere boyutu, yazı tipi) değişiyor. İmleci izleseydik
   * her karakterde yeniden konumlandırma gerekirdi ve çizgi geriden gelirdi.
   */
  // ------------------------------------------------------------ komut blokları

  /**
   * Yeni istemde blok açar.
   *
   * İşaretçi İMLECE GÖRE kaydediliyor (`registerMarker(0)`), yani "istem
   * satırı burası". Bir önceki bloğun sonu ayrıca işaretlenmiyor: sonu, bu
   * bloğun bir üst satırı.
   */
  private openBlock() {
    const marker = this.term.registerMarker(0);
    if (!marker) return;

    this.blockSeq += 1;
    this.blocks.push({
      id: `${this.tabId}:${this.blockSeq}`,
      marker,
      command: null,
      cwd: this.cwd,
      exitCode: null,
      durationMs: null,
      running: false,
    });

    // Sınırı aşanları at ve işaretçilerini bırak: her işaretçi xterm'de
    // güncellenmeye devam ediyor, birikmesi bedava değil.
    while (this.blocks.length > MAX_BLOCKS) {
      const dropped = this.blocks.shift();
      dropped?.marker.dispose();
    }
    this.notifyBlocks();
  }

  private markBlockRunning(command: string | null) {
    const block = this.blocks[this.blocks.length - 1];
    if (!block) return;
    block.command = command?.trim() || null;
    block.running = true;
    this.notifyBlocks();
  }

  private closeBlock(exitCode: number | null) {
    const block = this.blocks[this.blocks.length - 1];
    if (!block || !block.running) return;
    block.running = false;
    block.exitCode = exitCode;
    block.durationMs = this.durationOverride ?? Date.now() - this.activeStartedAt;
    this.notifyBlocks();
  }

  /**
   * Katmanın çizeceği blok listesi.
   *
   * Bir bloğun SONU burada hesaplanıyor: bir sonrakinin başlangıcının bir
   * üstü. Son blok açık (`null`) — orada henüz bir sonraki istem yok.
   *
   * Komutu olmayan bloklar ELENİYOR. Boş satırda Enter'a basmak da bir istem
   * üretiyor; onlara şerit çizmek ekranı bölünmüş gösterir, oysa gösterilecek
   * bir şey yok.
   */
  snapshotBlocks(): BlockView[] {
    const canli = this.blocks.filter((b) => !b.marker.isDisposed);
    const out: BlockView[] = [];
    for (let i = 0; i < canli.length; i++) {
      const block = canli[i];
      /*
       * Komutu olmayan bloklar ELENİYOR.
       *
       * Boş satırda Enter'a basmak da bir istem üretiyor; onlara şerit ve
       * başlık çizmek ekranı boş rozetlerle doldururdu.
       *
       * Bir ara bekleyen istem (sonuncusu) hariç tutuluyordu: başlığı orada
       * çizmek kabuğun boş bıraktığı satırı anlamlı kılıyordu. Dizin ve dal
       * rozetleri terminalin dışındaki bağlam şeridine taşınınca gerek kalmadı
       * — üstelik orada komut çalışırken de görünüyorlar.
       */
      if (!block.command) continue;
      const next = canli[i + 1];
      const endLine = next ? next.marker.line - 1 : null;

      const view: BlockView = {
        id: block.id,
        startLine: block.marker.line,
        endLine,
        command: block.command,
        cwd: block.cwd,
        exitCode: block.exitCode,
        durationMs: block.durationMs,
        running: block.running,
      };

      out.push(view);
    }
    return out;
  }

  /**
   * Katmanın hizalanması için gereken ölçüler — KAPSAYICIYA göre.
   *
   * `.xterm` ögesinin dolgusu var, yani ilk satır kapsayıcının tepesinde
   * başlamıyor. Katman bunu bilmezse bütün bloklar birkaç piksel yukarıda
   * çizilir; hata küçük ama şerit satırla hizalanmadığı için gözle hemen
   * yakalanıyor.
   */
  /** Başlık çizilebilir mi: kabuk boş satır bıraktığını bildirdi mi. */
  hasBlockHeaders(): boolean {
    return this.blockHeaderMode;
  }

  blockGeometry(): {
    top: number;
    left: number;
    width: number;
    cellHeight: number;
    viewportTop: number;
    rows: number;
  } | null {
    const host = this.container;
    if (!host) return null;
    if (this.geometry) {
      return {
        ...this.geometry,
        viewportTop: this.term.buffer.active.viewportY,
        rows: this.term.rows,
      };
    }
    const screen = host.querySelector<HTMLElement>(".xterm-screen");
    if (!screen || this.term.rows < 1) return null;

    const hostRect = host.getBoundingClientRect();
    const rect = screen.getBoundingClientRect();
    if (rect.height < 1) return null;

    /*
     * DİKEY ölçü ekran dikdörtgeninden, YATAY ölçü kapsayıcıdan.
     *
     * Satır hizası ekrana bağlı: bir bloğun kaçıncı pikselde başladığını
     * yalnızca `.xterm-screen` biliyor. Yatayda ise katman terminalin
     * TAMAMINI kaplıyor, çünkü çizdiği şeylerin bir kısmı metnin dışında:
     * durum şeridi `.xterm` ögesinin sol dolgusunun içinde duruyor.
     *
     * ÖLÇÜLEN HATA: yatayda da ekran dikdörtgeni kullanılıyordu, yani katman
     * 20px içeriden başlıyordu ve şerit 8px'lik kendi payıyla 28px'e düşüyor,
     * metnin üstüne biniyordu. Kapsayıcıdan ölçünce şeridin 8px'i gerçek 8px.
     */
    this.geometry = {
      top: rect.top - hostRect.top,
      left: 0,
      width: hostRect.width,
      cellHeight: rect.height / this.term.rows,
    };
    return {
      ...this.geometry,
      viewportTop: this.term.buffer.active.viewportY,
      rows: this.term.rows,
    };
  }

  /** Olcu degisti: geometri bir sonraki okumada yeniden olculecek. */
  private invalidateGeometry() {
    this.geometry = null;
  }

  /** Son kaydetmeden bu yana yeni cikti geldi mi (bkz. `flushAllState`). */
  hasUnsavedOutput(): boolean {
    return this.outputSinceSave;
  }

  /** Ekran ciktisi diske yazildi. */
  markOutputSaved() {
    this.outputSinceSave = false;
  }

  /**
   * Blokta gösterilecek bir şey var mı (`clear` sonrası boş kalmış olabilir).
   *
   * BURADA ve tek tek soruluyor, `snapshotBlocks` içinde topluca DEĞİL.
   *
   * ÖLÇÜLEN SORUN: kurulu sürümde uygulama "donarak hareket ediyor" ve sekme
   * geçişinde takılıyordu. Sebep buydu: denetim bütün bloklar için (yüz taneye
   * kadar) ve HER ÇİZİMDE koşuyordu — çıktı akarken çizim kare başına bir kez
   * tetikleniyor, yani saniyede binlerce satır okuması.
   *
   * Katman yalnızca GÖRÜNEN blokları çiziyor (bkz. `blockRect`); denetimi de
   * oraya taşımak işi bir avuç bloğa indiriyor. Görünmeyen bir bloğun boş olup
   * olmadığı zaten hiçbir şeyi değiştirmiyor.
   */
  blockHasContent(block: BlockView): boolean {
    return hasVisibleContent(block, (from, to) => this.readBlockText(from, to));
  }

  /** Bloğun kapsadığı satırların düz metni (çıktıyı kopyalamak için). */
  readBlockText(startLine: number, endLine: number | null): string {
    const buf = this.term.buffer.active;
    const son = endLine ?? buf.viewportY + this.term.rows - 1;
    const satirlar: string[] = [];
    for (let y = startLine; y <= son; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      satirlar.push(line.translateToString(true));
    }
    // Sondaki boş satırlar kopyalanan metne değer katmıyor.
    while (satirlar.length && !satirlar[satirlar.length - 1].trim()) satirlar.pop();
    return satirlar.join("\n");
  }

  /**
   * Katmanı yeniden çizdirir — kare başına en fazla bir kez.
   *
   * `onRender` çıktı akarken saniyede onlarca kez tetikleniyor. Her seferinde
   * React'i çalıştırmak katmanı terminalden daha pahalı hâle getirirdi.
   */
  private scheduleBlockSync() {
    // Gizli sekmenin katmanini kare basina yeniden cizmek bos is; sekme
    // gorunur olunca `setDisplay` bir kez tazeliyor.
    if (!this.visible) return;
    if (this.blockSyncFrame !== null) return;
    this.blockSyncFrame = window.requestAnimationFrame(() => {
      this.blockSyncFrame = null;
      this.blockListener?.();
    });
  }

  private notifyBlocks() {
    this.blockListener?.();
  }

  /**
   * Çalışan komutun çıktısındaki sunucu adreslerini toplar.
   *
   * Neden AKAN VERİDEN, ekrandan değil: adres bir kez, en başta yazılıyor ve
   * loglar aktıkça yukarı süzülüyor; uzun süren bir işte kaydırma geçmişinden
   * büsbütün düşüyor. Ekranı taramak onu bulamaz — geçtiği anda yakalamak
   * gerekiyor.
   *
   * Yalnızca komut ÇALIŞIRKEN: istemde bekleyen kabuğun çıktısında sunucu
   * adresi aramak anlamsız, üstelik orada yazdığınız her şeyin yankısı var.
   */
  /**
   * Çalışan komutun sunucu adresleri — ANLIK.
   *
   * ÖLÇÜLEN BELİRTİ: `ng serve` durdurulup yeniden çalıştırıldığında eski
   * portun rozeti duruyor, tıklayınca yanlış yere gidiyordu. Arayüz depodaki
   * KOPYAYA bakıyordu ve o kopya bir olayla yazılıyor; olayı kaçıran ya da
   * sıralaması bozulan tek bir yol kopyayı kalıcı olarak eski bırakıyordu.
   *
   * Girdi sinyallerinde aynı hata çıkmıştı ve çözümü aynı: doğruyu her çizimde
   * buradan okumak. Depodaki kopya yalnızca yeniden çizimi tetikliyor.
   */
  runUrls(): string[] {
    // Komut çalışmıyorsa gösterilecek adres de yok. Rozet zaten `running`
    // bayrağına bakıyor ama doğruyu iki yerde tutmamak için burada da
    // kesiliyor: liste bir yolda temizlenmeden kalsa bile dışarı sızmıyor.
    if (!this.running) return [];
    return [...this.serverUrls];
  }

  /**
   * Görünüm gerçekten en altta mı.
   *
   * `viewportY` görünümün tampondaki yeri, `baseY` ise en alta kaydırılmış
   * hâlin yeri. İkisi eşitse kullanıcı canlı çıktıya bakıyor demek.
   */
  private readAtBottom(): boolean {
    const buf = this.term.buffer.active;
    return buf.viewportY >= buf.baseY;
  }

  /** En alta iner. "Aşağı in" düğmesi bunu çağırıyor. */
  scrollToBottom() {
    this.term.scrollToBottom();
    this.syncScrollState();
  }

  /** Kaydırma durumu değiştiyse arayüze bildirir. */
  private syncScrollState() {
    const now = this.readAtBottom();
    if (now === this.atBottom) return;
    this.atBottom = now;
    this.callbacks.onScrollState?.(now);
  }

  /**
   * Geri yükleme ayıracının bulunduğu MUTLAK tampon satırı; yoksa `null`.
   *
   * Katman bunu görünümün üstüyle (`viewportTop`) çıkarıp ekrandaki satırı
   * buluyor; kaydırmayla birlikte hareket etmesi böyle oluyor.
   */
  restoreDividerLine(): number | null {
    const line = this.restoreMarker?.line ?? -1;
    return line >= 0 ? line : null;
  }

  /** Adres listesini boşaltır ve arayüze bildirir. */
  private clearRunUrls() {
    this.serverUrls = [];
    /*
     * Liste BOŞ olsa bile bildiriliyor.
     *
     * Erken çıkış vardı ("zaten boş, kimseye söyleme") ve bir sızıntı yolu
     * açıyordu: arayüz doğruyu oturumdan okuyor ama YENİDEN ÇİZİM depodaki
     * kopyanın değişmesiyle tetikleniyor. Oturumun listesi boşalıp depo eski
     * kalırsa yeniden çizim hiç olmuyor ve ekranda eski rozet DURUYOR — veri
     * doğru, görüntü yanlış.
     */
    this.callbacks.onRunLinks?.([]);
  }

  /**
   * Çalışan komutun ÇIKTISINDA sunucu adresi arar — yalnızca YENİ satırlarda.
   *
   * ## Neden akan baytlar değil
   *
   * İlk hâli PTY'den gelen baytları tarıyordu ve yanlıştı. ÖLÇÜLEN BELİRTİ:
   * `ng serve` durdurulup yeniden çalıştırıldığında eski portun rozeti, henüz
   * onay verilmemişken geri geliyordu.
   *
   * Sebep ConPTY'nin YENİDEN ÇİZİMİ. Komut başlayınca komut kutusu "Durdur"
   * şeridine dönüşüyor, satır yüksekliği değişiyor, terminal yeniden
   * ölçülüyor ve ConPTY görünen ekranın TAMAMINI yeniden yayımlıyor. Ekranda
   * duran eski adres satırı ikinci kez akıştan geçiyor ve "yeni çıktı" gibi
   * görünüyor. Pencereyi yeniden boyutlandırmak da aynı şeyi yapıyor, yani
   * bayt taraması hiçbir yamayla doğru olamaz.
   *
   * Satır tabanlı tarama bunu yapısal olarak çözüyor: yeniden çizim VAR OLAN
   * satırları yeniden yazıyor, yeni satır EKLEMİYOR. İmleç ilerlemediyse
   * taranacak bir şey de yok.
   *
   * `scanLine` komut başlarken o anki satıra kuruluyor, yani bir komutun
   * çıktısı yalnızca kendi ürettiği satırlardan okunuyor.
   */
  /**
   * Çalışan komutun çıktısında sunucu adresi arar.
   *
   * Kural saf bir modülde ve GERÇEK BİR TERMINAL üzerinde testli
   * (`lib/serverScan.ts`, `lib/serverScan.test.ts`). Burada yalnızca xterm'in
   * o kurala verilmesi var.
   *
   * Uzun hikâye: bu iş önce akan baytları tarıyordu ve yanlıştı. ConPTY komut
   * başlayınca (komut kutusu "Durdur" şeridine dönüşüyor, terminal yeniden
   * ölçülüyor) görünen ekranın TAMAMINI yeniden yayımlıyor; ekranda duran eski
   * adres satırı ikinci kez akıştan geçip yeni komuta yazılıyordu. Satır
   * tabanlı tarama bunu yapısal olarak dışlıyor.
   */
  private scanNewLines() {
    const buf = this.term.buffer.active;

    /*
     * Çapa düştüyse YENİDEN kuruluyor.
     *
     * İşaretçi ancak komutun başladığı satır kaydırma geçmişinden büsbütün
     * atıldığında kapanıyor — yani çıktı bütün geçmişi doldurduğunda. O
     * noktada komutun başı zaten okunamaz durumda; çapayı imlece almak
     * taramanın DURMASINI engelliyor. Yeniden kurmasaydık uzun çıktıda
     * rozet sessizce ölürdü.
     */
    if (this.running && (!this.scanAnchor || this.scanAnchor.isDisposed)) {
      this.resetScanAnchor();
    }

    const out = scanForServerUrls(
      { scannedAhead: this.scannedAhead, urls: this.serverUrls },
      {
        baseY: buf.baseY,
        cursorY: buf.cursorY,
        readLine: (y) => buf.getLine(y)?.translateToString(true) ?? "",
        isWrapped: (y) => buf.getLine(y)?.isWrapped ?? false,
        anchorLine: this.scanAnchor && !this.scanAnchor.isDisposed ? this.scanAnchor.line : -1,
        running: this.running,
        altScreen: buf.type === "alternate",
      },
      { maxUrls: RUN_URL_LIMIT, maxLines: MAX_SCAN_LINES },
    );

    this.scannedAhead = out.state.scannedAhead;
    this.serverUrls = out.state.urls;
    if (out.changed) this.callbacks.onRunLinks?.([...this.serverUrls]);
  }

  /** Çapayı imlecin bulunduğu satıra kurar ve sayacı sıfırlar. */
  private resetScanAnchor() {
    this.scanAnchor?.dispose();
    // `registerMarker(0)` imleç satırını işaretliyor: komutun çıktısı tam
    // oradan başlıyor. İmleç satırı aralığa DA giriyor (bkz. `scanForServerUrls`).
    this.scanAnchor = this.term.registerMarker(0) ?? null;
    this.scannedAhead = 0;
  }

  /** İstem durumu değiştiyse arayüze bildirir. */
  private setAtPrompt(value: boolean) {
    if (this.atPrompt === value) return;
    this.atPrompt = value;
    this.emitInputSignals();
  }

  /**
   * Girdi kipini belirleyen ANLIK sinyaller.
   *
   * Arayüz bunu doğrudan okuyor; depodaki kopya yalnızca yeniden çizimi
   * tetiklemek için var.
   *
   * ÖLÇÜLEN HATA: kip tek seferlik bir olaya güveniyordu. Olay kaçtığında ya da
   * durum bilinmeden önce geldiğinde (`integration` henüz atanmamışken) depo
   * eski bilgiyle kalıyor ve bir daha güncellenmiyordu — çünkü sonraki emisyon
   * ancak bir DEĞİŞİM olunca geliyor. Sonuç: komut kutusu hiç açılmıyor,
   * sekmeyi yeniden başlatmak düzeltiyor. Doğruyu her çizimde buradan okumak o
   * sınıfın tamamını kapatıyor.
   *
   * `altScreen` de burada TÜRETİLİYOR, saklanmıyor: `onBufferChange` kaçarsa
   * (ya da geri yüklenen ekran çıktısı tamponu bir an ikincil kipe soksa)
   * saklanan bayrak kalıcı olarak yanlış kalıyordu.
   */
  inputSignals(): { atPrompt: boolean; altScreen: boolean; integration: boolean } {
    return {
      atPrompt: this.atPrompt,
      altScreen: this.term.buffer.active.type === "alternate",
      integration: this.integration,
    };
  }

  private emitInputSignals() {
    this.callbacks.onInputSignals?.(this.inputSignals());
  }

  /**
   * Uygulama kipi: tuşlar terminale değil, arayüzdeki kutuya gidiyor.
   *
   * `disableStdin` ŞART. Odak yalnızca kutuda diye varsaymak yetmiyor:
   * kullanıcı metin seçmek için terminale tıkladığında odak oraya geçiyor ve
   * o andan sonra yazdığı her şey İKİ yoldan birden kabuğa ulaşırdı — hem
   * kutudan hem xterm'den. Bayrak veri yolunu tek kapıya indiriyor.
   */
  setAppInput(active: boolean) {
    if (this.term.options.disableStdin === active) return;
    this.term.options.disableStdin = active;

    /*
     * İmleç de gizleniyor — üst alan artık YAZILAN bir yer değil.
     *
     * Ölçülen belirti: kutuya yazılırken terminalin dibinde bir imleç daha
     * yanıp sönüyordu. İki imleç "hangisi benim" sorusunu doğuruyor, üstelik
     * yukarıdaki asla yazı almıyor — orada `disableStdin` açık. Warp'ta üst
     * alan salt görüntü ve imleci yok.
     *
     * `cursorInactiveStyle: "none"` TEK BAŞINA yetmiyor: terminal odaktayken
     * imleç yine çiziliyor. `blur()` odağı da alıyor, ikisi birlikte alanı
     * gerçekten sessizleştiriyor.
     */
    this.appInputActive = active;
    this.applyCursorVisibility();
    if (active) this.term.blur();
  }

  /**
   * Üst alanda imleç görünsün mü?
   *
   * AYRI BİR YÖNTEM ve bu şart. İlk hâlinde kural `setAppInput` içindeydi ve
   * tema değiştirilince kayboluyordu: `applySettings` temayı olduğu gibi
   * yeniden yazıyor, imlecin gizlendiği rengi de silip götürüyordu. Belirti
   * sinsi — özellik çalışıyor, kullanıcı temayı değiştiriyor, imleç geri
   * geliyor ve sebebi görünmüyor. Kural tek yerde olunca iki çağıran da aynı
   * sonucu veriyor.
   *
   * `cursorInactiveStyle` TEK BAŞINA yetmiyor: terminal odaktayken imleç yine
   * çiziliyor. Tıklama xterm'e odağı veriyor → odaklı imleç çiziliyor →
   * `mouseup` odağı kutuya geri alıyor. Arada kalan kare gözle görülüyor.
   * İmleci arka plan rengine boyamak o kareyi de kapatıyor.
   */
  private applyCursorVisibility() {
    const gizli = this.appInputActive;
    const theme = getTheme(this.settings.appearance.theme);
    const bg = theme.xterm.background ?? "#000000";

    this.term.options.cursorInactiveStyle = gizli ? "none" : "outline";
    this.term.options.cursorBlink = gizli ? false : this.settings.appearance.cursorBlink;
    this.term.options.theme = gizli
      ? { ...theme.xterm, cursor: bg, cursorAccent: bg }
      : theme.xterm;
  }

  /** Kutudan gelen metni olduğu gibi kabuğa yazar. */
  sendKeys(data: string) {
    if (!data) return;
    void api.ptyWrite(this.tabId, data).catch(() => {});
  }

  private syncCellHeight() {
    const el = this.container;
    if (!el) return;
    const screen = el.querySelector<HTMLElement>(".xterm-screen");
    if (!screen || this.term.rows < 1) return;
    const height = screen.getBoundingClientRect().height / this.term.rows;
    if (height > 0) el.style.setProperty("--cell-h", `${height}px`);
  }

  private safeFit() {
    if (!this.container) return;
    // Sekme henüz düzenlenmemişse (0 boyut) fit hesabı NaN üretir.
    if (this.container.clientWidth < 2 || this.container.clientHeight < 2) return;
    try {
      const dims = this.fit.proposeDimensions();
      if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
      if (dims.cols === this.term.cols && dims.rows === this.term.rows) return;
      this.fit.fit();
      if (!this.exited && this.spawned) {
        void api.ptyResize(this.tabId, this.term.cols, this.term.rows).catch(() => {});
      }
    } catch {
      /* yoksay */
    }
  }

  // ------------------------------------------------- bağlantı renklendirmesi

  /**
   * Bağlantıları renklendirmeyi ertele.
   *
   * `onRender` yoğun çıktıda saniyede onlarca kez tetikleniyor; her seferinde
   * görünür satırları taramak gözle görülür bir maliyet. Bu pencere gecikmesi
   * fark edilmiyor ama işi bir kat azaltıyor.
   */
  private scheduleLinkHighlight() {
    // Gorunmeyen terminalde dekorasyon uretmek olculebilir bir maliyet:
    // gorunur satir sayisi kadar `translateToString` + dekorasyon yikip
    // yeniden kurma, 90ms'de bir.
    if (!this.visible) return;
    if (this.linkTimer !== null) return;
    this.linkTimer = window.setTimeout(() => {
      this.linkTimer = null;
      this.refreshLinkHighlight();
    }, LINK_HIGHLIGHT_DELAY);
  }

  /**
   * Dekorasyonları söker VE imzayı düşürür.
   *
   * İkisi ayrılamaz: imza "ekranda şu an ne boyalı" demek. Boyayı silip imzayı
   * bırakmak, bir sonraki tazelemenin "zaten boyalı" deyip atlaması ve
   * bağlantıların kalıcı olarak sönük kalması olurdu — tema değişimi ve
   * `highlightLinks` anahtarı tam olarak bu yoldan geçiyor
   * (bkz. `applySettings`).
   */
  private clearLinkDecorations() {
    for (const item of this.linkDecorations) item.dispose();
    this.linkDecorations = [];
    this.linkSignature = null;
  }

  /**
   * Görünür satırlardaki bağlantıları vurgu renginde boyar.
   *
   * Neden yalnızca görünür satırlar: dekorasyon bir imlece (marker) bağlı ve
   * imleç tampon satırıyla yaşıyor. On binlerce satırlık kaydırma tamponunun
   * tamamına dekorasyon kaydetmek belleği ve çizimi boğar. Görünür pencere
   * kaydırmayla birlikte yeniden hesaplanıyor.
   *
   * Neden iki aşamalı tarama: hücre hücre okumak pahalı (satır × sütun). Önce
   * `translateToString` ile hızlı bir eleme yapıp yalnızca aday satırlarda
   * hücrelere iniyoruz — tipik çıktıda satırların çoğunda bağlantı yok.
   *
   * ## Neden imza: bu yöntem KENDİ KENDİNİ çağırıyordu
   *
   * ÖLÇÜLEN BELİRTİ: ekranda tek bir adres duran bir sekme, HİÇ çıktı
   * gelmezken bile bir çekirdeği doldurmaya yetiyordu (WebContent süreci
   * %100, dokuz saatte 6,5 dakika CPU). Pencere örtülünce sıfıra iniyordu —
   * çizime bağlı bir döngünün imzası.
   *
   * ZİNCİR: xterm dekorasyon eklenince VE silinince tam yenileme yapıyor
   * (`RenderService`: `onDecorationRegistered`/`onDecorationRemoved` →
   * `_fullRefresh`). Bu yöntem ise her seferinde önce hepsini silip yeniden
   * kuruyordu. Yani: `onRender` → 90 ms → sil+kur → tam yenileme →
   * `onRender` → … Ekranda bir adres olduğu sürece durmuyor. Ölçüldü:
   * saniyede ~9 tur. Her turun bedeli yalnızca tarama değil; WebGL'in tam
   * kare çizimi, dekorasyon DOM'unun yıkılıp kurulması ve WebKit'in bileşik
   * katman ağacını yeniden kurması.
   *
   * Kırılma noktası şu: bir adresin nereye boyanacağı yalnızca SATIRIN METNİ
   * ve satırın hangi tampon satırı olduğuyla belirli. İkisi de aynıysa
   * ekranda duran boya zaten doğru; silip yeniden kurmak aynı sonucu üretip
   * bir tur daha başlatmaktan başka bir şey yapmıyor. İmza eşleşince
   * dekorasyonlara HİÇ dokunulmuyor, tam yenileme olmuyor ve döngü ikinci
   * turda sönüyor.
   *
   * Kaydırma imzayı bilerek bozmuyor: dekorasyon işaretçiye bağlı ve
   * işaretçi tampon satırıyla birlikte hareket ediyor, yani görünümün içinde
   * kayan bir adres kendiliğinden doğru yerde kalıyor. Görünüme YENİ giren ya
   * da çıkan satır ise imzayı değiştiriyor (mutlak satır numarası imzada).
   */
  private refreshLinkHighlight() {
    if (!this.settings.appearance.highlightLinks) {
      this.clearLinkDecorations();
      return;
    }

    const buffer = this.term.buffer.active;
    /*
     * Aday satırlar ve imza AYNI taramadan çıkıyor.
     *
     * İmzaya giren `translateToString` çıktısı zaten hızlı elemenin okuduğu
     * metin; ikinci bir okuma yok. Tampon türü de imzada: ikincil ekrana
     * (vim, less) geçmek görünen her şeyi değiştiriyor.
     */
    const adaylar: { absolute: number; line: IBufferLine }[] = [];
    const parcalar: string[] = [buffer.type];

    for (let row = 0; row < this.term.rows; row++) {
      const absolute = buffer.viewportY + row;
      const line = buffer.getLine(absolute);
      if (!line) continue;

      const quick = line.translateToString(true);
      if (!quick.includes("://") && !quick.toLowerCase().includes("www.")) continue;

      adaylar.push({ absolute, line });
      parcalar.push(`${absolute}:${quick}`);
    }

    const imza = parcalar.join("\n");
    // Ekrandaki boya zaten bu imzanın karşılığı: dokunma. Döngü burada
    // kırılıyor.
    if (imza === this.linkSignature) return;

    this.clearLinkDecorations();

    const theme = getTheme(this.settings.appearance.theme);
    // Dekorasyon yalnızca `#RRGGBB` kabul ediyor; tema renkleri bu biçimde.
    const color = theme.ui.accent;
    // registerMarker imleç satırına GÖRE çalışıyor; hedef satırı ona çeviriyoruz.
    const anchorLine = buffer.baseY + buffer.cursorY;

    for (const { absolute, line } of adaylar) {
      const cells: CellLike[] = [];
      let probe = undefined as ReturnType<typeof line.getCell>;
      for (let x = 0; x < line.length; x++) {
        probe = line.getCell(x, probe);
        cells.push({ chars: probe?.getChars() ?? "", width: probe?.getWidth() ?? 1 });
      }

      const ranges = linkCellRanges(cells);
      if (ranges.length === 0) continue;

      const marker = this.term.registerMarker(absolute - anchorLine);
      if (!marker) continue;
      this.linkDecorations.push(marker);

      for (const range of ranges) {
        const decoration = this.term.registerDecoration({
          marker,
          x: range.x,
          width: range.width,
          foregroundColor: color,
          // 'bottom': seçimin ALTINDA çiziliyor, böylece metni seçtiğinizde
          // seçim vurgusu okunur kalıyor.
          layer: "bottom",
        });
        if (decoration) this.linkDecorations.push(decoration);
      }
    }

    // İmza EN SONDA yazılıyor: `clearLinkDecorations` onu `null`a çekiyor ve
    // aradaki her erken çıkış imzasız kalmalı.
    this.linkSignature = imza;
  }

  async dispose(killShell: boolean) {
    if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
    // Yarım kalmış bir komut varsa geçmişte "çalışıyor" olarak asılı kalmasın.
    if (this.activeHistoryId) {
      void api
        .historyFinish(this.activeHistoryId, null, Date.now() - this.activeStartedAt)
        .catch(() => {});
      this.activeHistoryId = null;
    }
    for (const un of this.unlisteners) {
      try {
        un();
      } catch {
        /* yoksay */
      }
    }
    this.unlisteners = [];
    if (this.linkTimer !== null) window.clearTimeout(this.linkTimer);
    this.linkTimer = null;
    if (this.inputTimer !== null) window.clearTimeout(this.inputTimer);
    this.inputTimer = null;
    this.clearLinkDecorations();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.disableWebgl();
    if (killShell) {
      await api.ptyKill(this.tabId).catch(() => {});
    }
    this.term.dispose();
  }

  // -------------------------------------------------------------- olay bağlama

  private registerHandlers() {
    this.disposables.push(
      this.term.onData((data) => this.handleInput(data)),
      this.term.onBinary((data) => {
        void api.ptyWrite(this.tabId, data).catch(() => {});
      }),
      /*
       * Başlık DEĞİŞMEDİYSE bildirilmiyor.
       *
       * Kabuklar başlığı çoğu zaman her istemde yeniden yazıyor (oh-my-zsh,
       * powerlevel10k, starship `precmd`de kuruyor) ve xterm her OSC 0/2 için
       * bu olayı tetikliyor — metin aynı olsa bile.
       *
       * Korumasızken her istem `updateTab`e, o da `set({groups})`e çıkıyordu:
       * `map` yeni bir dizi ve yeni bir grup nesnesi ürettiği için `groups`un
       * KİMLİĞİ değişiyor, `App` ve altındaki bütün ağaç yeniden çiziliyor,
       * `TerminalArea` de her oturum için `setDisplay` koşturuyordu. Ekranda
       * hiçbir şey değişmediği hâlde.
       *
       * Aynı koruma `updateCwd` içinde ZATEN vardı; burada eksikti.
       */
      this.term.onTitleChange((title) => {
        if (title === this.title) return;
        this.title = title;
        this.callbacks.onTitle?.(title);
      }),
      this.term.onBell(() => this.callbacks.onBell?.()),
      // İkincil ekran tamponu: vim, less, htop. Girdi kipi buna bakıyor —
      // entegrasyon sinyali gecikse bile tam ekran program yakalanmalı.
      this.term.buffer.onBufferChange(() => {
        // Değer `inputSignals()` içinde türetiliyor; burada yalnızca değişimi
        // haber veriyoruz.
        const alt = this.term.buffer.active.type === "alternate";
        if (alt === this.altScreen) return;
        this.altScreen = alt;
        this.emitInputSignals();
      }),
      this.term.onSelectionChange(() => this.handleSelectionChange()),
      // Bağlantı renklendirmesi görünür satırlara bakıyor; hem yeni çıktı
      // hem kaydırma görünür satırları değiştiriyor.
      this.term.onRender(() => {
        this.scheduleLinkHighlight();
        this.scheduleBlockSync();
        // Yeni çıktı da tabanı aşağı itiyor: kullanıcı kaydırmadan da "en
        // altta değil" hâline geçilebiliyor.
        this.syncScrollState();
      }),
      this.term.onScroll(() => {
        this.scheduleLinkHighlight();
        this.scheduleBlockSync();
        this.syncScrollState();
      }),
    );

    // OSC 133: anlamsal istem işaretleri (prompt / komut / çıkış kodu)
    this.disposables.push(
      this.term.parser.registerOscHandler(133, (payload) => {
        this.handleOsc133(payload);
        return true;
      }),
    );
    // OSC 633: VS Code'un yerleştirdiği sözleşme - komut metni ve dizin
    this.disposables.push(
      this.term.parser.registerOscHandler(633, (payload) => {
        this.handleOsc633(payload);
        return true;
      }),
    );
    // OSC 7: standart "çalışma dizini bildirimi"
    this.disposables.push(
      this.term.parser.registerOscHandler(7, (payload) => {
        const cwd = cwdFromFileUri(payload);
        if (cwd) this.updateCwd(cwd);
        return true;
      }),
    );
  }

  private handleInput(data: string) {
    if (this.exited) {
      // Kabuk bittiyse Enter'a basmak sekmeyi yeniden başlatmasın; sessizce yut.
      return;
    }

    // İşaretimiz yoksa (entegrasyonsuz kabuk) ilk yazılan karakterde imleci
    // işaretle: komut metnini ekran tamponundan okuyabilmek için gerekli.
    if (!this.promptEndMark && !this.running && data.length > 0 && data >= " ") {
      this.promptEndMark = this.currentMark();
    }

    if (data.includes("\r")) {
      // Enter anında tampon hâlâ yazılan satırı gösteriyor - kabuk henüz yeni
      // satır yansıtmadı. Komut metnini tam bu anda okuyoruz; böylece yön
      // tuşlarıyla düzenleme, sekme tamamlama, geçmişten çağırma hepsi doğru
      // metni verir (tuş vuruşlarını saymak bunların hiçbirinde çalışmaz).
      const text = this.readCommandFromBuffer();
      this.enterSnapshot = text.trim().length > 0 ? text.trim() : null;
      this.scheduleFallback();
    }

    void api.ptyWrite(this.tabId, data).catch(() => {});

    // Enter'da öneri anlamsız: satır kabuğa gitti.
    if (data.includes("\r")) this.notifyInput({ prefix: "", full: "", hintTail: false });
    else this.scheduleInputNotify();
  }

  // ------------------------------------------------------ komut önerisi

  private notifyInput(state: { prefix: string; full: string; hintTail: boolean }) {
    if (this.inputTimer !== null) {
      window.clearTimeout(this.inputTimer);
      this.inputTimer = null;
    }
    this.callbacks.onInput?.(state);
  }

  private scheduleInputNotify() {
    if (this.inputTimer !== null) return;
    this.inputTimer = window.setTimeout(() => {
      this.inputTimer = null;
      this.callbacks.onInput?.(this.readInputState());
    }, INPUT_NOTIFY_DELAY);
  }

  /**
   * İstem satırında yazılmakta olan metin.
   *
   * `prefix` imlece kadar, `full` satırın sonuna kadar. İkisi ayrı çünkü
   * öneri ön eke göre üretiliyor ama kabul etmek satırın tamamını
   * değiştiriyor: imleç ortadaysa öneri gösterilmemeli (bkz. canSuggest).
   */
  readInputState(): { prefix: string; full: string; hintTail: boolean } {
    const mark = this.promptEndMark;
    // Komut çalışırken istem yok: okunacak bir girdi de yok.
    if (!mark || this.running || this.exited) {
      return { prefix: "", full: "", hintTail: false };
    }

    const buf = this.term.buffer.active;
    const endY = buf.baseY + buf.cursorY;
    if (endY < mark.y) return { prefix: "", full: "", hintTail: false };

    let prefix = "";
    let full = "";
    for (let y = mark.y; y <= endY; y++) {
      const line = buf.getLine(y);
      if (!line) break;
      const start = y === mark.y ? mark.x : 0;
      if (y === endY) {
        prefix += line.translateToString(false, start, buf.cursorX);
        full += line.translateToString(true, start);
      } else {
        // Aradaki satırlar kaydırma nedeniyle tam genişlikte; kırpılmamalı.
        const whole = line.translateToString(false, start);
        prefix += whole;
        full += whole;
      }
    }
    return { prefix, full, hintTail: this.tailLooksLikeHint(endY, buf.cursorX) };
  }

  /**
   * İmlecin sağındaki metin kabuğun KENDİ satır içi önerisi mi?
   *
   * Neden gerekiyor: zsh-autosuggestions (ve PSReadLine'ın InlineView'ı) o
   * öneriyi gerçek metin gibi ekrana yazıyor. Ekrandan okuduğumuzda
   * kullanıcının yazdığından ayırt edilemiyor ve "imleç satırın ortasında"
   * sanılıyor — sonuç olarak kabuk hayalet metin gösterdiği her an bizim
   * listemiz kapanıyordu.
   *
   * Ayırt eden şey RENK: hayalet metin soluk / varsayılan olmayan bir ön
   * renkle çiziliyor (zsh-autosuggestions varsayılanı `fg=8`), kullanıcının
   * yazdığı metin ise varsayılan renkte. Bu bir sezgi, kesin bir işaret değil:
   * satırını `zsh-syntax-highlighting` ile renklendiren birinde imleç gerçekten
   * ortadayken de doğru dönebilir. Bedeli sınırlı — o durumda liste açılıyor,
   * veri kaybı yok.
   */
  private tailLooksLikeHint(row: number, cursorX: number): boolean {
    const line = this.term.buffer.active.getLine(row);
    if (!line) return false;

    const cell = line.getCell(0);
    if (!cell) return false;

    let sawText = false;
    for (let x = cursorX; x < line.length; x++) {
      if (!line.getCell(x, cell)) break;
      const chars = cell.getChars();
      if (chars === "" || chars === " ") continue;
      // Varsayılan renkte bir karakter: bu kullanıcının metni, hayalet değil.
      if (cell.isFgDefault() && !cell.isDim()) return false;
      sawText = true;
    }
    return sawText;
  }

  /**
   * Seçilen öneriyi istem satırına yazar.
   *
   * `current` DIŞARIDAN geliyor: öneri listesini üreten önek. Eskiden burada
   * satır ekrandan yeniden okunuyordu ve iki türlü yanlış çıkabiliyordu:
   *
   *  - İstem işareti yoksa okuma boş dönüyor, `acceptKeys` de önerinin
   *    tamamını yazıyordu — komut kabuğa iki kez giriyordu.
   *  - zsh-autosuggestions'ın soluk hayalet metni de EKRANDA duruyor, yani
   *    okunan satır kabuğun gerçek satırından uzun çıkabiliyor; silinecek
   *    karakter sayısı da o kadar yanlış oluyor.
   *
   * Önek her tuş vuruşunda güncelleniyor ve imlece kadar okunuyor (hayalet
   * metin imlecin sağında kalıyor), dolayısıyla doğru kaynak o.
   */
  acceptSuggestion(suggestion: string, current: string) {
    if (this.exited) return;
    const keys = acceptKeys(current, suggestion);
    if (!keys) return;
    void api.ptyWrite(this.tabId, keys).catch(() => {});
    this.notifyInput({ prefix: suggestion, full: suggestion, hintTail: false });
  }

  private handleSelectionChange() {
    if (!this.settings.behavior.copyOnSelect) return;
    const text = this.term.getSelection();
    if (!text) return;
    void navigator.clipboard?.writeText(text).catch(() => {});
  }

  private handleExit(code: number | null) {
    this.exited = true;
    this.exitCode = code;
    this.running = false;
    if (this.activeHistoryId) {
      void api
        .historyFinish(this.activeHistoryId, code, Date.now() - this.activeStartedAt)
        .catch(() => {});
      this.activeHistoryId = null;
      this.activeCommand = null;
    }
    const dim = "\x1b[38;5;240m";
    this.term.write(
      `
${dim}[${
        code === null ? t("term.sessionEnded") : t("term.sessionEndedCode", { code })
      }]\x1b[0m
`,
    );
    this.callbacks.onExit?.(code);
  }

  // ------------------------------------------------------- OSC işleyicileri

  private handleOsc133(payload: string) {
    const { kind, exitCode } = parseOsc133(payload);
    switch (kind) {
      case "A":
        // İstem çiziliyor: bir önceki komutun işareti artık geçersiz.
        this.promptEndMark = null;
        this.openedForCurrentPrompt = false;
        // İstem HENÜZ bitmedi. Kutuyu burada açmak erken olurdu: kabuk hâlâ
        // istemi yazıyor ve o sırada gönderilen metin istemin ortasına düşer.
        this.setAtPrompt(false);
        /*
         * Hâlâ "çalışıyor" görünen bir komut varsa BURADA kapanıyor.
         *
         * Kapanışı normalde 133;D bildiriyor, ama o işaret her yolda gelmiyor
         * (kaçan parça, yedek zamanlayıcının açtığı kayıt, beklenmedik
         * sonlanan program). Kaçtığında `running` açık kalıyor, ardından
         * gelen 133;B ise `atPrompt`ı yeniden açıyor — yani "istemde bekliyor"
         * ve "komut çalışıyor" AYNI ANDA doğru oluyordu. O durumda komut
         * kutusu çiziliyor ama `App.tsx`in durdurma dalı Ctrl+C'yi kutuya
         * ulaşmadan yutuyordu: ne kopyalama ne SIGINT, ne de "tekrar basın"
         * şeridi (o yalnızca kutu kapalıyken çiziliyor).
         *
         * Yeni bir istem çiziliyorsa önceki komut bitmiştir; bu kadarı kesin.
         * Çıkış kodu bilinmiyor (`null`). İkisi de boşta çağrılmaya dayanıklı,
         * yani normal yolda (D geldi) burası hiçbir şey yapmıyor.
         */
        this.closeBlock(null);
        this.endCommand(null);
        /*
         * Sunucu adresleri BURADA temizleniyor — en güvenilir yer bu.
         *
         * ÖLÇÜLEN BELİRTİ: `ng serve` durdurulup yeniden çalıştırıldığında eski
         * portun rozeti duruyordu; tıklayınca yanlış yere gidiyordu.
         *
         * Temizlik önce komut başlangıcına (133;C) ve bitişine (133;D)
         * bağlanmıştı, ama o iki işaret her yolda gelmiyor: komut metni
         * bilinmediğinde, yedek zamanlayıcı devreye girdiğinde ya da program
         * beklenmedik biçimde sonlandığında atlanabiliyorlar. 133;A ise HER
         * yeni istemde geliyor — dizin ve dal rozetlerinin güncellenmesi bunun
         * kanıtı.
         *
         * Anlamı da doğru: yeni bir istem çiziliyorsa bir önceki komut bitmiş,
         * dolayısıyla o portu dinleyen bir şey de yok.
         */
        this.clearRunUrls();
        // Yeni istem = yeni blok. Bir öncekinin sonu buranın bir üstü.
        this.openBlock();
        break;
      case "B":
        // İstem bitti, komut girişi burada başlıyor: tam olarak işaretlemek
        // istediğimiz nokta bu.
        this.promptEndMark = this.currentMark();
        this.openedForCurrentPrompt = false;
        this.setAtPrompt(true);
        break;
      case "C":
        // Komut çalışmaya başladı: artık tuşlar doğrudan ona gitmeli.
        // `openedForCurrentPrompt` kısa devresinden ÖNCE, çünkü o yalnızca
        // geçmiş kaydını ilgilendiriyor; kip her durumda değişmeli.
        this.setAtPrompt(false);
        // Yedek zamanlayıcı bu istem için kaydı zaten açtıysa ikinci kayıt
        // açmıyoruz - komut metni ikisinde de aynı satırdan geliyor.
        if (this.openedForCurrentPrompt) break;
        this.markBlockRunning(this.oscCommand ?? this.enterSnapshot);
        this.beginCommand(
          this.oscCommand ?? this.enterSnapshot,
          this.oscCommand ? "integration" : "buffer",
        );
        break;
      case "D":
        this.closeBlock(exitCode);
        this.endCommand(exitCode);
        break;
      default:
        break;
    }
  }

  private handleOsc633(payload: string) {
    const parsed = parseOsc633(payload);
    if (!parsed) return;
    switch (parsed.kind) {
      case "E":
        this.oscCommand = parsed.value.length > 0 ? parsed.value : null;
        break;
      case "P":
        if (parsed.key === "Cwd" && parsed.value) this.updateCwd(parsed.value);
        // Kabuk komut onerisini acabildi mi? Acamadiysa arayuz ne
        // yapilmasi gerektigini soyluyor - sessiz kalmak "uygulama
        // bozuk" izlenimi veriyordu.
        // Kabuk gorunur istem yerine bos satir birakiyor mu? Baslik yalnizca
        // BILDIREN kabukta cizilebilir; bildirmeyen bir kabukta o satir bos
        // degil ve baslik ciktinin ustunu orterdi.
        if (parsed.key === "BlockHeader") {
          this.blockHeaderMode = parsed.value === "1";
          this.notifyBlocks();
        }
        if (parsed.key === "Prediction") {
          this.prediction = parsed.value as PredictionState;
          this.callbacks.onPrediction?.(this.prediction);
        }
        break;
      case "X": {
        // NTerminal eklentisi: X;Dur=<ms>. PowerShell'de PSReadLine kancası
        // kurulamadığında süre Get-History'den geliyor, komut zaten bitmiş
        // olduğu için biz ölçemiyoruz.
        if (parsed.key !== "Dur") break;
        const ms = Number.parseInt(parsed.value, 10);
        if (!Number.isNaN(ms) && ms >= 0) this.durationOverride = ms;
        break;
      }
      default:
        break;
    }
  }

  private updateCwd(cwd: string) {
    const clean = cwd.trim();
    if (!clean || clean === this.cwd) return;
    this.cwd = clean;
    this.callbacks.onCwd?.(clean);
  }

  // ------------------------------------------------------- komut geçmişi

  private currentMark(): BufferMark {
    const buf = this.term.buffer.active;
    return { y: buf.baseY + buf.cursorY, x: buf.cursorX };
  }

  /**
   * İşaretlenen noktadan imlece kadar olan metni okur. Komut satır kaydırması
   * (wrap) nedeniyle birden fazla satıra yayılmış olabilir.
   */
  private readCommandFromBuffer(): string {
    const mark = this.promptEndMark;
    if (!mark) return "";
    const buf = this.term.buffer.active;
    const endY = buf.baseY + buf.cursorY;
    if (endY < mark.y) return "";

    let text = "";
    for (let y = mark.y; y <= endY; y++) {
      const line = buf.getLine(y);
      if (!line) break;
      const start = y === mark.y ? mark.x : 0;
      // Son satırda sağdaki boşlukları at; aradaki satırlar kaydırma nedeniyle
      // tam genişlikte olduğu için olduğu gibi alınmalı.
      text += line.translateToString(y === endY, start);
    }
    return text;
  }

  private scheduleFallback() {
    if (this.fallbackTimer !== null) window.clearTimeout(this.fallbackTimer);
    this.fallbackTimer = window.setTimeout(() => {
      this.fallbackTimer = null;
      // 133;C gelmediyse kabuk entegrasyonu komut başlangıcını bildirmiyor
      // (örnek: cmd.exe). Tampondan okuduğumuz metinle kaydı biz açıyoruz.
      // Kapı olarak activeHistoryId kullanamayız: o değer historyAdd yanıtıyla
      // asenkron geliyor, bayrak ise eşzamanlı.
      if (!this.openedForCurrentPrompt) {
        this.beginCommand(this.enterSnapshot, "buffer");
      }
    }, INTEGRATION_GRACE_MS);
  }

  private beginCommand(command: string | null, source: string) {
    if (this.fallbackTimer !== null) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    // Bir önceki komut kapanmadıysa (işaret göndermeyen kabuk) şimdi kapat.
    if (this.activeHistoryId) {
      this.endCommand(null);
    }
    this.oscCommand = null;
    this.enterSnapshot = null;
    this.promptEndMark = null;

    /*
     * Adres listesi burada, ERKEN ÇIKIŞTAN ÖNCE temizleniyor.
     *
     * ÖLÇÜLEN BELİRTİ: `ng serve` durdurulup yeniden çalıştırıldığında eski
     * portun rozeti duruyor, ikinci sunucu açılınca da iki rozet yan yana
     * kalıyordu. Sebep sıraydı: temizleme aşağıda, komut metni bilinmediğinde
     * dönen `return`dan SONRAYDI — o yolda liste hiç temizlenmiyordu.
     */
    this.clearRunUrls();
    // Tarama bu satırdan İTİBAREN: komutun çıktısı kendi satırlarından
    // okunuyor. İmleç satırı da aralığa giriyor (bkz. `scanForServerUrls`).
    this.resetScanAnchor();

    const text = command?.trim();
    if (!text) return;

    this.openedForCurrentPrompt = true;
    this.running = true;
    this.activeCommand = text;
    this.activeStartedAt = Date.now();
    this.callbacks.onCommandStart?.(text);

    void api
      .historyAdd({
        command: text,
        tabId: this.tabId,
        groupId: this.groupId,
        profileId: this.profileId,
        cwd: this.cwd,
        source,
      })
      .then((entry) => {
        // Komut kayıt yanıtı gelmeden bitmiş olabilir; o durumda hemen kapat.
        if (this.pendingFinish) {
          const { code, duration } = this.pendingFinish;
          this.pendingFinish = null;
          void api.historyFinish(entry.id, code, duration).catch(() => {});
        } else {
          this.activeHistoryId = entry.id;
        }
      })
      .catch(() => {
        this.activeHistoryId = null;
      });
  }

  /** historyAdd yanıtı gelmeden komut bittiyse sonucu burada bekletiyoruz. */
  private pendingFinish: { code: number | null; duration: number | null } | null = null;

  private endCommand(exitCode: number | null) {
    if (!this.running && !this.activeHistoryId && !this.activeCommand) return;

    const duration = this.durationOverride ?? (this.activeStartedAt ? Date.now() - this.activeStartedAt : null);
    this.durationOverride = null;
    const command = this.activeCommand;

    this.running = false;
    this.activeCommand = null;
    // Adres KOMUTA ait: komut bittiyse o portu dinleyen bir şey de yok.
    this.clearRunUrls();
    this.activeStartedAt = 0;
    this.openedForCurrentPrompt = false;

    if (this.activeHistoryId) {
      const id = this.activeHistoryId;
      this.activeHistoryId = null;
      void api.historyFinish(id, exitCode, duration).catch(() => {});
    } else if (command) {
      // Kayıt kimliği henüz gelmedi: yanıt geldiğinde kapatılsın.
      this.pendingFinish = { code: exitCode, duration };
    }

    if (command) this.callbacks.onCommandEnd?.(command, exitCode);
  }

  // ------------------------------------------------------------------ eylemler

  focus() {
    this.term.focus();
  }

  clear() {
    // Sadece görünen ekranı değil kaydırma tamponunu da temizle.
    this.term.clear();
    this.term.write("\x1b[3J");
  }

  async paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) this.term.paste(text);
    } catch {
      /* pano erişimi yoksa sessizce geç */
    }
  }

  hasSelection(): boolean {
    return this.term.hasSelection();
  }

  selectAll() {
    this.term.selectAll();
  }

  clearSelection() {
    this.term.clearSelection();
  }

  async copySelection(): Promise<boolean> {
    const text = this.term.getSelection();
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ctrl+C: secim varsa kopyala, yoksa tusu kabuga birak.
   *
   * Kopyaladiktan sonra secimi TEMIZLIYORUZ. Aksi halde secim ekranda
   * durdugu surece Ctrl+C hep kopyalar ve kullanici calisan sureci
   * durduramaz - terminalde en tehlikeli gerileme bu olurdu.
   *
   * "passthrough" = tus kabuga gitmeli (SIGINT). Digerlerinde tus tuketildi:
   * secim vardi, kullanicinin niyeti kopyalamakti; pano yazilamasa bile
   * SIGINT gondermek surpriz olur - onun yerine "failed" donup cagirana
   * kullaniciyi uyarma sansi veriyoruz.
   */
  async copyForCtrlC(): Promise<"copied" | "failed" | "passthrough"> {
    if (!this.wantsCtrlCCopy()) return "passthrough";
    const ok = await this.copySelection();
    this.term.clearSelection();
    return ok ? "copied" : "failed";
  }

  /**
   * Ctrl+C bu an ne yapmalı — kutudaki seçim de hesaba katılarak.
   *
   * Senkron olması şart: karar `preventDefault` verilmeden önce alınmak
   * zorunda. Yanlış tarafa düşerse iki sessiz hatadan biri oluyor — ya seçim
   * kopyalanmıyor, ya da (daha kötüsü) tuş yutulup SIGINT kabuğa hiç
   * ulaşmıyor ve çalışan komut durdurulamıyor.
   *
   * Kuralın kendisi `lib/inputMode.ts` içinde, `resolveCtrlC`: saf ve testli.
   * Burası yalnızca girdileri topluyor — platform, ayar ve ızgaradaki seçim
   * oturumun bildiği şeyler; kutudaki seçimi ise yalnızca kutu biliyor ve
   * parametre olarak veriyor. `App.tsx` ve `CommandInput` ikisi de buradan
   * geçiyor; kuralı iki yerde ayrı yazmak, biri güncellenip diğeri
   * unutulduğunda tam olarak o SIGINT kaybı demek.
   */
  ctrlCAction(boxSelection: boolean): CtrlCAction {
    return resolveCtrlC({
      mac: isMac(),
      copiesSelection: this.settings.behavior.ctrlCCopiesSelection,
      boxSelection,
      gridSelection: this.term.hasSelection(),
    });
  }

  /** Ctrl+C ızgaradaki seçimi kopyalamalı mı? (`App.tsx`, kutu kapalıyken.) */
  wantsCtrlCCopy(): boolean {
    return this.ctrlCAction(false) === "copy-grid";
  }

  /** Geçmişten seçilen komutu istem satırına yazar; çalıştırmak kullanıcıya kalır. */
  insertCommand(command: string, execute: boolean) {
    if (this.exited) return;
    const text = execute ? `${command}\r` : command;
    void api.ptyWrite(this.tabId, text).catch(() => {});
    this.term.focus();
  }

  /**
   * Komutu çalıştırır ama kullanıcı bir metin kutusuna yazıyorsa odağı ondan
   * ALMAZ.
   *
   * `insertCommand` odağı koşulsuz ızgaraya alıyor ve orada doğrusu bu:
   * komutu kullanıcı seçmiş (geçmiş, favori) ve devamını terminalde yazması
   * bekleniyor. Uygulamanın KENDİ düzeltmesi için aynı şey bir hata — kilitli
   * sekmenin klasörünü geri çağırmak kullanıcının bir eylemi değil.
   * Bildirilen belirti aynen buydu: "sekme kilitli diyor ve focus komut yaz
   * kısmındaysa gidiyor, tekrardan tıklamak gerekiyor."
   *
   * Kuralın kendisi `lib/focus.ts` içinde (`typingOutsideTerminal`) ve iki
   * kez ödenmiş (sekme adlandırma kutusu, dizin seçici); ikinci bir odak
   * kuralı yazmak ikisinin ayrışması demekti.
   */
  runQuietly(command: string) {
    if (this.exited) return;
    void api.ptyWrite(this.tabId, `${command}\r`).catch(() => {});
    this.focusTerminal();
  }
}
