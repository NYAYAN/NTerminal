import { useMemo } from "react";

import { diffItems, parseDiff } from "../lib/diff";
import { tp } from "../lib/i18n";

/**
 * Bir stash'teki dosyanın farkı — yalnızca OKUNUR bir görünüm.
 *
 * `ChangeRow`daki fark ile aynı sınıflar ve aynı ayrıştırıcı (`parseDiff`,
 * `diffItems`), yani iki yerde aynı renk ve aynı satır numarası dili. Ama bağlam
 * AÇICILARI yok: onlar dosyanın çalışma ağacındaki hâlinden okuyor ve bir
 * stash'in dosyası çalışma ağacında YOK (ya da başka bir hâlde). Açıcı çizmek,
 * basınca yanlış satırları açan bir düğme olurdu; boşluk satırı yalnızca kaç
 * satırın değişmediğini söylüyor.
 */
export function StashDiff({ text }: { text: string }) {
  const items = useMemo(() => diffItems(parseDiff(text)), [text]);

  return (
    <div className="git-diff">
      {items.map((item, i) => {
        if (item.kind === "line") {
          return (
            <div key={i} className={`diff-line ${item.line.kind}`}>
              <span className="diff-no" aria-hidden="true">
                {item.line.newLine ?? item.line.oldLine ?? ""}
              </span>
              <span className="diff-text">{item.line.text}</span>
            </div>
          );
        }
        // Gizli satır yok (ilk hunk dosyanın başında): çizilecek bir şey de yok.
        if (item.to < item.from) return null;
        return (
          <div key={i} className="diff-gap">
            {/* Boş düğme bloğu: sayı, `ChangeRow`daki şeritle aynı sütundan başlasın. */}
            <span className="diff-gap-actions" />
            <span className="diff-gap-count">{tp("git.unmodifiedLines", item.to - item.from + 1)}</span>
            {item.context && <span className="diff-gap-context">{item.context}</span>}
          </div>
        );
      })}
    </div>
  );
}
