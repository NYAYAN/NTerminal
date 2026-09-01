// @vitest-environment jsdom
import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";

import { scanForServerUrls, type ScanState } from "./serverScan";

/**
 * Sunucu adresi rozetinin YAŞAM DÖNGÜSÜ — gerçek bir xterm üzerinde.
 *
 * ## Neden gerçek terminal
 *
 * Bu hata altı tur boyunca kullanıcıya test ettirilerek arandı ve her turda
 * başka bir kök neden çıktı. Sebebi bir varsayımdı: "doğruluğu gerçek kabuk
 * olmadan denenemez". Yanlıştı. Kabuk gerekmiyor; gereken şey terminalin
 * KENDİSİ ve ona yazılan bayt dizisi. İkisi de burada.
 *
 * xterm `open()` çağrılmadan da çalışıyor: tampon, imleç ve kaydırma mantığı
 * DOM'dan bağımsız. Kaçış dizileri de gerçek ayrıştırıcıdan geçiyor, yani
 * "yeniden çizim imleci ilerletir mi" gibi sorular tahminle değil ölçümle
 * yanıtlanıyor.
 *
 * ## Taklit edilen şey
 *
 * ConPTY'nin yeniden çizimi: imleci ekranın başına alıp (`ESC[H`) var olan
 * içeriği yeniden yazmak. Gerçek belirti buydu — komut başlayınca komut kutusu
 * "Durdur" şeridine dönüşüyor, terminal yeniden ölçülüyor ve ConPTY görünen
 * ekranı yeniden yayımlıyor.
 */

/** Kaçış karakteri: kaynağa doğrudan yazmak dosyayı okunmaz yapıyor. */
const ESC = String.fromCharCode(27);

const LIMITS = { maxUrls: 4, maxLines: 2000 };

/** Bir xterm örneği ve ona yazıp tarama yapan yardımcılar. */
function harness() {
  const term = new Terminal({ rows: 24, cols: 100, scrollback: 1000 });
  let state: ScanState = { scanLine: -1, urls: [] };
  let running = false;

  const write = (data: string): Promise<void> =>
    new Promise((resolve) => term.write(data, () => resolve()));

  const scan = () => {
    const buf = term.buffer.active;
    const out = scanForServerUrls(
      state,
      {
        baseY: buf.baseY,
        cursorY: buf.cursorY,
        readLine: (y) => buf.getLine(y)?.translateToString(true) ?? "",
        isWrapped: (y) => buf.getLine(y)?.isWrapped ?? false,
        running,
        altScreen: buf.type === "alternate",
      },
      LIMITS,
    );
    state = out.state;
    return out;
  };

  return {
    term,
    /** Komut başladı: tarama işareti o anki satıra kurulur. */
    begin() {
      running = true;
      const buf = term.buffer.active;
      state = { scanLine: buf.baseY + buf.cursorY, urls: [] };
    },
    /** Komut bitti: liste boşalır. */
    end() {
      running = false;
      state = { scanLine: state.scanLine, urls: [] };
    },
    /** Çıktı yaz ve tara — gerçek akışta olan sıra bu. */
    async out(data: string) {
      await write(data);
      scan();
    },
    urls: () => state.urls,
    scanLine: () => state.scanLine,
  };
}

