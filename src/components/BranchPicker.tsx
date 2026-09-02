import { useEffect, useMemo, useRef, useState } from "react";

import { checkoutCommand, filterBranches } from "../lib/branches";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { anchorAbove } from "../lib/popover";
import type { GitBranch } from "../types";
import { BranchIcon } from "./Icons";

/**
 * Dal seçici — dal rozetine tıklayınca açılıyor.
 *
 * ## Geçiş neden ÇALIŞTIRILIYOR
 *
 * Değişen dosyalar listesinde bir dosyaya tıklamak komutu satıra YAZIYOR,
 * çalıştırmıyor: `git diff` çıktısı uzun ve kullanıcı ne isteyeceğine karar
 * vermeli. Dal geçişi öyle değil — tek bir sonucu var ve `git checkout`
 * kendisi güvenli: çalışma ağacındaki değişiklikleri ezecekse git zaten
 * reddediyor. Geri dönüş de aynı komutla bir adım.
 *
 * Komut kabuktan geçiyor, uygulamanın içinden değil: geçmişte kaydı kalıyor,
 * çıktısı ekranda görünüyor ve hata olursa kullanıcı sebebini okuyor.
 *
 * ## Uzak dallar
 *
 * `git fetch` ile gelen dallar da listede; yanlarında uzağın adı etiket
 * olarak duruyor. Seçilince `git checkout --track origin/ad` gidiyor: yerel
 * bir izleme dalı oluşuyor ve bunu komutun kendisi söylüyor. Liste her
 * açılışta yeniden okunuyor, önbellek yok — fetch sonrası tıklamak yetiyor.
 */
export function BranchPicker({
  cwd,
  current,
  onClose,
}: {
  cwd: string;
  current: string;
  onClose: () => void;
}) {
  const t = useT();
  const [list, setList] = useState<GitBranch[] | null>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api
      .gitBranches(cwd)
      .then((l) => !cancelled && setList(l))
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => anchorAbove(boxRef.current, ".ctx-chip.branch"), [list]);

  const rows = useMemo(() => filterBranches(list ?? [], query), [list, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const gecis = (branch: GitBranch) => {
    // Zaten o daldaysak komut göndermenin anlamı yok; kabuk "already on"
    // yazıp geçiyor ve geçmişe boş bir kayıt giriyor.
    if (branch.remote || branch.name !== current) {
      useStore.getState().insertCommand(checkoutCommand(branch), true);
    }
    onClose();
  };

  return (
    <div className="overlay popover-overlay" onMouseDown={onClose}>
      <div
        ref={boxRef}
        className="pop-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (rows.length === 0) return;
            const yon = e.key === "ArrowDown" ? 1 : -1;
            setIndex((i) => (((i + yon) % rows.length) + rows.length) % rows.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const row = rows[index];
            if (row) gecis(row);
          }
        }}
      >
        <input
          ref={inputRef}
          className="pop-search"
          value={query}
          placeholder={t("git.searchBranch")}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        <div className="pop-list">
          {list === null && <div className="pop-empty">{t("common.loading")}</div>}
          {list !== null && rows.length === 0 && (
            <div className="pop-empty">{t("git.noBranch")}</div>
          )}
          {rows.map((b, i) => (
            <button
              key={b.remote ? `${b.remote}/${b.name}` : b.name}
              type="button"
              className={i === index ? "pop-row on" : "pop-row"}
              title={b.remote ? t("git.remoteHint") : undefined}
              onMouseEnter={() => setIndex(i)}
              onClick={() => gecis(b)}
            >
              <span className="pop-mark" aria-hidden="true">
                <BranchIcon size={12} />
              </span>
              {b.name}
              {/* Bulunduğun dal işaretli: listede onu ararken "hangisindeyim"
                  sorusunu rozete geri dönüp sormak gerekmesin. */}
              {!b.remote && b.name === current && (
                <span className="pop-tag">{t("git.currentBranch")}</span>
              )}
              {/* Uzak dal: etiket uzağın adı. Bu satırı seçmek yerel dal
                  oluşturuyor; farkı görünür kılmak gerekiyor. */}
              {b.remote && <span className="pop-tag remote">{b.remote}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
