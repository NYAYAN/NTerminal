import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { joinDir, sameDir } from "../lib/dirs";
import {
  changedInDir,
  groupJump,
  matchSections,
  pathKey,
  relativeToDir,
  startSections,
  type PaletteRow,
  type PaletteSection,
  type SectionId,
} from "../lib/fileSections";
import { rankFiles, shortenPath } from "../lib/format";
import { tp, tSplit, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
import type { MsgKey } from "../lib/messages";
import { segments, useTextSearch } from "../lib/textSearch";
import { useStore } from "../store/useStore";
import { useActiveGit, useLabel } from "./gitShared";
import {
  ArrowIcon,
  FileKindIcon,
  FolderIcon,
  MatchCaseIcon,
  RegexIcon,
  SearchIcon,
  SpinnerIcon,
  WholeWordIcon,
} from "./Icons";
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
 * Ctrl+P adla, içerik kısayolu (bkz. `textSearch` eylemi) içerikle açıyor; iki
 * sekme de kendi kısayolunu rozetinde gösteriyor. Hangi dizinde arandığı
 * şeridin sağındaki rozette.
 *
 * ## Ne yapıyor
 *
 * Enter dosyayı görüntüleyicide açıyor — içerik sekmesinde O SATIRDA, eşleşme
 * işaretli. Shift+Enter yolu komut satırının sonuna ekliyor (`code ` yazıp
 * Ctrl+P). İki iş de gerçek; alt şerit hangisinin hangi tuşla olduğunu söylüyor.
 *
 * Sorgu boşken liste bir başlangıç noktası: değişen dosyalar, son açılanlar ve
 * ardından bütün dosyalar (bkz. `fileSections`). Sonuç yoksa ortada nerede ve
 * kaç dosyaya bakıldığı yazıyor, yanında bir sonraki adım: öbür sekme ya da
 * açık bir arama seçeneğini kapatmak.
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
  const mode = useStore((s) => s.ui.paletteMode);
  const flags = useStore((s) => s.ui.searchFlags);
  const viewerPath = useStore((s) => s.ui.viewerPath);
  const recentFiles = useStore((s) => s.ui.recentFiles);
  const keybindings = useStore((s) => s.settings.keybindings);
  // Dizin ve git durumu Değişiklikler paneliyle AYNI kancadan: palet ile panel
  // aynı sekmenin aynı gerçeğine baksın.
  const { cwd, git } = useActiveGit();
  const uid = useId();

  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState(() => useStore.getState().ui.paletteQuery);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const trimmed = query.trim();

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
   * dizinde yirmi bin dosyalık yürüyüşü boşuna yapmasın. Dizin bilinmiyorsa
   * okunacak bir şey yok; liste yerine bunu söyleyen yazı çiziliyor.
   */
  const okunanDizin = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "files" || !cwd) return;
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
   * değilse çözüm daha çok satır değil, daha iyi bir sorgu. Bir fazlası
   * isteniyor: alt şerit sınıra takılındığını "200+" diye söylesin.
   */
  const ranked = useMemo(() => rankFiles(files ?? [], query, MAX_ROWS + 1), [files, query]);
  const capped = ranked.length > MAX_ROWS;

  /*
   * Değişen dosyalar, dizine göre.
   *
   * Git durumu odak dönüşünde ve yoklamada YENİ bir nesneyle yazılıyor, içerik
   * aynı olsa bile (bkz. `refreshGit`); liste kimliği değişince de seçim ilk
   * satıra dönüyor (aşağıda). Hesap bu yüzden değişikliklerin İÇERİĞİNE bağlı:
   * aynı liste, gezilen satırı başa atmasın.
   */
  const changes = git?.changes;
  const changeKey = changes?.map((c) => `${c.status}\t${c.path}`).join("\n") ?? "";
  const root = git?.root || cwd;
  const changed = useMemo(
    () => (cwd && root && changes ? changedInDir(changes, root, cwd) : []),
    // `changes` anahtarıyla izleniyor (bkz. yukarı).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [changeKey, root, cwd],
  );
  const statusOf = useMemo(() => new Map(changed.map((c) => [pathKey(c.path), c.status])), [changed]);

  const sections = useMemo<PaletteSection[]>(() => {
    if (mode !== "files" || !cwd || !files) return [];
    if (trimmed) return matchSections(ranked.slice(0, MAX_ROWS), trimmed);
    return startSections(
      files,
      changed.map((c) => c.path),
      relativeToDir(recentFiles, cwd),
      MAX_ROWS,
    );
  }, [mode, cwd, files, trimmed, ranked, changed, recentFiles]);
  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);

  const text = useTextSearch(cwd, query, flags, mode === "text");
  const hits = useMemo(() => flatHits(text.result), [text.result]);
  const list: readonly unknown[] = mode === "files" ? rows : hits;
  const count = list.length;

  /** ⌥↑ / ⌥↓'nun durakları: içerikte dosyaların, adda bölümlerin ilk satırları. */
  const starts = useMemo(() => {
    const sizes =
      mode === "files"
        ? sections.map((section) => section.rows.length)
        : (text.result?.files ?? []).map((file) => file.lines.length);
    let at = 0;
    return sizes.map((size) => {
      const start = at;
      at += size;
      return start;
    });
  }, [mode, sections, text.result]);

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
   * gerçek bir ihtiyaç, o yüzden kaybolmadı — alt şeritte yazıyor.
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

  const listboxId = `${uid}-list`;
  const panelId = `${uid}-panel`;
  const tabId = (which: "files" | "text") => `${uid}-tab-${which}`;
  // Kök rozetiyle ve boş durum yazılarıyla aynı kısaltma: "…/Work/NTerminal".
  const dir = cwd ? shortenPath(cwd, 2) : "";

  const tabButton = (which: "files" | "text", label: string, combo: string | undefined) => (
    <button
      type="button"
      role="tab"
      id={tabId(which)}
      aria-controls={panelId}
      className={mode === which ? "palette-tab on" : "palette-tab"}
      aria-selected={mode === which}
      // Odak kutuda kalsın: sekmeyi değiştirip yazmaya devam edilebilmeli.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setUi({ paletteMode: which })}
    >
      {label}
      {/* Paleti doğrudan bu sekmede açan tuş. Ayardan okunuyor: kullanıcı
          değiştirdiyse rozet de onunkini gösteriyor. */}
      {combo && (
        <span className="keycap keycap-word" aria-hidden="true">
          {prettyCombo(combo)}
        </span>
      )}
    </button>
  );

  let body: ReactNode = null;
  if (!cwd) {
    // Yeni sekmede kabuk dizinini bildirene kadar cwd yok. "Eşleşen dosya yok"
    // demek yanlış olurdu: aranacak bir dizin yok, eşleşme sorulmadı bile.
    body = <PaletteEmpty icon={<FolderIcon size={22} />} title={t("tree.noDir")} detail={t("files.noDirDetail")} />;
  } else if (mode === "files") {
    if (files === null) {
      body = <PaletteEmpty icon={<SpinnerIcon size={18} />} detail={t("files.reading", { dir })} />;
    } else if (files.length === 0) {
      body = <PaletteEmpty icon={<FolderIcon size={22} />} title={t("files.none", { dir })} />;
    } else if (rows.length === 0) {
      body = (
        <PaletteEmpty
          icon={<SearchIcon size={22} />}
          title={t("files.noMatch", { query: trimmed })}
          detail={tp("files.lookedAt", files.length, { dir })}
        >
          <Chip onClick={() => setUi({ paletteMode: "text" })}>
            <span className="keycap keycap-word">{prettyCombo("Tab")}</span>
            {t("action.textSearch")}
          </Chip>
        </PaletteEmpty>
      );
    } else {
      let at = -1;
      body = (
        <div role="listbox" id={listboxId} aria-label={t("search.byName")}>
          {sections.map((section) => {
            const items = section.rows.map((row) => {
              at += 1;
              const i = at;
              const full = joinDir(cwd, row.path);
              return (
                <FileRow
                  key={row.path}
                  row={row}
                  id={`${listboxId}-${i}`}
                  on={i === index}
                  full={full}
                  open={!!viewerPath && sameDir(full, viewerPath)}
                  status={statusOf.get(pathKey(row.path))}
                  onHover={() => setIndex(i)}
                  onPick={(shift) => sec(row.path, shift)}
                />
              );
            });
            const title = SECTION_TITLE[section.id];
            if (!title) return <Fragment key={section.id}>{items}</Fragment>;
            return (
              <div key={section.id} role="group" aria-label={t(title)}>
                <div className="palette-section" aria-hidden="true">
                  {t(title)}
                </div>
                {items}
              </div>
            );
          })}
        </div>
      );
    }
  } else if (!trimmed) {
    const [before, after] = tSplit("search.groupsHint", "keys");
    body = (
      <PaletteEmpty
        icon={<SearchIcon size={22} />}
        title={t("search.emptyTitle")}
        detail={t("search.emptyWhere", { dir })}
        tip={
          <>
            {before}
            <span className="keycap keycap-word">{prettyCombo("Alt+ArrowUp")}</span>
            <span className="keycap keycap-word">{prettyCombo("Alt+ArrowDown")}</span>
            {after}
          </>
        }
      />
    );
  } else if (text.status === "error") {
    // Hata durum satırında yazıyor (`SearchStatus`); listede gösterilecek bir şey yok.
    body = null;
  } else if (!text.result) {
    body = <PaletteEmpty icon={<SpinnerIcon size={18} />} detail={t("search.searchingIn", { dir })} />;
  } else if (text.result.files.length === 0) {
    body = (
      <PaletteEmpty
        icon={<SearchIcon size={22} />}
        title={t("search.noMatchIn", { query: trimmed })}
        detail={tp("files.lookedAt", text.result.searched, { dir })}
      >
        {/* Açık bir seçenek eşleşmeyi daraltıyor olabilir: kapatmak tek tık. */}
        {flags.caseSensitive && (
          <Chip onClick={() => toggleFlag("caseSensitive")}>
            <MatchCaseIcon size={14} />
            {t("search.offCase")}
          </Chip>
        )}
        {flags.wholeWord && (
          <Chip onClick={() => toggleFlag("wholeWord")}>
            <WholeWordIcon size={14} />
            {t("search.offWord")}
          </Chip>
        )}
        {flags.regex && (
          <Chip onClick={() => toggleFlag("regex")}>
            <RegexIcon size={14} />
            {t("search.offRegex")}
          </Chip>
        )}
        <Chip onClick={() => setUi({ paletteMode: "files" })}>
          <span className="keycap keycap-word">{prettyCombo("Tab")}</span>
          {t("files.searchNames")}
        </Chip>
      </PaletteEmpty>
    );
  } else {
    body = (
      <TextResults
        result={text.result}
        active={index}
        onActive={setIndex}
        onPick={pick}
        stale={text.status === "searching"}
        kindIcons
        listbox={{ id: listboxId, label: t("search.byContent") }}
      />
    );
  }

  // İlk arama sürerken durum satırı yok: ortadaki yazı aynı şeyi söylüyor, iki
  // dönen çark olmasın. Sonuç geldikten sonra satır sayıları ve sınırları taşıyor.
  const showStatus = mode === "text" && text.status !== "idle" && (text.result !== null || text.status === "error");

  // Sağdaki sayı ad sekmesinde; içerik sekmesinin sayıları durum satırında.
  let countText: string | null = null;
  if (mode === "files" && cwd && files && files.length > 0) {
    const total = tp("search.files", files.length);
    const found = capped ? t("files.resultsCapped", { n: MAX_ROWS }) : tp("files.results", rows.length);
    countText = trimmed ? `${found} · ${total}` : total;
  }

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
            // ⌥ ile bir sonraki / önceki DOSYAYA (adda bölüme) atlıyor: elli
            // eşleşmeli bir dosyayı satır satır geçmek zorunda kalınmasın.
            if (e.altKey && !e.ctrlKey && !e.metaKey) setIndex((i) => groupJump(starts, i, yon));
            else setIndex((i) => (((i + yon) % count) + count) % count);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (mode === "files") {
              const row = rows[index];
              if (row) sec(row.path, e.shiftKey);
            } else {
              const ref = hits[index];
              if (ref) pick(ref, e.shiftKey);
            }
          }
        }}
      >
        <div className="palette-tabs" role="tablist" aria-label={t("search.modeLabel")}>
          {tabButton("files", t("search.byName"), keybindings.filePalette)}
          {tabButton("text", t("search.byContent"), keybindings.textSearch)}
          <span className="palette-tabs-spacer" />
          {/* Aramanın KÖKÜ: iki sekme de bu dizinde arıyor. Kısaltılmış yazılıyor,
              tam yol ipucunda. */}
          {cwd && (
            <span className="palette-root" title={t("files.rootTitle", { path: cwd })}>
              <FolderIcon size={12} />
              <span>{dir}</span>
            </span>
          )}
        </div>

        {/* Büyüteç solda, içerik seçenekleri kutunun SAĞ ucunda: üçü kutuya ait
            ayarlar, şeridin değil. */}
        <div className="palette-search">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-label={t(mode === "files" ? "action.filePalette" : "action.textSearch")}
            aria-autocomplete="list"
            aria-expanded={count > 0}
            aria-controls={count > 0 ? listboxId : undefined}
            // Odak kutuda kalıyor; seçili satırı ekran okuyucuya bu söylüyor.
            aria-activedescendant={count > 0 ? `${listboxId}-${index}` : undefined}
            placeholder={mode === "files" ? t("files.search") : t("search.contentPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          {mode === "text" && <SearchToggles />}
        </div>

        {showStatus && (
          <div className="palette-status">
            <SearchStatus state={text} verbose />
          </div>
        )}

        <div className="palette-list" ref={listRef} role="tabpanel" id={panelId} aria-labelledby={tabId(mode)}>
          {body}
        </div>

        {/* Tuşlar rozet olarak, öneri listesinin alt şeridiyle aynı dil: tek uzun
            cümlede ("Enter dosyayı açar · …") hangi işaretin tuş olduğu okunmuyordu
            ve Esc hiç yazmıyordu. Rozet platformun yazımıyla (`prettyCombo`):
            mac'te ↩ ⇧↩ ⇥, Windows'ta Enter, Shift+Enter, Tab. Esc ikisinde de
            yazıyla, öneri listesindeki gibi — ⎋ simgesini tanıyan az. */}
        <div className="palette-foot">
          <span className="palette-keys">
            <span className="keycap">
              <ArrowIcon dir="up" size={10} />
            </span>
            <span className="keycap">
              <ArrowIcon dir="down" size={10} />
            </span>
            <span className="dim">{t("files.hintNav")}</span>
            <span className="keycap keycap-word">{prettyCombo("Enter")}</span>
            <span className="dim">{t(mode === "files" ? "files.hintOpen" : "search.hintOpenLine")}</span>
            <span className="keycap keycap-word">{prettyCombo("Shift+Enter")}</span>
            <span className="dim">{t("files.hintInsert")}</span>
            <span className="keycap keycap-word">{prettyCombo("Tab")}</span>
            <span className="dim">{t(mode === "files" ? "files.hintContent" : "search.hintNames")}</span>
            <span className="keycap keycap-word">Esc</span>
            <span className="dim">{t("files.hintClose")}</span>
          </span>
          {countText && <span className="palette-count">{countText}</span>}
        </div>
      </div>
    </div>
  );
}

