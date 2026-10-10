import { Fragment, useState } from "react";

import { baseName, dirName } from "../lib/format";
import { useT } from "../lib/i18n";
import { searchSummary, segments, type TextSearchState } from "../lib/textSearch";
import { ChevronIcon, FileKindIcon, SpinnerIcon } from "./Icons";
import type { TextFileHits, TextLineHit, TextSearchResult } from "../types";

/** Seçilen eşleşme: hangi dosyanın hangi satırı. */
export interface HitRef {
  file: TextFileHits;
  hit: TextLineHit;
}

/**
 * Sonuçların DÜZ sırası — palette ok tuşları bu sırayla geziniyor.
 *
 * Dosya başlıkları listede yok: Enter bir satırda anlamlı (dosyayı o satırda
 * açıyor), başlıkta ise "hangi satır" sorusunun yanıtı yok.
 */
export function flatHits(result: TextSearchResult | null): HitRef[] {
  if (!result) return [];
  return result.files.flatMap((file) => file.lines.map((hit) => ({ file, hit })));
}

/**
 * İçerik aramasının sonuçları: dosyaya göre gruplu, satır numarası ve
 * eşleşmesi işaretli metinle.
 *
 * İki yerde çiziliyor ve ikisi de aynı bileşen: paletin "Dosya içeriği"
 * sekmesi (klavyeyle seçilen satır `active`) ve dosya sütunu (dosyalar
 * katlanabilir, görüntüleyicide açık olan satır `current`). Ayrı yazılsaydı
 * bir yerde düzeltilen işaret hatası ötekinde kalırdı.
 *
 * Grup başlığında dosyanın ADI önde, klasörü soluk ve arkada — Ctrl+P
 * satırındaki kararla aynı gerekçe: ayırt edici olan ad. Klasör de Ctrl+P'nin
 * ad sekmesindeki gibi yazılıyor (`src/components`, sonda ayırıcı yok): iki
 * sekme arasında Tab'a basan aynı klasörü iki ayrı biçimde görmesin.
 */
