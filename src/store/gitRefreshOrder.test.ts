// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Git rozetinin yenilemeleri SIRA DIŞI bitse de en yeni sorgu kazanmalı.
 *
 * `git_info` eskiden Tauri'nin ana iş parçacığında koşuyordu: çağrılar sırayla
 * işleniyor, cevaplar çağrı sırasıyla geliyordu. Komut artık `async` +
 * `spawn_blocking` (ana iş parçacığını dondurmasın diye): iki çağrı PARALEL
 * koşuyor ve yavaş olan ilki, hızlı olan ikincisinden SONRA bitebiliyor. Sonuç
 * dizine göre saklandığı için ESKİ `git status` YENİNİN ÜSTÜNE yazıyordu:
 * `git commit`ten sonra rozet, commit'ten önceki değişiklik sayısını gösterip
 * bir sonraki yenilemeye kadar öyle kalıyordu.
 */

const h = vi.hoisted(() => ({
  gitInfo: vi.fn(),
  gitFingerprint: vi.fn(async (_yol?: string) => "imza"),
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      gitInfo: (...a: unknown[]) => h.gitInfo(...a),
      gitFingerprint: (...a: unknown[]) => h.gitFingerprint(...(a as [string])),
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("./useStore");

const bilgi = (degisiklik: number) => ({ branch: "main", changes: Array(degisiklik).fill({}) }) as never;

/** Elle çözülen söz: hangi çağrının ne zaman biteceğini test belirliyor. */
function ertelenmis<T>() {
  let coz!: (v: T) => void;
  const p = new Promise<T>((r) => (coz = r));
  return { p, coz };
}

beforeEach(() => {
  h.gitInfo.mockReset();
  useStore.setState({ gitInfo: {} });
});

describe("git yenilemesi sırası", () => {
  it("yavaş eski sorgu, hızlı yeni sorgunun sonucunun üstüne yazmıyor", async () => {
    const eski = ertelenmis<unknown>();
    const yeni = ertelenmis<unknown>();
    h.gitInfo.mockReturnValueOnce(eski.p).mockReturnValueOnce(yeni.p);

    const a = useStore.getState().refreshGit("/depo"); // commit ÖNCESİ (yavaş)
    const b = useStore.getState().refreshGit("/depo"); // commit SONRASI (hızlı)

    yeni.coz(bilgi(0)); // ikinci sorgu ÖNCE bitiyor
    await b;
    eski.coz(bilgi(3)); // birinci sorgu SONRA bitiyor (bayat)
    await a;

    const son = useStore.getState().gitInfo["/depo"] as { changes: unknown[] } | null;
    expect(son?.changes.length, "bayat sonuç yeniyi ezdi").toBe(0);
  });

  it("sorgular sırayla bitince de son sorgunun sonucu kalıyor", async () => {
    h.gitInfo.mockResolvedValueOnce(bilgi(3)).mockResolvedValueOnce(bilgi(1));
    await useStore.getState().refreshGit("/depo");
    await useStore.getState().refreshGit("/depo");
    const son = useStore.getState().gitInfo["/depo"] as { changes: unknown[] } | null;
    expect(son?.changes.length).toBe(1);
  });

  it("farklı dizinler birbirini etkilemiyor", async () => {
    // Koruma dizin başına: `cd a` ile `cd b` yarışı a'nın sonucunu atmamalı.
    const a = ertelenmis<unknown>();
    const b = ertelenmis<unknown>();
    h.gitInfo.mockReturnValueOnce(a.p).mockReturnValueOnce(b.p);
    const pa = useStore.getState().refreshGit("/a");
    const pb = useStore.getState().refreshGit("/b");
    b.coz(bilgi(2));
    a.coz(bilgi(5));
    await Promise.all([pa, pb]);
    const g = useStore.getState().gitInfo as Record<string, { changes: unknown[] } | null>;
    expect(g["/a"]?.changes.length).toBe(5);
    expect(g["/b"]?.changes.length).toBe(2);
  });
});
