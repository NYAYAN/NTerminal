/**
 * Birleşik fark (unified diff) çıktısının satır satır sınıflandırılması.
 *
 * Her satırın NE olduğunu ve KAÇINCI satır olduğunu söylüyor: arayüz onu doğru
 * renkte çizsin ve solda numarasını yazabilsin.
 *
 * ## Numaralar neden burada hesaplanıyor
 *
 * Fark metninde satır numarası YOK; yalnızca hunk başlığında (`@@ -a,b +c,d @@`)
 * başlangıç numaraları duruyor, gerisi sayılarak bulunuyor. Sayma kuralı satır
 * türüne göre değişiyor — bağlam satırı iki sayacı da ilerletir, ekleme
 * yalnızca yeniyi, silme yalnızca eskiyi. Bunu çizim sırasında yapmak aynı
 * sayacı React'in yeniden çizim döngüsünde tutmak demekti; saf bir geçişte
 * yapmak hem bir kez oluyor hem test edilebiliyor.
 *
 * ## Neden sıra önemli
 *
 * `+++ b/dosya` ve `--- a/dosya` başlık satırları `+` ve `-` ile başlıyor, yani
 * naif bir kural onları "eklenen" ve "silinen" satır sayıyor ve dosya adını
 * yeşile boyuyor. Başlık denetimi ekleme/silme denetiminden ÖNCE olmak zorunda.
 */

export type DiffKind = "add" | "del" | "hunk" | "meta" | "same";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** Satırın ESKİ dosyadaki numarası; eklenen satırda ve başlıkta `null`. */
  oldLine: number | null;
  /** Satırın YENİ dosyadaki numarası; silinen satırda ve başlıkta `null`. */
  newLine: number | null;
}

/** `@@ -a,b +c,d @@` başlığından sayaçların başlangıcı. */
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Hunk başlığının YENİ dosyadaki başlangıç satırı; başlık değilse `null`.
 *
 * `parseDiff` de aynı düzeni okuyor ama sonucu satır sayaçlarına gömüyor;
 * boşlukları bulmak için başlangıç numarasının kendisi gerekiyor.
 */
export function hunkNewStart(text: string): number | null {
  const m = HUNK.exec(text);
  return m ? Number(m[2]) : null;
}

/** `@@ -a,b +c,d @@ <bağlam>` — başlıktan sonraki serbest metin. */
export function hunkContext(text: string): string {
  const at = text.indexOf("@@", 2);
  return at === -1 ? "" : text.slice(at + 2).trim();
}

/** Farkı satırlara ayırır ve her satırı sınıflandırır. */
export function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = [];
  /*
   * Hunk başlığı görülene kadar numara YOK.
   *
   * Her fark hunk içermiyor: ikili dosya bildirimi ("Binary files differ") ve
   * yalnızca kip değişikliği olan farklar başlıktan ibaret. Sayacı sıfırdan
   * yürütmek oralarda uydurma numaralar üretirdi.
   */
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;

  for (const raw of text.split("\n")) {
    // Boş satır atlanıyor. `split` sonda her zaman bir tane üretiyor ve onu
    // çizmek farkın altına gereksiz bir boşluk satırı ekliyor; boş girdide de
    // tek elemanlı bir liste dönerdi.
    //
    // Farkın İÇİNDEKİ boş satırlar kaybolmuyor: git bağlam satırlarını bir
    // boşlukla veriyor, yani gerçekten boş bir satır `" "` olarak geliyor.
    if (raw === "") continue;

    if (raw.startsWith("@@")) {
      const m = HUNK.exec(raw);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
        inHunk = true;
      }
      out.push({ kind: "hunk", text: raw, oldLine: null, newLine: null });
      continue;
    }
    // ÖNCE başlıklar: `+++`/`---` ekleme/silme sanılmamalı.
    if (
      raw.startsWith("+++") ||
      raw.startsWith("---") ||
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("new file") ||
      raw.startsWith("deleted file") ||
      raw.startsWith("rename ") ||
      raw.startsWith("similarity ") ||
      raw.startsWith("old mode") ||
      raw.startsWith("new mode") ||
      raw.startsWith("Binary files")
    ) {
      out.push({ kind: "meta", text: raw, oldLine: null, newLine: null });
      continue;
    }
    if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw, oldLine: null, newLine: inHunk ? newNo++ : null });
      continue;
    }
    if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw, oldLine: inHunk ? oldNo++ : null, newLine: null });
      continue;
    }
    /*
     * `\ No newline at end of file` bir SATIR DEĞİL, bir nottur.
     *
     * Sayacı ilerletirse ondan sonraki bütün numaralar bir kayar — ve bu not
     * dosyanın sonunda geldiği için hata gözden kaçmaya çok müsait.
     */
    if (raw.startsWith("\\")) {
      out.push({ kind: "same", text: raw, oldLine: null, newLine: null });
      continue;
    }
    // Bağlam satırı İKİ sayacı da ilerletiyor: numaralamanın çekirdeği bu.
    out.push({
      kind: "same",
      text: raw,
      oldLine: inHunk ? oldNo++ : null,
      newLine: inHunk ? newNo++ : null,
    });
  }

  return out;
}