export function TextResults({
  result,
  active = -1,
  onActive,
  onPick,
  collapsible = false,
  isCurrent,
  stale = false,
  kindIcons = false,
  listbox,
}: {
  result: TextSearchResult;
  /** Klavyeyle seçili satırın düz sıradaki yeri (bkz. `flatHits`). */
  active?: number;
  onActive?: (index: number) => void;
  onPick: (ref: HitRef, shift: boolean) => void;
  collapsible?: boolean;
  /** Görüntüleyicide açık olan satır mı: işaretli duruyor. */
  isCurrent?: (ref: HitRef) => boolean;
  /** Yeni arama sürüyor; liste bir öncekinin sonucu. */
  stale?: boolean;
  /** Dosya başlığında türün simgesi (palet; dar sütunda yer kaplamasın diye isteğe bağlı). */
  kindIcons?: boolean;
  /**
   * Palette liste bir `listbox`, satırlar kimlikli `option`: odak kutuda
   * kalıyor, seçili satırı kutu `aria-activedescendant` ile gösteriyor.
   * Satır kimliği `${id}-${düz sıra}`.
   */
  listbox?: { id: string; label: string };
}) {
  const t = useT();
  /**
   * Katlanan dosyalar. Varsayılan AÇIK: arama yapan kişi eşleşen satırları
   * görmek istiyor; kalabalık bir dosyayı kapatmak tek tıklama.
   */
  const [kapali, setKapali] = useState<ReadonlySet<string>>(new Set());

  let index = -1;
  return (
    <div
      className={stale ? "hits stale" : "hits"}
      aria-busy={stale}
      role={listbox ? "listbox" : undefined}
      id={listbox?.id}
      aria-label={listbox?.label}
    >
      {result.files.map((file) => {
        const closed = collapsible && kapali.has(file.path);
        const dir = dirName(file.path)?.slice(0, -1);
        const head = (
          <>
            {collapsible && (
              <span className="hit-caret" aria-hidden="true">
                <ChevronIcon open={!closed} size={10} />
              </span>
            )}
            {kindIcons && (
              <span className="file-ico" aria-hidden="true">
                <FileKindIcon path={file.path} size={14} />
              </span>
            )}
            <span className="hit-name">{baseName(file.path)}</span>
            {dir && <span className="hit-dir">{dir}</span>}
            <span className="hit-count">{file.matches}</span>
          </>
        );

        // Numara sütunu dosyanın EN UZUN numarası kadar: 82 ile 1182 aynı
        // dosyada alt alta dururken metin aynı sütundan başlamalı.
        const digits = String(file.lines[file.lines.length - 1]?.line ?? 0).length;
        return (
          <div
            key={file.path}
            className="hit-file"
            role={listbox ? "group" : undefined}
            aria-label={listbox ? file.path : undefined}
            style={{ "--hit-no": `${Math.max(2, digits)}ch` } as React.CSSProperties}
          >
            {collapsible ? (
              <button
                type="button"
                className="hit-head"
                title={file.path}
                aria-expanded={!closed}
                onClick={() =>
                  setKapali((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(file.path)) next.add(file.path);
                    return next;
                  })
                }
              >
                {head}
              </button>
            ) : (
              // Listbox'ta grubun adı zaten yol (`aria-label`); başlık okunursa
              // her dosya iki kez söylenirdi.
              <div className="hit-head" title={file.path} aria-hidden={listbox ? true : undefined}>
                {head}
              </div>
            )}

            {!closed &&
              file.lines.map((hit) => {
                index += 1;
                const i = index;
                const on = i === active;
                const shown = !!isCurrent?.({ file, hit });
                return (
                  <button
                    key={hit.line}
                    type="button"
                    className={on || shown ? "hit-line on" : "hit-line"}
                    data-hit={i}
                    id={listbox ? `${listbox.id}-${i}` : undefined}
                    role={listbox ? "option" : undefined}
                    aria-selected={listbox ? on : undefined}
                    aria-current={shown || undefined}
                    title={t("search.lineTitle", { path: file.path, line: hit.line })}
                    onMouseEnter={onActive ? () => onActive(i) : undefined}
                    onClick={(e) => onPick({ file, hit }, e.shiftKey)}
                  >
                    <span className="hit-no">{hit.line}</span>
                    <span className="hit-text">
                      {segments(hit.text, hit.ranges).map((part, k) =>
                        part.hit ? <mark key={k}>{part.text}</mark> : <Fragment key={k}>{part.text}</Fragment>,
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Aramanın durum satırı: sürüyor, hata, eşleşme yok ya da sayılar ve sınırlar.
 *
 * `verbose`: palette yer var, git'in yok saydıkları notu da görünür yazılıyor;
 * dar sütunda aynı not ipucunda.
 */
export function SearchStatus({ state, verbose = false }: { state: TextSearchState; verbose?: boolean }) {
  const t = useT();
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <div className="search-status err" role="alert">
        {state.error}
      </div>
    );
  }

  const busy = state.status === "searching";
  const result = state.result;
  if (!result) {
    return (
      <div className="search-status">
        <SpinnerIcon size={12} />
        <span>{t("search.searching")}</span>
      </div>
    );
  }

  const { counts, notes } = searchSummary(result);
  const gitNote = result.git ? t("search.gitIgnored") : undefined;
  return (
    <div className="search-status" title={verbose ? undefined : gitNote}>
      {busy && <SpinnerIcon size={12} />}
      <span className="search-counts">{result.matches === 0 ? t("search.noMatch") : counts}</span>
      {notes.map((note) => (
        <span key={note} className="search-note">
          {note}
        </span>
      ))}
      {verbose && gitNote && <span className="search-note dim">{gitNote}</span>}
    </div>
  );
}
