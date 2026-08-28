import { Terminal, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { api, onPtyData, onPtyExit } from "../lib/ipc";
import { cwdFromFileUri, parseOsc133, parseOsc633 } from "../lib/osc";
import { getTheme } from "../lib/themes";
import type { Settings } from "../types";

interface BufferMark {
  y: number;
  x: number;
}

export interface SessionCallbacks {
  onTitle?: (title: string) => void;
  onCwd?: (cwd: string) => void;
  onCommandStart?: (command: string) => void;
  onCommandEnd?: (command: string, exitCode: number | null) => void;
  onExit?: (code: number | null) => void;
  onBell?: () => void;
  /** Terminal içinden yeni sekme / kapatma gibi bir kısayol geldiğinde. */
  onShortcut?: (action: string) => boolean;
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
const INTEGRATION_GRACE_MS = 220;

export class TerminalSession {
  readonly tabId: string;
  groupId: string;
  profileId: string;

  readonly term: Terminal;
  private readonly fit = new FitAddon();
  private readonly serializer = new SerializeAddon();
  readonly search = new SearchAddon();
  private webgl: WebglAddon | null = null;

  private container: HTMLElement | null = null;
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
      macOptionIsMeta: false,
      rightClickSelectsWord: false,
      // buildNumber şart: xterm satır akışını (reflow)
      // `backend === "conpty" && buildNumber >= 21376` koşuluyla açıyor.
      // Vermezsek Windows 11'de bile eski kipte kalır ve pencere yeniden
      // boyutlandırıldığında uzun satırlar yanlış birleşir.
      windowsPty: {
        backend: "conpty",
        ...(init.windowsBuild > 0 ? { buildNumber: init.windowsBuild } : {}),
      },
    });

    this.term.loadAddon(this.fit);
    this.term.loadAddon(this.serializer);
    this.term.loadAddon(this.search);
    this.term.loadAddon(new WebLinksAddon());

    const unicode = new Unicode11Addon();
    this.term.loadAddon(unicode);
    this.term.unicode.activeVersion = "11";

    this.registerHandlers();
  }

  setCallbacks(callbacks: SessionCallbacks) {
    this.callbacks = callbacks;
  }

  // ------------------------------------------------------------- yaşam döngüsü

  /** Terminali DOM'a bağlar. Yalnızca bir kez çağrılmalı. */
  attach(container: HTMLElement) {
    if (this.container === container) return;
    this.container = container;
    this.term.open(container);
    this.safeFit();

    this.resizeObserver = new ResizeObserver(() => this.safeFit());
    this.resizeObserver.observe(container);
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
      const dim = "\x1b[38;5;240m";
      const reset = "\x1b[0m";
      const line = "\u2500".repeat(Math.max(8, Math.min(60, this.term.cols - 24)));
      this.term.write(
        `\r\n${dim}${line} önceki oturum burada bitti ${line}${reset}\r\n`,
      );
    }

    try {
      const result = await api.ptySpawn({
        id: this.tabId,
        profileId: this.profileId,
        cwd: this.cwd,
        env: this.env,
        cols: this.term.cols,
        rows: this.term.rows,
      });
      this.pid = result.pid;
      this.shell = result.shell;
      this.integration = result.integration;
      if (result.cwd) this.cwd = result.cwd;
    } catch (err) {
      this.term.write(
        `\r\n\x1b[31mKabuk başlatılamadı:\x1b[0m ${String(err)}\r\n`,
      );
      this.exited = true;
      return;
    }

    this.unlisteners.push(
      await onPtyData(this.tabId, (bytes) => this.term.write(bytes)),
    );
    this.unlisteners.push(
      await onPtyExit(this.tabId, (code) => this.handleExit(code)),
    );
  }

  /** Görünür sekme değişince çağrılır: WebGL bağlamını yalnızca aktif terminal tutar. */
  setActive(active: boolean) {
    if (active) {
      this.enableWebgl();
      this.safeFit();
      this.focusTerminal();
    } else {
      this.disableWebgl();
    }
  }

  /**
   * Terminale odağı verir - ama kullanıcı bir metin kutusuna yazıyorsa
   * dokunmaz.
   *
   * Bunu koşulsuz yapmak sekme adlandırmayı kullanılamaz hâle getiriyordu:
   * sekmeye çift tıklandığında adlandırma kutusu açılıyor, hemen ardından
   * (sekme ilk kez açılıyorsa kabuk başlatıldıktan sonra, asenkron olarak)
   * `setActive` terminale odaklanıyor, kutu `onBlur` ile kapanıp kaydediyordu.
   */
  private focusTerminal() {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) {
      const isFormField = active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT";
      // xterm girdiyi kendi gizli textarea'sı üzerinden alıyor; onu bir
      // "kullanıcı yazıyor" durumu saymamalıyız.
      const insideTerminal = !!active.closest(".xterm");
      if (isFormField && !insideTerminal) return;
    }
    this.term.focus();
  }

  private enableWebgl() {
    if (this.webgl || !this.container) return;
    try {
      const addon = new WebglAddon();
      // Bağlam kaybında (GPU sürücü sıfırlaması, çok fazla bağlam) sessizce
      // DOM oluşturucuya dönüyoruz; terminal çalışmaya devam etsin.
      addon.onContextLoss(() => {
        addon.dispose();
        if (this.webgl === addon) this.webgl = null;
      });
      this.term.loadAddon(addon);
      this.webgl = addon;
    } catch {
      this.webgl = null;
    }
  }

  private disableWebgl() {
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
    const theme = getTheme(settings.appearance.theme);
    this.term.options.fontFamily = settings.appearance.fontFamily;
    this.term.options.fontSize = settings.appearance.fontSize;
    this.term.options.lineHeight = settings.appearance.lineHeight;
    this.term.options.letterSpacing = settings.appearance.letterSpacing;
    this.term.options.cursorStyle = settings.appearance.cursorStyle;
    this.term.options.cursorBlink = settings.appearance.cursorBlink;
    this.term.options.scrollback = settings.appearance.scrollback;
    this.term.options.theme = theme.xterm;
    this.safeFit();
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
      this.term.onTitleChange((title) => {
        this.title = title;
        this.callbacks.onTitle?.(title);
      }),
      this.term.onBell(() => this.callbacks.onBell?.()),
      this.term.onSelectionChange(() => this.handleSelectionChange()),
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
      `\r\n${dim}[oturum sona erdi${code === null ? "" : `, çıkış kodu ${code}`}]\x1b[0m\r\n`,
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
        break;
      case "B":
        // İstem bitti, komut girişi burada başlıyor: tam olarak işaretlemek
        // istediğimiz nokta bu.
        this.promptEndMark = this.currentMark();
        this.openedForCurrentPrompt = false;
        break;
      case "C":
        // Yedek zamanlayıcı bu istem için kaydı zaten açtıysa ikinci kayıt
        // açmıyoruz - komut metni ikisinde de aynı satırdan geliyor.
        if (this.openedForCurrentPrompt) break;
        this.beginCommand(
          this.oscCommand ?? this.enterSnapshot,
          this.oscCommand ? "integration" : "buffer",
        );
        break;
      case "D":
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

  /** Geçmişten seçilen komutu istem satırına yazar; çalıştırmak kullanıcıya kalır. */
  insertCommand(command: string, execute: boolean) {
    if (this.exited) return;
    const text = execute ? `${command}\r` : command;
    void api.ptyWrite(this.tabId, text).catch(() => {});
    this.term.focus();
  }
}
