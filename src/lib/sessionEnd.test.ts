import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Oturum sonunda (Windows Installer / Restart Manager, oturum kapatma) son kayıt.
 *
 * ÖLÇÜLEN HATA (NOTLAR.md §2.6): MSI kurulurken Restart Manager uygulamaya
 * kapanmasını söyledi, süreç `0xc0000409` ile çöktü; çalışma alanı ve ekran
 * çıktıları son periyodik kayıttaki hâlinde kaldı. Çökmeyi Rust tarafı
 * gideriyor (`session_end.rs`, testleri `session_end_tests.rs`); burada
 * bağlanan şey kaydın kendisi: Rust bu olayı kapanış sorusunda gönderiyor ve
 * `WM_ENDSESSION`ın içinde onayı bekliyor; onay gelmezse süre dolunca kayıtsız
 * çıkıyor.
 *
 * Üç şey bozulursa kayıt sessizce kaybolur ve hiçbir şey çökmez:
 *  - olay adı iki tarafta ayrışırsa arayüz hiç duymaz;
 *  - onay kayıttan ÖNCE giderse Rust yazma bitmeden süreci bitirir;
 *  - kayıt düşünce onay hiç gitmezse her kapanış süre sonuna kadar bekler.
 */

const h = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown) => unknown>(),
  calls: [] as string[],
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, cb: (event: unknown) => unknown) => {
    h.listeners.set(name, cb);
    return () => h.listeners.delete(name);
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    h.calls.push(command);
  }),
}));

const { SESSION_END_EVENT, onSessionEnd } = await import("./ipc");

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Olayı Rust gönderiyormuş gibi tetikler; dinleyicinin sözünü döner. */
async function oturumSonu(): Promise<unknown> {
  const cb = h.listeners.get(SESSION_END_EVENT);
  if (!cb) throw new Error(`"${SESSION_END_EVENT}" dinlenmiyor`);
  return cb({ event: SESSION_END_EVENT, id: 1, payload: null });
}

beforeEach(() => {
  h.listeners.clear();
  h.calls.length = 0;
});

describe("oturum sonu", () => {
  it("olay adı Rust'taki sabitle aynı", () => {
    const rust = read("src-tauri/src/session_end.rs");
    const m = rust.match(/pub const EVENT: &str = "([^"]+)";/);
    expect(m, "session_end.rs içinde EVENT sabiti bulunamadı").not.toBeNull();
    expect(SESSION_END_EVENT).toBe(m![1]);
  });

  it("onay kayıt BİTTİKTEN sonra gidiyor", async () => {
    let bitir!: () => void;
    const kayit = new Promise<void>((resolve) => (bitir = resolve));
    await onSessionEnd(() => kayit);

    const bekleyen = oturumSonu();
    await Promise.resolve();
    expect(h.calls, "kayıt sürerken onay gitti: Rust yazma bitmeden çıkardı").toEqual([]);

    bitir();
    await bekleyen;
    expect(h.calls).toEqual(["session_end_flushed"]);
  });

  it("kayıt düşse de onay gidiyor ve dinleyici hata fırlatmıyor", async () => {
    await onSessionEnd(async () => {
      throw new Error("disk dolu");
    });
    await expect(oturumSonu()).resolves.toBeUndefined();
    expect(h.calls, "onay gitmedi: her kapanış süre sonuna kadar beklerdi").toEqual([
      "session_end_flushed",
    ]);
  });

  it("uygulama dinleyiciyi tam kayıtla kuruyor", () => {
    // Kapatma düğmesinin yazdığı kaydın aynısı; eksik bir kayıt işlev
    // (yalnızca ayarlar gibi) "kaldığı yerden devam"ı yine bozardı.
    expect(read("src/App.tsx")).toMatch(/onSessionEnd\(flushAllState\)/);
  });
});
