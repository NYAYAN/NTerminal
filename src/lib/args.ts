/**
 * Profil argümanları: metin kutusu ↔ dizi.
 *
 * Rust argümanları kabuğa DİZİ olarak veriyor (`argv`), bir kabuk satırı olarak
 * değil; yani buradaki ayrıştırma bir kabuk değil, yalnızca kutudaki metni
 * öğelere bölmenin yolu.
 *
 * ## Neden ayrı bir modül
 *
 * BİLDİRİLEN HATA (ölçüldü): kutu her tuşta metni boşluktan bölüp boşları
 * atıyor, sonra diziyi yeniden birleştirip kutuya geri yazıyordu. Sondaki
 * boşluk o turda kayboluyordu: "-l -i" yazmak "-l-i" üretiyordu, ikinci bir
 * argüman yazmanın tek yolu boşluğu araya sonradan eklemekti. Boşluk içeren
 * bir argüman (`"C:\Program Files\..."`) ise hiç yazılamıyordu.
 *
 * Kutu artık kendi metnini tutuyor (bkz. `ArgsInput`); burası yalnızca bölme
 * ve geri yazma kuralı: tırnak içi tek argüman, ters bölü kaçış DEĞİL —
 * Windows yollarında ayırıcı o.
 */
export function parseArgs(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  // `""` boş bir argüman: tırnak açılmışsa öğe var demek, içi boş olsa da.
  let started = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) {
        out.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += ch;
    started = true;
  }
  // Kapanmamış tırnak: yazarken ara hâl, içerik yine de argüman.
  if (started) out.push(current);
  return out;
}

/** Diziyi kutuya yazılacak metne çevirir; `parseArgs` ile gidiş-dönüş aynı. */
export function formatArgs(args: readonly string[]): string {
  return args.map(quoteIfNeeded).join(" ");
}

function quoteIfNeeded(arg: string): string {
  if (arg !== "" && !/[\s"']/.test(arg)) return arg;
  // Çift tırnak içeren argüman tek tırnakla sarılıyor; ikisini birden içeren
  // bir argümanı bu söz dizimi taşıyamıyor (kaçış yok) — pratikte yok.
  return arg.includes('"') ? `'${arg}'` : `"${arg}"`;
}

/** İki argüman dizisi aynı mı. */
export function sameArgs(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
