import { useEffect, useMemo, useRef, useState } from "react";

import { joinDir, sameDir } from "../lib/dirs";
import { baseName, rankFiles, shortenPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useTextSearch } from "../lib/textSearch";
import { useStore } from "../store/useStore";
import { SearchStatus, TextResults, type HitRef } from "./TextResults";

/**
 * Gösterilecek en fazla sonuç.
 *
 * Ctrl+P paleti iki yüz gösteriyor; burası daha dar bir sütun ve liste dikey
 * taranıyor. Yüz satır kaydırmadan görülebilecek mesafenin çok ötesinde;
 * aranan dosya ilk onda değilse çözüm daha çok satır değil, daha iyi bir
 * sorgu.
 */
const MAX_ROWS = 100;

/**
 * Dosya sütununun ad araması — DÜZ bir liste, ağaç değil.
 *
 * ## Neden ağaç süzülmüyor
 *
 * Ağaç TEMBEL yükleniyor: her klasör yalnızca açıldığında okunuyor (gerekçesi
 * `FileTree` içinde — bütün ağacı önden okumak derin bir projede binlerce
 * klasör gezmek demek). Süzme yalnızca YÜKLENMİŞ dalları görebilirdi, yani
 * kullanıcı elle açmadığı bir klasördeki dosya aramada hiç çıkmazdı — sessiz
 * ve yanıltıcı bir sonuç.
 *
 * Bu yüzden arama ağacı süzmüyor, ayrı bir kaynağa bakıyor: `listFiles` özyineli
 * ve düz bir liste veriyor (Ctrl+P paletinin de kullandığı yol, bkz.
 * `src-tauri/src/files.rs` — derinlik ve ağır klasör sınırları orada). Sonuç da
 * düz bir liste olarak çiziliyor; ağaç biçiminde göstermek eşleşmeyen ara
 * klasörleri de çizmek demekti.
 *
 * ## Seçim aramayı KAPATMIYOR
 *
 * Görüntüleyici artık sütunun içinde değil, YANINDA açılıyor. Eskiden ikisi
 * aynı yeri paylaşıyordu ve bir sonuca tıklamak aramayı kapatmak zorundaydı —
 * yoksa liste görüntüleyiciyi örtüyordu (BİLDİRİLEN: "aradığım dosyaya
 * tıklıyorum, detayı açılmıyor"). Şimdi liste solda kalıyor, dosya sağda
 * açılıyor; kullanıcı adaylar arasında tıklayarak gezebiliyor. Ağaca dönmek
 * aramayı kapatmak: büyüteç ya da Esc. Açık olan dosyanın satırı işaretli.
 *
 * ## Sıralama
 *
 * `rankFiles` ile: en iyi eşleşme önce. O işlev bir kez ters yazılmıştı ve
 * aranan dosya listenin en sonunda kalıyordu; gerekçesi ve testi
 * `lib/fileRank.test.ts` içinde.
 */
export function FileSearch({ cwd, query }: { cwd: string; query: string }) {
  const t = useT();
  const viewerPath = useStore((s) => s.ui.viewerPath);
  const [files, setFiles] = useState<string[] | null>(null);
  /**
   * Hangi dizin için okuduk.
   *
   * Liste BİR KEZ okunuyor, her tuş vuruşunda değil: yazdıkça diski yeniden
   * gezmek her harfte binlerce dosya demek. Dizin değişirse (sekme değişti,
   * `cd` yapıldı) yeniden okunuyor.
   */
  const okunanDizin = useRef<string | null>(null);

  useEffect(() => {
    if (okunanDizin.current === cwd) return;
    okunanDizin.current = cwd;

    let cancelled = false;
    setFiles(null);
    void api
      .listFiles(cwd)
      .then((list) => !cancelled && setFiles(list))
      // Okunamayan dizin (izin, kopmuş ağ sürücüsü) paneli kilitlememeli.
      .catch(() => !cancelled && setFiles([]))
      .finally(() => {
        // Gerçekten iptal edildiyse anahtar geri alınıyor, yoksa sütun bir
        // daha hiç okumaz ve "Yükleniyor…" ekranda asılı kalır.
        if (cancelled && okunanDizin.current === cwd) okunanDizin.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const rows = useMemo(() => rankFiles(files ?? [], query, MAX_ROWS), [files, query]);

  if (files === null) return <div className="pop-empty">{t("common.loading")}</div>;
  if (rows.length === 0) return <div className="pop-empty">{t("tree.noMatch")}</div>;

  return (
    <div className="panel-list file-results">
      {rows.map((path) => {
        const full = joinDir(cwd, path);
        // Klasör zinciri ayrı bir satırda ve soluk: dar sütunda ayırt edici
        // olan dosya ADI, yol ise onu doğrulayan ikinci bilgi.
        const dir = path.includes("/") || path.includes("\\") ? shortenPath(path, 2) : null;
        const shown = !!viewerPath && sameDir(full, viewerPath);

        return (
          <button
            key={path}
            type="button"
            className={shown ? "file-result on" : "file-result"}
            aria-current={shown || undefined}
            title={full}
            onClick={(e) => {
              // Shift: yolu komut satırına ekle — ağaçtaki tıklamayla aynı
              // ayrım, aynı değiştirici tuş.
              if (e.shiftKey) {
                useStore.getState().insertPath(full);
                return;
              }
              useStore.getState().openFile(full);
            }}
          >
            <span className="file-result-name">{baseName(path)}</span>
            {dir && <span className="file-result-dir">{dir}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Dosya sütununun İÇERİK araması — paletin "Dosya içeriği" sekmesiyle aynı
 * arama ve aynı sonuç listesi (`TextResults`), bir farkla: burada liste seçimde
 * kapanmıyor.
 *
 * Bu kipin asıl işi bu: eşleşmeler solda dururken her birine tıklayıp sağdaki
 * görüntüleyicide o satırı görmek. Palet seçimde kapanıyor; bir sonraki
 * eşleşme için yeniden açmak gerekiyor. Sütun ise listeyi elde tutuyor —
 * VS Code'un arama görünümüyle editörü gibi.
 *
 * Dosyalar katlanabilir (kalabalık bir kilit dosyası listeyi doldurmasın);
 * görüntüleyicide açık olan satır işaretli.
 */
export function ContentSearch({ cwd, query }: { cwd: string; query: string }) {
  const flags = useStore((s) => s.ui.searchFlags);
  const viewerPath = useStore((s) => s.ui.viewerPath);
  const reveal = useStore((s) => s.ui.viewerReveal);
  const state = useTextSearch(cwd, query, flags, true);

  const pick = ({ file, hit }: HitRef, shift: boolean) => {
    const full = joinDir(cwd, file.path);
    if (shift) useStore.getState().insertPath(full);
    else useStore.getState().openFile(full, { line: hit.line, col: hit.col, len: hit.len });
  };

  const isCurrent = ({ file, hit }: HitRef) =>
    !!viewerPath && !!reveal && reveal.line === hit.line && sameDir(joinDir(cwd, file.path), viewerPath);

  return (
    <div className="panel-list file-results content-results">
      <SearchStatus state={state} />
      {state.result && state.result.files.length > 0 && (
        <TextResults
          result={state.result}
          collapsible
          isCurrent={isCurrent}
          onPick={pick}
          stale={state.status === "searching"}
        />
      )}
    </div>
  );
}
