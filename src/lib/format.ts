import { localeTag, t } from "./i18n";

/** Geçmiş listesinde okunabilir zaman: bugünse saat, dünse "dün", öncesi tarih. */
export function formatWhen(ms: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  const now = new Date();
  const locale = localeTag();
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return t("unit.yesterday", { time });

  return `${date.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${time}`;
}

export function formatFullDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(localeTag());
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "";
  if (ms < 1000) return t("unit.ms", { n: ms });
  if (ms < 60_000) {
    const s = ms / 1000;
    return t("unit.sec", { n: s < 10 ? s.toFixed(1) : Math.round(s) });
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return t("unit.minSec", { m: minutes, s: seconds });
  const hours = Math.floor(minutes / 60);
  return t("unit.hourMin", { h: hours, m: minutes % 60 });
}

export function formatBytes(bytes: number): string {
  // Birimler her iki dilde de aynı; yerelleştirilecek bir şey yok.
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Yolun son parçası; sekme başlığı için. */
export function baseName(path: string | null): string {
  if (!path) return "";
  const clean = path.replace(/[\\/]+$/, "");
  const parts = clean.split(/[\\/]/);
  const last = parts[parts.length - 1];
  // "C:" gibi kök yollar için sürücü harfini geri ver.
  return last || clean;
}

/**
 * Yolun KLASÖR kısmı, ayırıcısıyla birlikte; klasör yoksa `null`.
 *
 * `"src/lib/format.ts"` → `"src/"`. Ayırıcı yolun kendisinden alınıyor
 * (`baseName` ile aynı gerekçe): git porcelain eğik çizgi veriyor, Windows
 * yolları ters. Klasörsüz bir dosyada `null` dönüyor, böylece çağıran taraf
 * "boş bir ön ek çizme" kararını ayrıca vermek zorunda kalmıyor.
 */
export function dirName(path: string): string | null {
  const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return at > 0 ? path.slice(0, at + 1) : null;
}

/** Uzun yolları baştan kısaltır: `...\Work\NYAYAN\NTerminal` */
export function shortenPath(path: string | null, maxSegments = 3): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= maxSegments) return path;
  // Ayırıcı YOLUN KENDİSİNDEN alınıyor, platformdan değil: `/Users/ali/proje`
  // mac'te `…\Users\ali\proje` diye gösterilirse yol tanınmaz hâle geliyor.
  // Yolun kendi biçimine bakmak ayrıca içe alınan (import) bir yapılandırmadan
  // gelen Windows yolunu mac'te de doğru gösteriyor.
  const sep = path.includes("\\") && !path.includes("/") ? "\\" : "/";
  return `…${sep}${parts.slice(-maxSegments).join(sep)}`;
}

/**
 * Basit alt dizi eşleşmesi (fuzzy): aranan harflerin sırayla geçmesi yeterli.
 * Eşleşirse puan döner (küçük = daha iyi), eşleşmezse null.
 */
export function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  const direct = haystack.indexOf(needle);
  if (direct !== -1) return direct; // tam alt dizi: en iyi puanlar

  let score = 1000;
  let at = 0;
  for (const ch of needle) {
    const found = haystack.indexOf(ch, at);
    if (found === -1) return null;
    score += found - at;
    at = found + 1;
  }
  return score;
}

/**
 * Dosya listesini sorguya göre süzer ve EN IYI EŞLEŞME ÖNCE sıralar.
 *
 * ÖLÇÜLEN HATA: Ctrl+P'de "environment" yazınca eşleşen dosya listenin EN
 * SONUNDA kalıyordu. Sebep sıralamanın ters yazılmasıydı (`b.score - a.score`).
 * `fuzzyScore` KÜÇÜK puanı iyi sayıyor — tam alt dizi eşleşmesinde harfin
 * bulunduğu konumu döndürüyor, yani 0 en iyi — dolayısıyla azalan sıralama
 * listeyi baş aşağı çeviriyor: en kötü bulanık eşleşmeler başa, tam eşleşme
 * sona gidiyor.
 *
 * İkinci ve daha sinsi sonucu SINIR: kesme sıralamadan SONRA yapıldığı için
 * iki yüzden fazla eşleşme olan bir depoda aranan dosya listeye hiç
 * girmiyordu.
 *
 * Bu yüzden sıralama artık bileşenin içinde değil burada: saf bir işlev
 * olarak testle bağlanabiliyor (`format.test.ts`). Öteki paletler
 * (`CommandPalette`, `FavoritesPanel`, `HistoryRecall`) baştan beri artan
 * sıralıyordu; hata yalnızca dosya paletindeydi.
 */
