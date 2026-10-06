import { useEffect, useMemo, useRef, useState } from "react";

import { joinDir } from "../lib/dirs";
import { rankFiles } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useTextSearch } from "../lib/textSearch";
import { sessions, useStore } from "../store/useStore";
import { flagForKey, SearchToggles, toggleFlag } from "./SearchToggles";
import { flatHits, SearchStatus, TextResults, type HitRef } from "./TextResults";

/**
 * Başlık çubuğundaki arama: bulunduğun dizinde dosya ADI ve dosya İÇERİĞİ.
 *
 * ## İki sekme, tek kutu
 *
 * İSTEK: "üstte arama var, dosyaları arıyor; dosyaların içinde metin arama da
 * olmalı." İkinci bir pencere yerine aynı paletin ikinci sekmesi (JetBrains'in
 * "Search Everywhere"ündeki gibi): kutu ve yazılan sorgu iki sekmede ORTAK, Tab
 * sekmeyi değiştiriyor. "useStore" yazıp adında bulamayan kişi Tab'a basıp
 * içinde geçtiği yerleri görüyor; sorguyu yeniden yazmıyor.
 *
 * Ctrl+P adla, içerik kısayolu (bkz. `textSearch` eylemi) içerikle açıyor.
 *
 * ## Ne yapıyor
 *
 * Enter dosyayı görüntüleyicide açıyor — içerik sekmesinde O SATIRDA, eşleşme
 * işaretli. Shift+Enter yolu komut satırının sonuna ekliyor (`code ` yazıp
 * Ctrl+P). İki iş de gerçek; alt satır hangisinin hangi tuşla olduğunu söylüyor.
 *
 * ## Son sorgu hatırlanıyor
 *
 * Palet seçimde kapanıyor; içerik aramasında bir sonraki eşleşmeye gitmek için
 * yeniden açmak gerekiyor. Sorgu o zaman kutuda SEÇİLİ geliyor: yazmak onu
 * siliyor, ok + Enter ise aynı listeden devam ediyor.
 *
 * ## Dosya adı listesi neden bir kez okunuyor
 *
 * Dizin yürüyüşü sınırlı ama bedava değil (bkz. `src-tauri/src/files.rs`).
 * Palet bir kez okuyor; yazdıkça yeniden okumak her tuş vuruşunda binlerce
 * dosyayı diskten geçirmek olurdu. Bulanık süzme bellekte, anlık. İçerik
 * aramasının kendisi Rust'ta (`search.rs`) ve yazdıkça bekleyerek yeniden
 * koşuyor (bkz. `useTextSearch`).
 */
