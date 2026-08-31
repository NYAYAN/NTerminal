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

/** Yerel sayılan ana makine adları. */
const YEREL = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "::"]);

/**
 * Metindeki yerel sunucu adreslerini çıkarır — göründükleri sırada, tekrarsız.
 *
 * ANSI kaçışları temizleniyor: çıktı renkli geliyor ve `\x1b[32m` gibi diziler
 * adresin ortasına giriyor. Temizlemeden yapılan eşleşme adresin sonunu
 * kaçırıyor.
 */
export function extractServerUrls(text: string, limit = 4): string[] {
  // ANSI CSI dizileri: ESC [ ... harf
  const temiz = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
  const out: string[] = [];
  const seen = new Set<string>();

  for (const match of temiz.matchAll(/https?:\/\/[^\s"'<>()\[\]]+/gi)) {
    const url = match[0].replace(/[.,;:]+$/, "");
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (!YEREL.has(host)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
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
