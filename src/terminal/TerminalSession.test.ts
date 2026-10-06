// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { useStore } from "../store/useStore";
import { TerminalSession } from "./TerminalSession";

/**
 * Kabuğun İLK çıktısı kaybolmamalı.
 *
 * ## Ölçülen belirti
 *
 * Yeni bir sekmede komut satırı hiç açılmıyor; sekmeyi yeniden başlatmak
 * düzeltiyor. Kutu yalnızca kabuk istemde beklerken açılıyor ve "istemde"
 * bilgisi kabuğun gönderdiği OSC 133;B işaretinden geliyor. O işaret KAÇARSA
 * bir daha gelmiyor — kabuk istemde sessizce bekliyor — ve kutu kalıcı olarak
 * kapalı kalıyor.
 *
 * ## Kök neden
 *
 * Rust tarafı PTY'yi doğurur doğurmaz okumaya başlıyor ve çıktıyı `app.emit`
 * ile yayımlıyor. Tauri'nin olay yayını TAMPONSUZ: o an kayıtlı dinleyici
 * yoksa veri düşüyor. Arayüz ise önce `ptySpawn` çağırıp SONRA dinleyiciyi
 * kuruyordu; ikisinin arasında en az bir IPC gidiş dönüşü var. Kabuğun ilk
 * istemi o aralığa denk gelince işaretler siliniyor.
 *
 * Yarış olduğu için belirti aralıklı: makine meşgulken (oturum geri
 * yüklenirken, on sekme birden açılırken) çok daha sık.
 *
 * ## Bu testin taklit ettiği şey
 *
 * `ptySpawn` taklidi, DÖNMEDEN ÖNCE ilk istemi yayımlıyor — gerçek sıra bu.
 * `emit` de Rust tarafı gibi davranıyor: dinleyici yoksa veriyi düşürüyor,
 * sessizce biriktirmiyor. Doğru sıra kurulmadıkça bu testler geçmiyor.
 */

const h = vi.hoisted(() => {
  const handlers = new Map<string, (bytes: Uint8Array) => void>();
  /** Yayımlanan her parça ve teslim edilip edilmediği. */
  const yayin: { id: string; teslim: boolean }[] = [];
  return {
    handlers,
    yayin,
    /** Rust tarafının `app.emit`i: dinleyici yoksa veri DÜŞER. */
    emit(id: string, text: string) {
      const handler = handlers.get(id);
      yayin.push({ id, teslim: !!handler });
      handler?.(new TextEncoder().encode(text));
    },
    reset() {
      handlers.clear();
      yayin.length = 0;
    },
    /** Kabuğa yazılan her şey (`ptyWrite`). */
    yazilan: [] as { id: string; data: string }[],
  };
});