export function rankFiles(
  files: readonly string[],
  query: string,
  max: number,
): string[] {
  if (!query.trim()) return files.slice(0, max);

  const scored: { path: string; score: number }[] = [];
  for (const path of files) {
    const score = fileScore(path, query);
    if (score !== null) scored.push({ path, score });
  }
  /*
   * Artan: küçük puan = daha iyi eşleşme.
   *
   * Eşitlikte KISA yol önce. Aynı adlı iki dosyada (`target.ts` ve
   * `zzz/aaa/target.ts`) ikisi de adın başında eşleşiyor, yani puanları aynı;
   * köke yakın olan neredeyse her zaman aranan olduğu için sıra ona veriliyor.
   * Bu olmadan sıra girdi listesinin rastgele sırası oluyordu.
   */
  scored.sort((a, b) => a.score - b.score || a.path.length - b.path.length);
  return scored.slice(0, max).map((item) => item.path);
}

/**
 * Dağınık (alt dizi) eşleşmenin yolda kaplayabileceği azami GENİŞLİK katsayısı.
 *
 * Dört: `compgit` yazıp `src/components/GitChanges.tsx` bulmak 7 harfin 16
 * karaktere yayılması demek (2.3x) — bu kalmalı. Kaplama sınırsız olduğunda
 * ise anlamsız sonuçlar giriyor; ölçülen örnek aşağıda.
 */
const MAX_SPREAD = 4;

/**
 * Bir DOSYA YOLUNUN sorguya uygunluğu; eşleşmezse `null`. Küçük = daha iyi.
 *
 * ## Neden `fuzzyScore` değil
 *
 * BİLDİRİLEN HATA: "README.md" yazınca listeye
 * `…/PSReadLine/System.Runtime.InteropServices.RuntimeInformation.dll` de
 * geliyordu. Sebep `fuzzyScore`un ikinci aşaması: harflerin SIRAYLA geçmesi
 * yeterli, ne kadar dağıldığı önemsiz. Ölçülen iz şöyleydi:
 *
 *     r@1  e@12  a@22  d@30  m@52  e@60  .@61  m@83  d@97
 *
 * Yani dokuz harf 97 karaktere yayılmış. Sıralama doğruydu (gerçek dosya 0
 * puanla ilk, bu 1089 ile sonda) ama sonucun listede yeri yoktu.
 *
 * `fuzzyScore` DEĞİŞTİRİLMEDİ: onu komut paleti, favoriler ve geçmiş de
 * kullanıyor ve orada dağınık eşleşme gerçekten işe yarıyor (`cm` →
 * `git commit`). Kural yalnızca dosyalara özel, o yüzden burada.
 *
 * ## Bantlar
 *
 * Sıra bilinçli — kullanıcı ne yazdıysa ona en yakın olan önce:
 *
 *  1. `0+`    dosya ADINDA birebir. Aranan çoğu zaman bu.
 *  2. `200+`  YOLDA birebir (`src/lib` yazmak).
 *  3. `1000+` dosya adında dağınık (`gtchngs` → `GitChanges.tsx`).
 *  4. `2000+` yolda dağınık, AMA yalnızca sıkışıksa (bkz. `MAX_SPREAD`).
 *
 * Bantlar arası boşluk, alt banttaki iyi bir eşleşmenin üst bantta kötü bir
 * eşleşmeyi geçmesini engelliyor.
 */
export function fileScore(path: string, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const lower = path.toLowerCase();
  const name = baseName(path).toLowerCase();

  const inName = name.indexOf(q);
  if (inName !== -1) return inName;

  const inPath = lower.indexOf(q);
  if (inPath !== -1) return 200 + inPath;

  const nameSub = subsequence(name, q);
  if (nameSub) return 1000 + nameSub.spread;

  const pathSub = subsequence(lower, q);
  if (pathSub && pathSub.span <= q.length * MAX_SPREAD) return 2000 + pathSub.spread;

  return null;
}

/**
 * Harfler sırayla geçiyor mu; geçiyorsa ne kadar dağıldığı.
 *
 * `spread` atlanan harf sayısı (sıralama için), `span` ilk ve son eşleşme
 * arasındaki toplam genişlik (yoğunluk sınırı için). İkisi ayrı: `spread`
 * "ne kadar kötü", `span` "ne kadar uzağa yayıldı" sorusunu yanıtlıyor.
 */
function subsequence(text: string, query: string): { spread: number; span: number } | null {
  let at = 0;
  let first = -1;
  let last = -1;
  let spread = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, at);
    if (found === -1) return null;
    if (first === -1) first = found;
    last = found;
    spread += found - at;
    at = found + 1;
  }
  return { spread, span: last - first + 1 };
}