/** Çizilen en fazla sonuç. */
const MAX_ROWS = 200;

/** Bölüm başlıkları; birebir eşleşmeler (`match`) başlıksız — sorgunun asıl cevabı. */
const SECTION_TITLE: Record<SectionId, MsgKey | null> = {
  changed: "files.changed",
  recent: "files.recent",
  all: "files.all",
  match: null,
  near: "files.near",
};

/**
 * Ad sekmesinin satırı.
 *
 * Ad ÖNDE, klasör arkada ve soluk. Önceki hâli tek bir yol dizesiydi ve göz her
 * satırda aranan şeyi bulmak için klasör zincirini geçmek zorundaydı — üstelik
 * o zincir çoğu satırda AYNI (`src/components/…`), yani ayırt edici olmayan
 * kısmı önce okunuyordu. Klasör BAŞTAN kırpılıyor: uzun bir zincirde dosyaya en
 * yakın olan son parça.
 *
 * Satırın sağ ucu meta veriye ait: görüntüleyicide açık olan dosyanın rozeti ve
 * git durumu (Değişiklikler listesiyle aynı simge ve renk). Tam yol ipucunda.
 */
function FileRow({
  row,
  id,
  on,
  full,
  open,
  status,
  onHover,
  onPick,
}: {
  row: PaletteRow;
  id: string;
  on: boolean;
  full: string;
  open: boolean;
  status: string | undefined;
  onHover: () => void;
  onPick: (shift: boolean) => void;
}) {
  const t = useT();
  const cut = Math.max(row.path.lastIndexOf("/"), row.path.lastIndexOf("\\"));
  const name = cut === -1 ? row.path : row.path.slice(cut + 1);
  const dir = cut === -1 ? "" : row.path.slice(0, cut);
  const positions = row.match?.positions ?? [];
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={on}
      className={on ? "pop-row file-row on" : "pop-row file-row"}
      title={full}
      onMouseEnter={onHover}
      onClick={(e) => onPick(e.shiftKey)}
    >
      <span className="file-ico" aria-hidden="true">
        <FileKindIcon path={name} size={14} />
      </span>
      <span className="file-name">{marked(name, positions, cut + 1)}</span>
      {dir && <span className="file-dir">{marked(dir, positions, 0)}</span>}
      {(open || status) && (
        <span className="file-meta">
          {open && <span className="open-dot">{t("files.openTag")}</span>}
          {status && <GitMark status={status} />}
        </span>
      )}
    </button>
  );
}

