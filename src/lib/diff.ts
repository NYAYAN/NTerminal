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