export function FilePalette() {
  const t = useT();
  const setUi = useStore((s) => s.setUi);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const mode = useStore((s) => s.ui.paletteMode);
  const flags = useStore((s) => s.ui.searchFlags);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const cwd = tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;

  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState(() => useStore.getState().ui.paletteQuery);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const close = () => setUi({ filePaletteOpen: false });

  // Sorgu SEÇİLİ: yazmak eskisinin yerine geçiyor (bkz. "Son sorgu hatırlanıyor").
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Son sorgu kapanırken saklanıyor — hangi yoldan kapanırsa kapansın: Esc'yi
  // uygulamanın genel kısayol yakalayıcısı da yakalayıp paleti kapatıyor.
  useEffect(() => () => useStore.getState().setUi({ paletteQuery: queryRef.current }), []);

  /*
   * Dosya adı listesi yalnızca o sekmede ve dizin başına bir kez.
   *
   * İçerik sekmesinde açılan palet listeye hiç ihtiyaç duymuyor; büyük bir
   * dizinde yirmi bin dosyalık yürüyüşü boşuna yapmasın.
   */
  const okunanDizin = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "files") return;
    if (!cwd) {
      setFiles([]);
      return;
    }
    if (okunanDizin.current === cwd) return;
    okunanDizin.current = cwd;
    let cancelled = false;
    setFiles(null);
    void api
      .listFiles(cwd)
      .then((list) => !cancelled && setFiles(list))
      // Okunamayan dizin paleti kilitlememeli: boş liste gösterip kapanmasını
      // bekliyoruz.
      .catch(() => !cancelled && setFiles([]))
      .finally(() => {
        if (cancelled && okunanDizin.current === cwd) okunanDizin.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, mode]);

  /**
   * Bulanık süzme ve sıralama — kuralı `lib/format.ts` taşıyor (`rankFiles`).
   *
   * Sıralama BILEŞENDEN ÇIKTI: burada tersti (`b.score - a.score`) ve aranan
   * dosya listenin en sonunda kalıyordu; üstelik sınır sıralamadan sonra
   * uygulandığı için büyük depolarda listeye hiç girmiyordu. Saf bir işlev
   * olarak testle bağlı.
   *
   * Sonuç sayısı SINIRLI (200): yüz binlerce dosyanın hepsini çizmek listeyi
   * kullanılamaz yapıyor ve tarayıcıyı tutukluyor. Aranan dosya ilk yirmide
   * değilse çözüm daha çok satır değil, daha iyi bir sorgu.
   */
  const rows = useMemo(() => rankFiles(files ?? [], query, MAX_ROWS), [files, query]);

  const text = useTextSearch(cwd, query, flags, mode === "text");
  const hits = useMemo(() => flatHits(text.result), [text.result]);
  const list: readonly unknown[] = mode === "files" ? rows : hits;
  const count = list.length;

  /*
   * Seçili satır, ait olduğu LİSTEYLE birlikte tutuluyor; liste değişince
   * (yeni sonuç, başka sekme, başka sorgu) seçim ilk satıra dönüyor.
   *
   * Sıfırlama çizim sırasında türetiliyor, bir etkiyle değil. ÖLÇÜLEN: etki
   * boyamadan SONRA koşuyordu; sonuçlar çizildiği an basılan ok tuşu ondan
   * önce işlenirse seçim geri ilk satıra atlıyordu (paket tam koşarken testte
   * görüldü). Türetilen değerde böyle bir ara an yok.
   */
  const [sel, setSel] = useState<{ of: readonly unknown[] | null; i: number }>({ of: null, i: 0 });
  const index = sel.of === list ? sel.i : 0;
  const setIndex = (next: number | ((i: number) => number)) =>
    setSel((prev) => {
      const cur = prev.of === list ? prev.i : 0;
      return { of: list, i: typeof next === "function" ? next(cur) : next };
    });

  useEffect(() => {
    listRef.current?.querySelector(".pop-row.on, .hit-line.on")?.scrollIntoView({ block: "nearest" });
  }, [index, rows, hits]);

  /**
   * Seçim GÖRÜNTÜLEYİCİYİ açıyor; Shift ile yolu komut satırına ekliyor.
   *
   * İlk hâli tersiydi (seçim yolu eklerdi) ve istenen bu değildi: dosyayı
   * arayan biri çoğu zaman İÇİNE bakmak istiyor. Yolu bir komuta vermek de
   * gerçek bir ihtiyaç, o yüzden kaybolmadı — ipucu satırında yazıyor.
   */
  const sec = (path: string, shift: boolean) => {
    const full = cwd ? joinDir(cwd, path) : path;
    if (shift) useStore.getState().insertPath(full);
    else useStore.getState().openFile(full);
    close();
  };

  /** İçerik sekmesinde seçim: dosya O SATIRDA açılıyor, eşleşme işaretli. */
  const pick = ({ file, hit }: HitRef, shift: boolean) => {
    const full = cwd ? joinDir(cwd, file.path) : file.path;
    if (shift) useStore.getState().insertPath(full);
    else useStore.getState().openFile(full, { line: hit.line, col: hit.col, len: hit.len });
    close();
  };

  const tabButton = (which: "files" | "text", label: string) => (
    <button
      type="button"
      role="tab"
      className={mode === which ? "palette-tab on" : "palette-tab"}
      aria-selected={mode === which}
      // Odak kutuda kalsın: sekmeyi değiştirip yazmaya devam edilebilmeli.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setUi({ paletteMode: which })}
    >
      {label}
    </button>
  );

  return (
    <div className="overlay" onMouseDown={close}>
      <div
        className="palette file-palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
            return;
          }
          // Tab sekmeyi değiştiriyor: paletin tek denetimi kutu, odağı başka
          // yere taşımanın burada bir karşılığı yok.
          if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            setUi({ paletteMode: mode === "files" ? "text" : "files" });
            return;
          }
          const flag = mode === "text" ? flagForKey(e) : null;
          if (flag) {
            e.preventDefault();
            toggleFlag(flag);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (count === 0) return;
            const yon = e.key === "ArrowDown" ? 1 : -1;
            setIndex((i) => (((i + yon) % count) + count) % count);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (mode === "files") {
              const row = rows[index];
              if (row) sec(row, e.shiftKey);
            } else {
              const ref = hits[index];
              if (ref) pick(ref, e.shiftKey);
            }
          }
        }}
      >
        <div className="palette-tabs" role="tablist" aria-label={t("search.modeLabel")}>
          {tabButton("files", t("search.byName"))}
          {tabButton("text", t("search.byContent"))}
          <span className="palette-tabs-spacer" />
          {mode === "text" && <SearchToggles />}
        </div>

        <input
          ref={inputRef}
          value={query}
          placeholder={mode === "files" ? t("files.search") : t("search.contentPlaceholder")}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        {mode === "text" && text.status !== "idle" && (
          <div className="palette-status">
            <SearchStatus state={text} verbose />
          </div>
        )}

        <div className="palette-list" ref={listRef}>
          {mode === "files" && (
            <>
              {files === null && <div className="pop-empty">{t("common.loading")}</div>}
              {files !== null && rows.length === 0 && <div className="pop-empty">{t("files.empty")}</div>}
              {rows.map((path, i) => {
                const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
                const name = cut === -1 ? path : path.slice(cut + 1);
                const dir = cut === -1 ? "" : path.slice(0, cut);
                return (
                  <button
                    key={path}
                    type="button"
                    className={i === index ? "pop-row file-row on" : "pop-row file-row"}
                    onMouseEnter={() => setIndex(i)}
                    onClick={(e) => sec(path, e.shiftKey)}
                  >
                    {/*
                      Ad SOLDA, klasör SAĞDA.

                      Önceki hâli tek bir yol dizesiydi ve göz her satırda aranan
                      şeyi bulmak için klasör zincirini geçmek zorundaydı — üstelik
                      o zincir çoğu satırda AYNI (`src/components/…`), yani ayırt
                      edici olmayan kısmı önce okunuyordu. Ad öne alınınca satırlar
                      ilk harften ayrışıyor; klasör kaybolmuyor, ikinci sıraya
                      geçiyor.

                      Klasör BAŞTAN kırpılıyor: uzun bir zincirde dosyaya en yakın
                      olan son parça.
                    */}
                    <span className="file-name">{name}</span>
                    {dir && <span className="file-dir">{dir}</span>}
                  </button>
                );
              })}
            </>
          )}

          {mode === "text" && text.result && hits.length > 0 && (
            <TextResults
              result={text.result}
              active={index}
              onActive={setIndex}
              onPick={pick}
              stale={text.status === "searching"}
            />
          )}
        </div>

        <div className="palette-foot">
          <span className="dim">{mode === "files" ? t("files.hint") : t("search.contentHint")}</span>
        </div>
      </div>
    </div>
  );
}

/** Çizilen en fazla sonuç. */
const MAX_ROWS = 200;
