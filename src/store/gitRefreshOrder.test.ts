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
 *
 * ## Düzeltmenin kendi hatası: AÇLIK
 *
 * İlk düzeltme "yalnızca EN SON VERİLEN isteğin cevabı yazılsın" diyordu. Bu bir
 * açlık riski taşıyor: yeni istekler öncekiler bitmeden gelirse (süren bir
 * derleme `index`i saniyede değiştiriyor, büyük depoda `git status` 1,5 sn
 * sürüyor, `pollGit` her saniye yeni yenileme başlatıyor) HİÇBİR cevap yazılmaz
 * ve rozet süren işlem bitene kadar bayat kalır — düzeltmeden önceki davranıştan
 * daha kötü. Doğru kural: uygulanan sonuç GERİYE GİTMEZ. Daha yeni bir istek
 * zaten yazıldıysa eski cevap atılır; yazılmadıysa (yenisi hâlâ sürüyorsa) eski
 * cevap de yazılır, çünkü ekranda olandan daha yeni.
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

  it("yeni sorgular eskisi bitmeden geldikçe AÇ KALMA yok: en yeniden önce biten sonuç yazılıyor", async () => {
    // Üç yenileme üst üste, hiçbiri bitmedi. En yeni sürerken ilk biten cevap
    // ekrandaki durumdan daha taze; "yalnız en son verilen yazılır" kuralı onu
    // atıyor ve rozet HİÇ güncellenmiyordu.
    const bir = ertelenmis<unknown>();
    const iki = ertelenmis<unknown>();
    const uc = ertelenmis<unknown>();
    h.gitInfo.mockReturnValueOnce(bir.p).mockReturnValueOnce(iki.p).mockReturnValueOnce(uc.p);
    const p1 = useStore.getState().refreshGit("/depo");
    const p2 = useStore.getState().refreshGit("/depo");
    const p3 = useStore.getState().refreshGit("/depo");

    const gorunen = () => (useStore.getState().gitInfo["/depo"] as { changes: unknown[] } | null | undefined);

    bir.coz(bilgi(1));
    await p1;
    expect(gorunen()?.changes.length, "yenisi sürerken biten eski cevap atıldı: rozet aç kaldı").toBe(1);

    uc.coz(bilgi(3));
    await p3;
    expect(gorunen()?.changes.length).toBe(3);

    iki.coz(bilgi(2)); // en yeni zaten yazıldı: bu bayat
    await p2;
    expect(gorunen()?.changes.length, "bayat sonuç yeniyi ezdi").toBe(3);
  });

  it("önbellekteki imza yalnızca yazılan sonuçla birlikte güncelleniyor", async () => {
    // Bayat cevabın imzası yeni sonucun imzasını ezmemeli: `pollGit` imzaları
    // karşılaştırıp yeniden sorgulamaya karar veriyor; ezilirse ya gereksiz
    // sorgu ya da kaçırılmış değişiklik olur.
    const eski = ertelenmis<unknown>();
    const yeni = ertelenmis<unknown>();
    h.gitInfo.mockReturnValueOnce(eski.p).mockReturnValueOnce(yeni.p);
    h.gitFingerprint.mockResolvedValueOnce("imza-eski").mockResolvedValueOnce("imza-yeni");
    const a = useStore.getState().refreshGit("/imza");
    const b = useStore.getState().refreshGit("/imza");
    yeni.coz(bilgi(0));
    await b;
    eski.coz(bilgi(4));
    await a;

    // Aynı imza (imza-yeni) ile yoklama: ek sorgu AÇMAMALI.
    h.gitInfo.mockClear();
    h.gitFingerprint.mockResolvedValueOnce("imza-yeni");
    await useStore.getState().pollGit("/imza");
    expect(h.gitInfo, "imza ezildi: değişmeyen depo yeniden sorgulandı").not.toHaveBeenCalled();
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