/**
 * Farkın eklenen/silinen satır sayısı.
 *
 * Rozet için: `+481 -103`. Başlık satırları sayılmıyor — `parseDiff` onları
 * `meta` olarak ayırdığı için burada ayrı bir denetim gerekmiyor.
 */
export function diffStat(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "del") removed += 1;
  }
  return { added, removed };
}

// ------------------------------------------------------- bağlam açıcıları

/**
 * Başlık satırı YALNIZCA dosya adını mı tekrarlıyor?
 *
 * `git diff` her farkın başına dört beş satırlık bir künye koyuyor. Bir
 * terminalde bunlar gerekli — hangi dosyaya baktığını başka nereden
 * bileceksin? Panelde ise dosya adı satırın BAŞLIĞINDA zaten yazıyor, üstelik
 * bu künye dört satırla dar bir panelde görünen farkın üçte birini yiyor.
 *
 * Ayrım "meta mı değil mi" değil, "başka yerde yazıyor mu": aşağıdakiler
 * KALIYOR, çünkü tek kaynakları bu satırlar —
 *
 *   `Binary files … differ`   ikili dosyada farkın TAMAMI bu; atılırsa fark
 *                             bomboş görünür
 *   `rename from` / `to`      satır başlığı yalnızca YENİ adı gösteriyor,
 *                             eski ad yalnızca burada
 *   `similarity index`        yeniden adlandırmanın ne kadar benzediği
 *   `old mode` / `new mode`   izin değişikliği tek başına bir fark olabiliyor
 *                             (chmod +x) ve başka hiçbir yerde görünmüyor
 */
export function isRedundantHeader(text: string): boolean {
  return (
    text.startsWith("diff --git") ||
    text.startsWith("index ") ||
    text.startsWith("--- ") ||
    text.startsWith("+++ ") ||
    text.startsWith("new file mode") ||
    text.startsWith("deleted file mode")
  );
}

/**
 * Fark görünümünde çizilen tek bir öğe.
 *
 * `git diff` varsayılan olarak değişen satırların çevresinde üç satır bağlam
 * veriyor; arası GİZLİ kalıyor. Kullanıcının isteği o araları açabilmekti,
 * "yukarıda ve aşağıda 50 satırlık kod açma butonları". Bu tip, farkın
 * satırları ile o boşlukları tek bir listede yan yana taşıyor.
 */
export type DiffItem =
  | { kind: "line"; line: DiffLine }
  | {
      kind: "gap";
      /** İlk gizli satır (YENİ dosya numarası). */
      from: number;
      /** Son gizli satır. `to < from` ise gizli satır yok. */
      to: number;
      /** Yerini aldığı hunk başlığının bağlam metni; dosya sonundaki boşlukta yok. */
      context: string;
    };

/**
 * Farkı, aradaki gizli aralıklarla birlikte çizilecek öğelere çevirir.
 *
 * ## Hunk başlığı neden kayboluyor
 *
 * `@@ -10,7 +10,8 @@` satırı iki şey söylüyor: burada bir kopukluk var ve
 * kopukluğun yeri. İlkini boşluk satırı zaten söylüyor (üstelik KAÇ satır
 * olduğunu da), ikincisi ise soldaki numara sütununda yazıyor. İkisini üst
 * üste çizmek aynı bilgiyi iki kez göstermek olurdu; başlığın tek özgün
 * parçası olan bağlam metni (`export function App()`) boşluk satırının sağına
 * taşındı.
 *
 * ## `total` neden ayrı geliyor
 *
 * Fark, dosyanın KAÇ satır olduğunu söylemiyor — son hunk'ın nerede bittiğini
 * söylüyor. Dosyanın sonunda gizli satır kalıp kalmadığı ancak dosyanın
 * kendisi okunduğunda biliniyor; okunmadıysa (`null`) sondaki boşluk hiç
 * çizilmiyor. Var olmayabilecek bir şey için düğme göstermek, basınca hiçbir
 * şey açmayan bir düğme demek.
 */