/** Değişen dosyanın durum simgesi: Değişiklikler listesindekiyle aynı (`useLabel`). */
function GitMark({ status }: { status: string }) {
  const { text, tone, Icon } = useLabel(status);
  return (
    <span className={`git-icon ${tone}`} title={text} role="img" aria-label={text}>
      <Icon size={12} />
    </span>
  );
}

/**
 * Metnin eşleşen harfleri `<mark>` içinde; bitişik harfler tek parça.
 *
 * `positions` YOLUN içindeki yerler (bkz. `fileMatch`), `offset` bu parçanın
 * yoldaki başı — ad ve klasör aynı konum dizisinden kendi payını alıyor.
 */
function marked(text: string, positions: readonly number[], offset: number): ReactNode {
  const ranges: [number, number][] = [];
  for (const p of positions) {
    const k = p - offset;
    if (k < 0 || k >= text.length) continue;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === k) last[1] = k + 1;
    else ranges.push([k, k + 1]);
  }
  if (ranges.length === 0) return text;
  return segments(text, ranges).map((part, k) =>
    part.hit ? <mark key={k}>{part.text}</mark> : <Fragment key={k}>{part.text}</Fragment>,
  );
}

/**
 * Listenin yerinde duran durum: dizin bilinmiyor, okunuyor, boş ya da sonuç yok.
 *
 * Ortada ve ne olduğunu söyleyen bir cümleyle; varsa bir sonraki adım düğme
 * olarak altında. Eski hâli listenin tepesinde tek satırdı ("Eşleşen dosya
 * yok") ve nerede, kaç dosyada arandığını söylemiyordu.
 */
function PaletteEmpty({
  icon,
  title,
  detail,
  tip,
  children,
}: {
  icon: ReactNode;
  title?: string;
  detail?: string;
  tip?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="palette-empty" role="status">
      {icon}
      {title && <strong>{title}</strong>}
      {detail && <span>{detail}</span>}
      {tip && <span className="palette-tip">{tip}</span>}
      {children && <div className="palette-actions">{children}</div>}
    </div>
  );
}

/** Boş durumun eylem düğmesi; sekme düğmeleri gibi odağı kutudan almıyor. */
function Chip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="palette-chip" onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}
