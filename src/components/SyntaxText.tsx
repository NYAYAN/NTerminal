import { memo, type ReactNode } from "react";

import type { LineTokens } from "../lib/syntax";
import { SYNTAX_CLASSES } from "../lib/syntaxScopes";

/**
 * Satırın `[from, to)` aralığı, belirteçleri `.syn-<tür>` sınıflı `span`larla.
 *
 * Belirteç yoksa (dil tanınmıyor, henüz gelmedi) metnin kendisi: renklendirme
 * gecikince satır boş değil düz görünüyor.
 */
export function tokenSpans(line: string, tokens: LineTokens | undefined, from = 0, to = line.length): ReactNode {
  if (!tokens || tokens.length === 0) return line.slice(from, to);
  const out: ReactNode[] = [];
  let pos = from;
  for (let k = 0; k < tokens.length; k += 2) {
    const start = Math.max(tokens[k], pos);
    const end = Math.min(k + 2 < tokens.length ? tokens[k + 2] : line.length, to);
    if (end <= start) continue;
    if (start > pos) out.push(line.slice(pos, start));
    const cls = SYNTAX_CLASSES[tokens[k + 1]];
    const text = line.slice(start, end);
    out.push(
      cls ? (
        <span key={start} className={`syn-${cls}`}>
          {text}
        </span>
      ) : (
        text
      ),
    );
    pos = end;
  }
  if (pos < to) out.push(line.slice(pos, to));
  return out;
}

/**
 * Satırların dilim boyu. Her dilim, satırlarından biri değişmedikçe yeniden
 * çizilmiyor: bir harf yazmak satır sayısı kadar değil, dilim sayısı + bir
 * dilim kadar iş.
 *
 * ÖLÇÜLDÜ (geliştirme yapısı, harften ekrana): dilimsiz renkli katmanda
 * 1.570 satırlık dosyada tuş başına 46 ms, 7.940 satırlıkta 120 ms — renksiz
 * yazı alanında 15 ve 21 ms. Her tuşta bütün satırların öğesi yeniden
 * kuruluyordu.
 */
export const CHUNK = 64;

/** `[from, to)` dilimindeki satırlar aynı mı (dilimin yeniden çizilmesi gerekmiyor mu)? */
export function sameLines(
  from: number,
  to: number,
  a: readonly unknown[],
  b: readonly unknown[],
): boolean {
  for (let i = from; i < to; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Düzenlerken yazı alanının ALTINDAKİ renkli katmanın bir satırı.
 *
 * Satır kendi kutusu değil: dilimin içinde `\n` ile ayrılıyor, yazı alanı da
 * satırlarını böyle diziyor. Kesirli satır yüksekliğinde satır başına ayrı
 * kutular binlerce satır sonra yazı alanından kayıyordu (aynı gerekçe numara
 * sütununda, bkz. `FileViewer`).
 */
const LayerLine = memo(function LayerLine({
  text,
  tokens,
  last,
}: {
  text: string;
  tokens: LineTokens | undefined;
  /** Dilimin son satırı: ardından `\n` yok. */
  last: boolean;
}) {
  // Dilim boş bir satırla bitiyorsa satır kutusu oluşmuyor (bloğun sonundaki
  // `\n` satır açmıyor) ve sonraki dilimler bir satır yukarı kayardı.
  // Genişliksiz boşluk satırı tutuyor, yatayda yer kaplamıyor.
  if (last && !text) return "​";
  return (
    <>
      {tokenSpans(text, tokens)}
      {last ? null : "\n"}
    </>
  );
});

interface LayerProps {
  lines: readonly string[];
  tokens: readonly (LineTokens | undefined)[];
  keys: readonly number[];
}

/**
 * Katmanın bir dilimi: AYRI bir blok. Tek bir `pre`de bir harf bile bütün
 * satırların satır kırma hesabını baştan yaptırıyordu. ÖLÇÜLDÜ (geliştirme
 * yapısı, 7.940 satır): tek blokta harften ekrana 87 ms. Dilim bloğunun
 * yüksekliği satır kutularının toplamı; satır kutusu da yazı alanınınkiyle
 * aynı yuvarlamadan geçiyor, dilimler arasında kayma birikmiyor.
 */
const LayerChunk = memo(
  function LayerChunk({ from, to, lines, tokens, keys }: LayerProps & { from: number; to: number }) {
    const out = [];
    for (let i = from; i < to; i++) {
      out.push(<LayerLine key={keys[i]} text={lines[i]} tokens={tokens[i]} last={i === to - 1} />);
    }
    return <div className="viewer-hl-part">{out}</div>;
  },
  (a, b) =>
    a.from === b.from &&
    a.to === b.to &&
    sameLines(a.from, a.to, a.lines, b.lines) &&
    sameLines(a.from, a.to, a.tokens, b.tokens) &&
    sameLines(a.from, a.to, a.keys, b.keys),
);

/** Düzenlerken yazı alanının altındaki renkli katman (`.viewer-hl`). */
export function CodeLayer({ lines, tokens, keys }: LayerProps) {
  const chunks = [];
  for (let from = 0; from < lines.length; from += CHUNK) {
    chunks.push(
      <LayerChunk
        key={from}
        from={from}
        to={Math.min(from + CHUNK, lines.length)}
        lines={lines}
        tokens={tokens}
        keys={keys}
      />,
    );
  }
  return (
    <div className="viewer-hl" aria-hidden="true">
      {chunks}
    </div>
  );
}
