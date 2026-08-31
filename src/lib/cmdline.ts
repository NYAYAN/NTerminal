/**
 * Komut satırının parçalara ayrılması — renklendirme için.
 *
 * ## Amaç dar, bilinçli
 *
 * Bu bir kabuk ayrıştırıcısı DEĞİL ve olmaya çalışmıyor. Amaç tek: yazarken
 * "komut adı hangisi, bayrak hangisi, tırnak nerede kapandı" sorularının
 * gözle yanıtlanması. Yanlış ayırmanın bedeli yalnızca yanlış renk; komut yine
 * kabuğa olduğu gibi gidiyor.
 *
 * Bu yüzden değişken genişletme, alt kabuk, `$()`, kaçış kuralları, kabuk
 * lehçeleri (PowerShell ile bash'in tırnak kuralları aynı değil) hiç ele
 * alınmıyor. Doğru ayrıştırmayı kabuk yapıyor, biz yalnızca boyuyoruz.
 *
 * ## Neden ilk sözcük ayrı
 *
 * Ekranda en çok işe yarayan ayrım bu: satıra bakınca "ne çalışacak" bir
 * bakışta okunuyor. Boru ve `&&` sonrasında da yeni bir komut başlıyor, orada
 * da aynı vurgu veriliyor — `git log | grep hata` satırında `grep` de komut.
 */

export type TokenKind = "cmd" | "flag" | "str" | "op" | "plain";

export interface Token {
  text: string;
  kind: TokenKind;
}

/** Yeni bir komutun başladığını gösteren işleçler. */
const YENI_KOMUT = new Set(["|", "||", "&&", ";", "|&"]);

/** İşleç karakterleri; en uzun eşleşme önce denenmeli. */
const ISLECLER = ["&&", "||", "|&", ">>", "2>", "|", ">", "<", ";"];

/**
 * Metni belirteçlere ayırır.
 *
 * Boşluklar da döndürülüyor (`plain`): çıktının birleşimi girdiye BİREBİR eşit
 * olmak zorunda. Renklendirme saydam bir metin kutusunun ARKASINA çiziliyor;
 * bir tek boşluk kaybolsa yazdığınız harfler renkli katmanla kayar ve imleç
 * yanlış yerde görünür.
 */
export function tokenizeCommand(text: string): Token[] {
  const out: Token[] = [];
  // Satır başı ve her işleçten sonra: sıradaki sözcük komut adı.
  let komutBekleniyor = true;
  let i = 0;

  const ekle = (chunk: string, kind: TokenKind) => {
    if (!chunk) return;
    const son = out[out.length - 1];
    if (son && son.kind === kind) son.text += chunk;
    else out.push({ text: chunk, kind });
  };

  while (i < text.length) {
    const ch = text[i];

    // Boşluk: komut beklentisini BOZMUYOR, yalnızca sözcükleri ayırıyor.
    if (ch === " " || ch === "\t" || ch === "\n") {
      ekle(ch, "plain");
      i += 1;
      continue;
    }

    // Tırnak. Kapanmamış tırnak satır sonuna kadar sürüyor — ekranda bunu
    // görmek zaten istenen: "tırnağı kapatmadım" hatası renkten anlaşılıyor.
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += 1;
      ekle(text.slice(i, Math.min(j + 1, text.length)), "str");
      i = j + 1;
      komutBekleniyor = false;
      continue;
    }

    const islec = ISLECLER.find((op) => text.startsWith(op, i));
    if (islec) {
      ekle(islec, "op");
      i += islec.length;
      komutBekleniyor = YENI_KOMUT.has(islec);
      continue;
    }

    // Sözcük: bir sonraki boşluğa, tırnağa ya da işlece kadar.
    let j = i;
    while (j < text.length) {
      const c = text[j];
      if (c === " " || c === "\t" || c === "\n" || c === '"' || c === "'") break;
      if (ISLECLER.some((op) => text.startsWith(op, j))) break;
      j += 1;
    }
    const word = text.slice(i, j);
    if (komutBekleniyor) {
      ekle(word, "cmd");
      komutBekleniyor = false;
    } else if (word.startsWith("-")) {
      // Tek başına `-` bayrak değil (çoğu araçta "standart girdi" demek), ama
      // ayırmaya değmez: renk yanlış çıksa bile komut doğru çalışıyor.
      ekle(word, "flag");
    } else {
      ekle(word, "plain");
    }
    i = j;
  }

  return out;
}
