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
  };
});

vi.mock("../lib/ipc", () => {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  /** Kabuğun ilk istemi: istem başlıyor (A), istem bitti / girdi başlıyor (B). */
  const ilkIstem = `${ESC}]133;A${BEL}${ESC}]133;B${BEL}`;

  const ptySpawn = vi.fn(async (spec: { id: string }) => {
    // ÇIKTI SPAWN DÖNMEDEN yayımlanıyor: ConPTY okuyucusu Rust tarafında
    // süreç doğduğu anda başlıyor, komutun yanıtı arayüze varmadan önce.
    h.emit(spec.id, ilkIstem);
    return { pid: 4242, shell: "powershell", integration: true, cwd: "C:\\Users\\test" };
  });

  return {
    // Gerçek `api` yüzeyi geniş; testin ilgilendiği tek çağrı `ptySpawn`.
    // Vekil, geri kalanını sessiz birer boş çağrıya indiriyor — yüzey
    // büyüdükçe testin bozulmaması için.
    api: new Proxy(
      { ptySpawn } as Record<string, unknown>,
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
