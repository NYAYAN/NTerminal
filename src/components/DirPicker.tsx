import { useEffect, useMemo, useRef, useState } from "react";

import { filterDirs, joinDir, parentDir } from "../lib/dirs";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { FolderIcon } from "./Icons";

/**
 * Dizin seçici — yol rozetine tıklayınca açılan liste.
 *
 * ## Neden var
 *
 * Başka bir klasöre geçmek için `cd` yazıp yolu hatırlamak ya da sekme
 * tamamlamasıyla harf harf ilerlemek gerekiyordu. Yol zaten ekranda duruyor;
 * ona tıklayıp listeden seçmek aynı işi bir hamlede yapıyor.
 *
 * ## Seçim kabuğa `cd` olarak gidiyor
 *
 * Dizini uygulamanın içinde "değiştirmek" mümkün değil — çalışma dizini
 * kabuğun süreç durumu, bizim değil. Doğru olan da bu: geçmişte `cd` kaydı
 * kalıyor, kabuğun kendi dizin yığını (`pushd`) tutarlı kalıyor ve istem
 * doğal yoldan güncelleniyor.
 */
export function DirPicker({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const t = useT();
  const [names, setNames] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const parent = parentDir(cwd);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api
      .listDirs(cwd)
      .then((list) => !cancelled && setNames(list))
      // Okunamayan bir dizin (izin, ağ sürücüsü kopmuş) seçiciyi kilitlememeli:
      // boş liste gösterip üst dizine çıkma seçeneğini bırakıyoruz.
      .catch(() => !cancelled && setNames([]));
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  /** Üst dizin satırı listenin BAŞINDA: en sık kullanılan hareket o. */
  const rows = useMemo(() => {
    const alt = filterDirs(names ?? [], query).map((name) => ({
      key: name,
      label: name,
      path: joinDir(cwd, name),
      up: false,
    }));
    if (!parent || query.trim()) return alt;
    return [{ key: "..", label: t("dirs.parent"), path: parent, up: true }, ...alt];
  }, [names, query, cwd, parent, t]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  // Seçili satır listeden taşmasın; klavyeyle gezinirken görünür kalmalı.
  useEffect(() => {
    listRef.current?.querySelector(".dir-row.on")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const goto = (path: string) => {
    // `cd` her kabukta var ve boşluklu yol için tırnak gerekiyor.
    useStore.getState().insertCommand(`cd "${path}"`, true);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      const yon = e.key === "ArrowDown" ? 1 : -1;
      setIndex((i) => (((i + yon) % rows.length) + rows.length) % rows.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[index];
      if (row) goto(row.path);
    }
  };

  return (
    <div className="overlay dir-overlay" onMouseDown={onClose}>
      <div className="dir-picker" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="dir-search"
          value={query}
          placeholder={t("dirs.search")}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        <div className="dir-list" ref={listRef}>
          {names === null && <div className="dir-empty">{t("common.loading")}</div>}
          {names !== null && rows.length === 0 && (
            <div className="dir-empty">{t("dirs.empty")}</div>
          )}
          {rows.map((row, i) => (
            <button
              key={row.key}
              type="button"
              className={i === index ? "dir-row on" : "dir-row"}
              onMouseEnter={() => setIndex(i)}
              onClick={() => goto(row.path)}
            >
              <span className="dir-mark" aria-hidden="true">
                {row.up ? "\u2191" : <FolderIcon size={12} />}
              </span>
              {row.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
