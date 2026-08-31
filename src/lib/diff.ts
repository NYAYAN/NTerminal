/**
 * Birleşik fark (unified diff) çıktısının satır satır sınıflandırılması.
 *
 * Amaç dar: her satırın NE olduğunu söylemek, ki arayüz onu doğru renkte
 * çizsin. Fark ayrıştırmak (hunk'ları eşleştirmek, satır numaraları hesaplamak)
 * gerekmiyor — gösterilecek şey git'in ürettiği metnin kendisi.
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
}

/** Farkı satırlara ayırır ve her satırı sınıflandırır. */
export function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = [];

  for (const raw of text.split("\n")) {
    // Boş satır atlanıyor. `split` sonda her zaman bir tane üretiyor ve onu
    // çizmek farkın altına gereksiz bir boşluk satırı ekliyor; boş girdide de
    // tek elemanlı bir liste dönerdi.
    //
    // Farkın İÇİNDEKİ boş satırlar kaybolmuyor: git bağlam satırlarını bir
    // boşlukla veriyor, yani gerçekten boş bir satır `" "` olarak geliyor.
    if (raw === "") continue;

    if (raw.startsWith("@@")) {
      out.push({ kind: "hunk", text: raw });
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
      out.push({ kind: "meta", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw });
      continue;
    }
    if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw });
      continue;
    }
    out.push({ kind: "same", text: raw });
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
