import { useEffect, useMemo, useRef, useState } from "react";

import { joinDir } from "../lib/dirs";
import { rankFiles } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";

/**
 * Ctrl+P: bulunduğun dizindeki dosyalarda arama.
 *
 * ## Ne yapıyor
 *
 * Enter dosyayı sağ paneldeki görüntüleyicide açıyor: dosyayı arayan biri çoğu
 * zaman İÇİNE bakmak istiyor.
 *
 * Shift+Enter ise yolu komut satırının sonuna ekliyor — `code ` yazıp Ctrl+P'ye
 * basmak böyle çalışıyor: yazdığın korunuyor, yol arkasına ekleniyor. İki iş de
 * gerçek; ipucu satırı hangisinin hangi tuşla olduğunu söylüyor.
 *
 * ## Liste neden bir kez okunuyor
 *
 * Dizin yürüyüşü sınırlı ama bedava değil (bkz. `src-tauri/src/files.rs`).
 * Palet her açılışta bir kez okuyor; yazdıkça yeniden okumak her tuş vuruşunda
 * binlerce dosyayı diskten geçirmek olurdu. Bulanık süzme bellekte, anlık.
 */
export function FilePalette() {
  const t = useT();
  const setUi = useStore((s) => s.setUi);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const cwd = tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;

  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = () => setUi({ filePaletteOpen: false });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    void api
      .listFiles(cwd)
      .then((list) => !cancelled && setFiles(list))
      // Okunamayan dizin paleti kilitlememeli: boş liste gösterip kapanmasını
      // bekliyoruz.
      .catch(() => !cancelled && setFiles([]));
    return () => {
      cancelled = true;
    };
  }, [cwd]);

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

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(".pop-row.on")?.scrollIntoView({ block: "nearest" });
  }, [index, rows]);

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

  return (
    <div className="overlay" onMouseDown={close}>
      <div
        className="palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (rows.length === 0) return;
            const yon = e.key === "ArrowDown" ? 1 : -1;
            setIndex((i) => (((i + yon) % rows.length) + rows.length) % rows.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const row = rows[index];
            if (row) sec(row, e.shiftKey);
          }
        }}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder={t("files.search")}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        <div className="palette-list" ref={listRef}>
          {files === null && <div className="pop-empty">{t("common.loading")}</div>}
          {files !== null && rows.length === 0 && (
            <div className="pop-empty">{t("files.empty")}</div>
          )}
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
        </div>

        <div className="palette-foot">
          <span className="dim">{t("files.hint")}</span>
        </div>
      </div>
    </div>
  );
}

/** Çizilen en fazla sonuç. */
const MAX_ROWS = 200;
