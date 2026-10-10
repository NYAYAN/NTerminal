/**
 * Çalışan komutun çıktısındaki adresleri yakalar.
 *
 * ## Neden var
 *
 * Bir sunucu başlattığınızda adres bir kez, en başta yazılıyor:
 * `Now listening on: http://localhost:5000`. Sonra loglar akmaya başlıyor ve o
 * satır yukarı süzülüyor. Adrese bakmak için kaydırmak gerekiyor, uzun süren
 * bir işte de kaydırma geçmişinden büsbütün düşüyor — adres KAYBOLUYOR.
 *
 * Çözüm adresi çıktıdan ayırıp sabit bir yerde tutmak. Terminalin kendisine
 * dokunmuyoruz; yalnızca akan metinden okuyup bir kenara yazıyoruz.
 *
 * ## Neden yalnızca yerel adresler
 *
 * Loglar her türlü bağlantıyı içeriyor: paket kayıtları, belge adresleri, hata
 * izlerindeki github bağlantıları. Hepsini toplamak listeyi gürültüye çeviriyor
 * ve asıl aranan (bu makinede açılan port) arada kayboluyor. Aranan şey
 * "buradan erişilen sunucu", o da yerel bir ana makine adı demek.
 */

/**
 * Yerel sayılan ana makine adları.
 *
 * IPv6 adresleri KÖŞELİ PARANTEZLE yazılıyor: `new URL(...).hostname` bir IPv6
 * adresi için `[::1]` döndürüyor, `::1` değil. Listede bir süre parantezsiz
 * biçimler duruyordu ve hiçbir zaman eşleşmediler — ölçülen sonuç: ASP.NET'in
 * `Now listening on: http://[::]:1452` satırı hiç tanınmıyor ve arka uç
 * başlatan kullanıcıya sunucu şeridi HİÇ çıkmıyordu.
 */
const YEREL = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "[::]"]);

/**
 * "Bütün arayüzler" anlamına gelen ana makine adları.
 *
 * Sunucu bunları dinlediğini söylüyor ama tarayıcıya YAZILAMIYOR:
 * `http://[::]:1452` ya da `http://0.0.0.0:5000` gezinilebilir bir adres
 * değil. Kullanıcının aradığı şey "bu porta nasıl erişirim" ve cevabı her
 * zaman `localhost`. Rozet de onu gösterip onu açıyor.
 */
const JOKER = new Set(["0.0.0.0", "[::]"]);

/**
 * Metindeki yerel sunucu adreslerini çıkarır — göründükleri sırada, tekrarsız.
 *
 * ANSI kaçışları temizleniyor: çıktı renkli geliyor ve `\x1b[32m` gibi diziler
 * adresin ortasına giriyor. Temizlemeden yapılan eşleşme adresin sonunu
 * kaçırıyor.
 *
 * ## Yol atılıyor, KÖKEN tutuluyor
 *
 * ÖLÇÜLEN HATA: `dotnet run` ile açılan bir sunucuda tarayıcıdan uç noktalara
 * istek attıkça şerit doluyordu — `localhost:1453/portal/VehicleList`,
 * `localhost:1453/portal/VehicleAccidentList`, `localhost:1453/port`… Sebep:
 * sunucu her isteği `Request starting HTTP/1.1 GET http://localhost:1453/...`
 * diye günlüğe yazıyor ve her satır YENİ bir adres sayılıyordu. Dört rozetlik
 * yer, bir sunucunun tek adresi yerine aynı sunucunun rastgele yollarıyla
 * doluyordu.
 *
 * Şeridin cevapladığı soru "sunucu hangi adreste", "hangi istekler geldi"
 * değil. Aynı köken (`http://localhost:1453`) tek bir rozet; yol bilgisi
 * atılıyor. Yarım kalmış bir eşleşme (`.../port`) da böylece kendiliğinden
 * doğru yere düşüyor.
 */
export function extractServerUrls(text: string, limit = 4): string[] {
  // ANSI CSI dizileri: ESC [ ... harf
  const temiz = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
  const out: string[] = [];
  const seen = new Set<string>();

  /*
   * Köşeli parantez YALNIZCA ana makine konumunda kabul ediliyor.
   *
   * Gövdedeki `[^...\[\]]` sınıfı parantezleri bilinçli dışlıyor: loglar
   * adresi sık sık sarmalıyor (`[http://localhost:3000]`, `(bkz. http://…)`)
   * ve kapanan parantezi adresin parçası saymak bozuk bir bağlantı üretiyor.
   *
   * Ama IPv6 adresi parantezle yazılıyor — `http://[::]:1452` — ve bu kural
   * onu da kesiyordu: eşleşme `http://`de duruyor, geri kalan hiç okunmuyordu.
   * ÖLÇÜLEN SONUÇ: ASP.NET arka ucu başlatan kullanıcıya sunucu şeridi hiç
   * çıkmıyordu (Angular'da çıkıyordu, çünkü o `localhost` yazıyor).
   *
   * `//`den hemen SONRA gelen bir parantez grubu adresin ana makinesi; başka
   * yerdeki parantez hâlâ dışarıda kalıyor, yani sarmalama davranışı bozulmuyor.
   */
  for (const match of temiz.matchAll(
    /https?:\/\/(?:\[[0-9A-Fa-f:.]+\])?[^\s"'<>()\[\]]*/gi,
  )) {
    const raw = match[0].replace(/[.,;:]+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    const host = parsed.hostname.toLowerCase();
    if (!YEREL.has(host)) continue;
    // Köken = şema + ana makine + port. Yol, sorgu ve parça atılıyor.
    // Joker adres `localhost`a çevriliyor: gerekçesi `JOKER` tanımında.
    const origin = JOKER.has(host)
      ? `${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ""}`
      : parsed.origin;
    if (seen.has(origin)) continue;
    seen.add(origin);
    out.push(origin);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Adresi gösterime hazırlar: şema ve sondaki eğik çizgi atılıyor.
 *
 * Rozet dar bir yer ve `http://` her adreste aynı — yer kaplayıp hiçbir şey
 * ayırt etmiyor. `localhost:5000` tek bakışta okunuyor.
 */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/**
 * Adresin yalnızca PORTU: `http://localhost:5273/` → `:5273`.
 *
 * Kokpit'in sekme kartında yer bir rozet kadar ve aynı makinedeki sunucuları
 * ayıran şey port. Portsuz adreste (`http://intranet.local/`) kısa adresin
 * kendisi.
 */
export function portLabel(url: string): string {
  const short = shortUrl(url);
  const port = /:(\d+)(?:[/?#]|$)/.exec(short)?.[1];
  return port ? `:${port}` : short;
}