describe("sunucu adresi taraması (gerçek xterm)", () => {
  it("adres yeni satırlarda bulunuyor", async () => {
    const h = harness();
    h.begin();
    await h.out("Watch mode enabled.\r\n");
    await h.out("  Local:   http://localhost:52438/\r\n");
    expect(h.urls()).toEqual(["http://localhost:52438"]);
  });

  it("SARILAN satırda adres ikiye bölünmüyor", async () => {
    /*
     * BİLDİRİLEN HATA: şeritte portsuz bir `localhost` rozeti çıkıyordu.
     *
     * ASP.NET günlük satırları uzun; terminal genişliğinde bitmiyor ve xterm
     * devamını ayrı bir tampon satırında tutuyor. Tarama her satırın sonuna
     * satır sonu koyunca adres tam ortasından ikiye bölünüyordu ve ilk parça
     * (`http://localhost`) TEK BAŞINA geçerli bir adres olduğu için sessizce
     * rozete dönüşüyordu. Yani belirti "adres bulunamadı" değil, yanlış adres
     * göstermekti — daha kötüsü, çünkü sessiz.
     *
     * Dolgu 84 karakter: 100 sütunluk terminalde kırılma tam
     * `http://localhost` ile `:1452` arasına düşüyor, yani gerçek hatanın
     * bölünme noktası.
     */
    const h = harness();
    h.begin();
    const dolgu = "x".repeat(84);
    await h.out(`${dolgu}http://localhost:1452 devam eden gunluk metni\r\n`);
    expect(h.urls()).toEqual(["http://localhost:1452"]);
  });

  it("sarılmamış iki satır BİRLEŞTİRİLMİYOR", async () => {
    // Ters hata: her satırı yapıştırmak, alt alta duran iki ayrı sözcüğü
    // birleştirip olmayan bir adres uydururdu.
    const h = harness();
    h.begin();
    await h.out("http://localhost\r\n");
    await h.out(":1452/api\r\n");
    expect(h.urls()).toEqual(["http://localhost"]);
  });

  it("EKRAN YENİDEN ÇİZİLİNCE adres tekrar toplanmıyor", async () => {
    // ÖLÇÜLEN BELİRTİ'nin çekirdeği. ConPTY komut başlayınca görünen ekranı
    // yeniden yayımlıyor; eski adres satırı ikinci kez akıştan geçiyor.
    const h = harness();
    h.begin();
    await h.out("  Local:   http://localhost:52438/\r\n");
    expect(h.urls()).toEqual(["http://localhost:52438"]);

    // Komut bitti, liste boşaldı.
    h.end();
    expect(h.urls()).toEqual([]);

    // Yeni komut başladı ve ConPTY ekranı yeniden çizdi: imleci başa alıp
    // aynı içeriği yeniden yazıyor.
    h.begin();
    await h.out(`${ESC}[H  Local:   http://localhost:52438/\r\n`);

    expect(h.urls(), "yeniden çizim eski adresi geri getirdi").toEqual([]);
  });

  it("yeniden çizimden SONRA gelen gerçek yeni adres yakalanıyor", async () => {
    // Kullanıcının son turda bildirdiği ters belirti: eski adres gitti ama
    // yenisi de hiç görünmedi.
    const h = harness();
    h.begin();
    await h.out("  Local:   http://localhost:52438/\r\n");
    h.end();

    h.begin();
    // Yeniden çizim + soru + onay + gerçek yeni sunucu.
    await h.out(`${ESC}[H  Local:   http://localhost:52438/\r\n`);
    await h.out("ng serve\r\n Port 1453 is already in use.\r\n");
    await h.out("Would you like to use a different port? Yes\r\n");
    await h.out("  Local:   http://localhost:57054/\r\n");

    expect(h.urls()).toEqual(["http://localhost:57054"]);
  });

  it("UZUN çıktıda adres kaçmıyor", async () => {
    // Bir ara `baseY` "kırpılma" sanılıp işaret öne çekiliyordu ve aradaki
    // satırlar hiç taranmıyordu; adres tam oraya düşüyor.
    const h = harness();
    h.begin();
    // TEK PARÇA: gerçek akışta da PTY büyük parçalar veriyor, satır satır
    // değil. Hem gerçeğe yakın hem hızlı.
    const derleme = Array.from({ length: 200 }, (_, i) => `derleme satiri ${i}`).join("\r\n");
    await h.out(`${derleme}\r\n`);
    await h.out("  Local:   http://localhost:4200/\r\n");
    const sonraki = Array.from({ length: 200 }, (_, i) => `sonraki satir ${i}`).join("\r\n");
    await h.out(`${sonraki}\r\n`);

    expect(h.urls()).toEqual(["http://localhost:4200"]);
  });

  it("komut çalışmıyorken toplanmıyor", async () => {
    // İstemde bekleyen kabuğun yankısında adres aramanın anlamı yok.
    const h = harness();
    await h.out("  Local:   http://localhost:9999/\r\n");
    expect(h.urls()).toEqual([]);
  });

  it("aynı adres iki kez eklenmiyor", async () => {
    const h = harness();
    h.begin();
    await h.out("  Local:   http://localhost:4200/\r\n");
    await h.out("  Local:   http://localhost:4200/\r\n");
    expect(h.urls()).toEqual(["http://localhost:4200"]);
  });

  it("iki farklı adres sırayla ekleniyor", async () => {
    // Bazı sunucular hem yerel hem ağ adresini yazıyor.
    const h = harness();
    h.begin();
    await h.out("  Local:   http://localhost:4200/\r\n");
    await h.out("  Debug:   http://127.0.0.1:9229/\r\n");
    expect(h.urls()).toEqual(["http://localhost:4200", "http://127.0.0.1:9229"]);
  });

  it("işaret imleçten geri gitmiyor", async () => {
    // İşaret her taramada ileriye gidiyor; geri gitmek satırların iki kez
    // taranması demek ve yeniden çizimi yeniden toplamaya açıyor.
    const h = harness();
    h.begin();
    await h.out("bir\r\n");
    const a = h.scanLine();
    await h.out("iki\r\n");
    const b = h.scanLine();
    expect(b).toBeGreaterThan(a);
  });
});