vi.mock("../lib/ipc", () => {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  /** Kabuğun ilk istemi: istem başlıyor (A), istem bitti / girdi başlıyor (B). */
  const ilkIstem = `${ESC}]133;A${BEL}${ESC}]133;B${BEL}`;

  const ptySpawn = vi.fn(async (spec: { id: string }) => {
    // Rust tarafının hata metni: profildeki kabuk bu makinede yok.
    if (spec.id.startsWith("dogmayan")) {
      throw new Error("kabuk baslatilamadi: C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    }
    // ÇIKTI SPAWN DÖNMEDEN yayımlanıyor: ConPTY okuyucusu Rust tarafında
    // süreç doğduğu anda başlıyor, komutun yanıtı arayüze varmadan önce.
    h.emit(spec.id, ilkIstem);
    return { pid: 4242, shell: "powershell", integration: true, cwd: "C:\\Users\\test" };
  });

  const ptyWrite = vi.fn(async (id: string, data: string) => {
    h.yazilan.push({ id, data });
  });

  return {
    // Gerçek `api` yüzeyi geniş; testin ilgilendiği çağrılar `ptySpawn` ve
    // `ptyWrite`. Vekil, geri kalanını sessiz birer boş çağrıya indiriyor —
    // yüzey büyüdükçe testin bozulmaması için.
    api: new Proxy(
      { ptySpawn, ptyWrite } as Record<string, unknown>,
      {
        get: (target, prop: string) =>
          target[prop] ?? vi.fn(async () => null),
      },
    ),
    onPtyData: async (id: string, handler: (bytes: Uint8Array) => void) => {
      h.handlers.set(id, handler);
      return () => h.handlers.delete(id);
    },
    onPtyExit: async () => () => {},
  };
});

function session(tabId: string) {
  return new TerminalSession({
    tabId,
    groupId: "g1",
    profileId: "p1",
    cwd: null,
    env: {},
    // Deponun açılış ayarları gerçek bir `Settings`: elle kurulan bir kopya
    // alanlar eklendikçe eskiyecekti.
    settings: useStore.getState().settings,
    windowsBuild: 22000,
    restoreScrollback: false,
  });
}

/** xterm yazmayı KUYRUĞA alıyor; ayrıştırma bittiğinde geri çağırıyor. */
function flush(s: TerminalSession): Promise<void> {
  return new Promise((resolve) => s.term.write("", () => resolve()));
}

describe("oturum başlangıcı", () => {
  it("kabuğun ilk isteminden gelen işaretler kaybolmuyor", async () => {
    h.reset();
    const s = session("t1");
    await s.start(null);
    await flush(s);

    expect(
      s.inputSignals().atPrompt,
      "ilk istem işareti kaçtı: komut kutusu bir daha açılmaz",
    ).toBe(true);
    void s.dispose(true);
  });

  it("dinleyici SPAWN'DAN ÖNCE kuruluyor", async () => {
    // Kök nedeni doğrudan adlandıran denetim: ilk parça teslim edilmeliydi.
    h.reset();
    const s = session("t2");
    await s.start(null);

    expect(h.yayin.length, "kabuk hiç yazmadı, taklit bozulmuş").toBeGreaterThan(0);
    expect(h.yayin[0].teslim, "ilk parça dinleyici yokken yayımlandı ve düştü").toBe(true);
    void s.dispose(true);
  });

  it("işaretler doğru sekmeye gidiyor", async () => {
    // Olay adı sekme kimliğinden türüyor; iki oturum birbirinin işaretini
    // görmemeli.
    h.reset();
    const a = session("t3");
    const b = session("t4");
    await a.start(null);
    await b.start(null);
    await flush(a);
    await flush(b);

    expect(a.inputSignals().atPrompt).toBe(true);
    expect(b.inputSignals().atPrompt).toBe(true);
    expect(h.yayin.map((y) => y.id)).toEqual(["t3", "t4"]);
    void a.dispose(true);
    void b.dispose(true);
  });
});

/**
 * "Kabuk başlatılıyor…" şeridi SONSUZA KADAR kalmamalı.
 *
 * BİLDİRİLEN HATA: başka bir bilgisayara kurulan uygulamada şerit hiç
 * kalkmadı. Şerit, depoda sinyal yokken ya da entegre bir kabuk henüz ilk
 * istemini bildirmemişken çiziliyor (bkz. `CommandInput`). İstem işareti hiç
 * gelmeyecekse oturum bunu depoya SÖYLEMEK zorunda; yoksa şerit yalan
 * söylemeye devam eder.
 *
 * Kök neden kabuk tarafındaydı (betik yürütme ilkesine takılıyordu, bkz.
 * pty.rs `POWERSHELL_BOOTSTRAP`). Bu testler aynı belirtinin öteki iki
 * kapısını kapatıyor: kabuğun hiç doğmaması ve betiğin yüklenememesi.
 */
describe("istem hiç gelmeyecekse", () => {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);

  it("kabuk doğmadıysa depo duyuyor: sinyal ve çıkış", async () => {
    // Profilde bu makinede olmayan bir kabuk yolu (başka makineden içe
    // alınmış ayar). Eskiden yalnızca oturumun kendi bayrağı kalkıyordu; depo
    // hiçbir şey duymadığı için şerit sonsuza kadar "başlatılıyor" diyordu.
    h.reset();
    const s = session("dogmayan-1");
    const onInputSignals = vi.fn();
    const onExit = vi.fn();
    s.setCallbacks({ onInputSignals, onExit });
    await s.start(null);

    expect(onInputSignals, "depoya hiç sinyal gitmedi: şerit sonsuza kadar kalır").toHaveBeenCalled();
    expect(onInputSignals.mock.lastCall?.[0].integration).toBe(false);
    // Çıkış yolu: depo bir kez yeniden deniyor, olmazsa "kabuk açılamıyor"
    // kutusunu çiziyor (bkz. autoRestart.test.ts).
    expect(onExit).toHaveBeenCalledWith(null);
    void s.dispose(true);
  });

  it("betik yüklenemediyse oturum entegrasyonsuz sayılıyor", async () => {
    // Kabuk tarafı bunu `633;P;Integration=failed` ile bildiriyor.
    h.reset();
    const s = session("t7");
    const onInputSignals = vi.fn();
    s.setCallbacks({ onInputSignals });
    await s.start(null);
    await flush(s);
    expect(s.inputSignals().integration, "taklit bozulmuş").toBe(true);

    h.emit("t7", `${ESC}]633;P;Integration=failed${BEL}`);
    await flush(s);

    expect(s.inputSignals().integration).toBe(false);
    expect(s.integration, "durum çubuğu ve sekme noktası bunu okuyor").toBe(false);
    expect(onInputSignals.mock.lastCall?.[0].integration, "depo duymadı").toBe(false);
    void s.dispose(true);
  });
});

/**
 * Başlık bildirimi — DEĞİŞİM başına bir kez.
 *
 * Kabuklar başlığı çoğu zaman her istemde yeniden yazıyor (oh-my-zsh,
 * powerlevel10k ve starship `precmd`de kuruyor) ve xterm her OSC 0/2 için
 * olayı tetikliyor, metin aynı olsa bile.
 *
 * Korumasızken her istem `updateTab` → `set({groups})` zincirine çıkıyordu:
 * `map` yeni bir dizi ve yeni bir grup nesnesi ürettiği için `groups`un KİMLİĞİ
 * değişiyor ve `App` ile altındaki bütün ağaç yeniden çiziliyordu — ekranda
 * hiçbir şey değişmediği hâlde. Aynı koruma `updateCwd` içinde zaten vardı.
 */
describe("başlık bildirimi", () => {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const baslik = (text: string) => `${ESC}]0;${text}${BEL}`;

  async function kurulu(tabId: string) {
    h.reset();
    const s = session(tabId);
    const onTitle = vi.fn<(title: string) => void>();
    s.setCallbacks({ onTitle });
    await s.start(null);
    await flush(s);
    // Açılış sırasında bir başlık gelmiş olabilir; ölçüm bundan sonrası.
    onTitle.mockClear();
    return { s, onTitle };
  }

  it("aynı başlık ikinci kez bildirilmiyor", async () => {
    const { s, onTitle } = await kurulu("t5");

    h.emit("t5", baslik("~/projeler"));
    await flush(s);
    h.emit("t5", baslik("~/projeler"));
    await flush(s);

    expect(onTitle, "değişmeyen başlık depoya yazılıyor").toHaveBeenCalledTimes(1);
    expect(onTitle).toHaveBeenCalledWith("~/projeler");
    void s.dispose(true);
  });

  it("başlık gerçekten değişince bildiriliyor", async () => {
    // Korumanın bedeli olmamalı: sekme adı kabuğu izlemeye devam etsin.
    const { s, onTitle } = await kurulu("t6");

    h.emit("t6", baslik("~/projeler"));
    await flush(s);
    h.emit("t6", baslik("~/projeler/nterminal"));
    await flush(s);

    expect(onTitle.mock.calls.map((c) => c[0])).toEqual([
      "~/projeler",
      "~/projeler/nterminal",
    ]);
    expect(s.title).toBe("~/projeler/nterminal");
    void s.dispose(true);
  });
});

/**
 * Geri yüklenen ekran yeni kabuğu programın kiplerinde BIRAKMAMALI.
 *
 * BİLDİRİLEN: Claude Code tam ekran çalışırken uygulama yeniden başladı; geri
 * gelen sekmede komut kutusu yoktu, fareyi oynatmak isteme `^[[<35;12;1M`,
 * pencereye dönmek `^[[I` basıyordu. "Yeniden başlat" düzeltmiyordu. Kayıt
 * ikincil ekranı ve fare / odak kiplerini taşıyordu (diskteki dosyada
 * sayıldı: `?1049h`, `?1003h`, `?1004h`); gerekçe `RESTORE_RESET`te.
 */
describe("geri yüklenen ekran", () => {
  /** Düzeltmeden önceki `serialize` çıktısının biçimi: ana ekran, ikincil ekran, kipler. */
  const ESKI_KAYIT =
    "onceki komutun ciktisi\r\n" +
    "\x1b[?1049h\x1b[H" +
    "programin son karesi" +
    "\x1b[?1h\x1b[?2004h\x1b[?1004h\x1b[?1003h\x1b[?1006h\x1b[?25l";

  it("eski kayıttan sonra kabuk ana ekranda ve varsayılan kiplerde başlıyor", async () => {
    const s = session("geri-eski");
    await s.start(ESKI_KAYIT);
    await flush(s);

    expect(s.term.buffer.active.type, "kabuk ikincil ekranda doğdu").toBe("normal");
    expect(s.term.modes.mouseTrackingMode, "fare hareketleri kabuğa yazılır").toBe("none");
    expect(s.term.modes.sendFocusMode, "odak değişimi kabuğa yazılır").toBe(false);
    expect(s.term.modes.applicationCursorKeysMode).toBe(false);
    expect(s.term.modes.bracketedPasteMode).toBe(false);

    // Kutunun açılması için gereken: istemde ve ikincil ekranda değil.
    expect(s.inputSignals()).toMatchObject({ atPrompt: true, altScreen: false });

    // Ana ekrandaki çıktı yerinde; ikincil ekranın karesi değil.
    const satirlar = Array.from({ length: s.term.buffer.active.length }, (_, i) =>
      s.term.buffer.active.getLine(i)?.translateToString(true),
    ).join("\n");
    expect(satirlar).toContain("onceki komutun ciktisi");
    expect(satirlar).not.toContain("programin son karesi");

    // `?1004h` yazıldığı anda xterm odağı bildiriyor; o rapor kabuğa gitmemeli.
    const raporlar = h.yazilan
      .filter((w) => w.id === "geri-eski")
      .filter((w) => w.data.includes("\x1b[I") || w.data.includes("\x1b[O"));
    expect(raporlar, "geri yükleme sırasında üretilen odak raporu kabuğa gitti").toEqual([]);
    void s.dispose(true);
  });

  it("kayıt ikincil ekranı ve kipleri içermiyor", async () => {
    const s = session("geri-kayit");
    await s.start(null);
    s.term.write("normal satir\r\n" + "\x1b[?1049h" + "tam ekran" + "\x1b[?1003h\x1b[?1004h\x1b[?1h");
    await flush(s);

    const kayit = s.serialize();
    expect(kayit).toContain("normal satir");
    for (const parca of ["\x1b[?1049h", "tam ekran", "\x1b[?1003h", "\x1b[?1004h", "\x1b[?1h"]) {
      expect(kayit, JSON.stringify(parca)).not.toContain(parca);
    }
    void s.dispose(true);
  });
});
