import { useEffect, useMemo, useRef, useState } from "react";

import { filterDirs } from "../lib/dirs";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { anchorAbove } from "../lib/popover";
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
  const [names, setNames] = useState<string[] | null>(null);
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
      .then((list) => !cancelled && setNames(list))
      .catch(() => !cancelled && setNames([]));
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => anchorAbove(boxRef.current, ".ctx-chip.branch"), [names]);

  const rows = useMemo(() => filterDirs(names ?? [], query), [names, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const gecis = (branch: string) => {
    // Zaten o daldaysak komut göndermenin anlamı yok; kabuk "already on"
    // yazıp geçiyor ve geçmişe boş bir kayıt giriyor.
    if (branch !== current) {
      useStore.getState().insertCommand(`git checkout ${branch}`, true);
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
          {names === null && <div className="pop-empty">{t("common.loading")}</div>}
          {names !== null && rows.length === 0 && (
            <div className="pop-empty">{t("git.noBranch")}</div>
          )}
          {rows.map((name, i) => (
            <button
              key={name}
              type="button"
              className={i === index ? "pop-row on" : "pop-row"}
              onMouseEnter={() => setIndex(i)}
              onClick={() => gecis(name)}
            >
              <span className="pop-mark" aria-hidden="true">
                <BranchIcon size={12} />
              </span>
              {name}
              {/* Bulunduğun dal işaretli: listede onu ararken "hangisindeyim"
                  sorusunu rozete geri dönüp sormak gerekmesin. */}
              {name === current && <span className="pop-tag">{t("git.currentBranch")}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