export function diffItems(
  lines: readonly DiffLine[],
  total: number | null = null,
): DiffItem[] {
  const out: DiffItem[] = [];
  let lastNew = 0;
  let seenHunk = false;

  for (const line of lines) {
    if (line.kind === "hunk") {
      const start = hunkNewStart(line.text);
      if (start === null) {
        // Ayrıştırılamayan başlık olduğu gibi çiziliyor: uydurma bir boşluk
        // göstermektense ham satırı göstermek dürüst.
        out.push({ kind: "line", line });
        continue;
      }
      out.push({
        kind: "gap",
        from: lastNew + 1,
        to: start - 1,
        context: hunkContext(line.text),
      });
      seenHunk = true;
      continue;
    }
    // Dosya adını tekrarlayan künye satırları çizilmiyor (bkz.
    // `isRedundantHeader`); bilgi taşıyanlar duruyor.
    if (line.kind === "meta" && isRedundantHeader(line.text)) continue;
    if (line.newLine !== null) lastNew = line.newLine;
    out.push({ kind: "line", line });
  }

  if (seenHunk && total !== null && total > lastNew) {
    out.push({ kind: "gap", from: lastNew + 1, to: total, context: "" });
  }

  return out;
}

/** Bir boşluğun açılmış ve hâlâ gizli parçaları. */
export interface GapSplit {
  /** Açıcı satırın ÜSTÜNDE çizilecek satırlar. */
  top: { from: number; to: number } | null;
  /** Hâlâ gizli olanlar; `null` ise boşluk tümüyle açılmış. */
  hidden: { from: number; to: number } | null;
  /** Açıcı satırın ALTINDA çizilecek satırlar. */
  bottom: { from: number; to: number } | null;
}

/**
 * Boşluğu, açılmış miktarlara göre üçe böler.
 *
 * `top` açıcı satırın üstünde kaç satır açıldığı, `bottom` altında kaç satır.
 * Adlar EKRANDAKİ yöne göre: yukarı oka basan kullanıcı satırların düğmenin
 * üstünde belirmesini bekliyor. (Bir ara "önceki hunk'tan aşağı" gibi
 * kaynağa göre adlandırılmıştı ve okla ters düşüyordu.)
 *
 * İkisi ortada buluşunca boşluk kapanıyor ve açıcı satır kayboluyor — açacak
 * bir şey kalmadığında düğme de kalmamalı.
 *
 * Saf ve ayrı: kenar durumları (tek satırlık boşluk, iki taraftan taşan
 * açılma) çizim sırasında denemesi zor, burada kolay.
 */
export function splitGap(
  gap: { from: number; to: number },
  top: number,
  bottom: number,
): GapSplit {
  const count = gap.to - gap.from + 1;
  if (count <= 0) return { top: null, hidden: null, bottom: null };

  // İki taraf toplamı boşluğu aşarsa aradaki gizli parça yok; alttaki açılma
  // kırpılıyor ki aynı satır iki kez çizilmesin.
  const topCount = Math.min(Math.max(0, top), count);
  const bottomCount = Math.min(Math.max(0, bottom), count - topCount);
  const hiddenCount = count - topCount - bottomCount;

  return {
    top: topCount > 0 ? { from: gap.from, to: gap.from + topCount - 1 } : null,
    hidden:
      hiddenCount > 0 ? { from: gap.from + topCount, to: gap.to - bottomCount } : null,
    bottom: bottomCount > 0 ? { from: gap.to - bottomCount + 1, to: gap.to } : null,
  };
}

/**
 * Dosyanın satırlarından bir aralığı fark satırına çevirir.
 *
 * Metin bir BOŞLUKLA başlıyor: birleşik farkta bağlam satırlarının biçimi bu
 * ve çizim satırı olduğu gibi basıyor. Boşluk olmadan açılan satırlar
 * değişenlere göre bir karakter sola kayardı.
 *
 * Numara YALNIZCA yeni tarafa yazılıyor. Açılan bölge iki tarafta da aynı
 * ama eski numara ancak hunk başlığındaki kaymayla bulunabilir; görünen
 * sütun yeni numarayı gösterdiği için o kayma bir işe yaramadan taşınırdı.
 */
export function contextLines(
  fileLines: readonly string[],
  from: number,
  to: number,
): DiffLine[] {
  const out: DiffLine[] = [];
  for (let n = Math.max(1, from); n <= Math.min(to, fileLines.length); n++) {
    out.push({ kind: "same", text: ` ${fileLines[n - 1]}`, oldLine: null, newLine: n });
  }
  return out;
}
