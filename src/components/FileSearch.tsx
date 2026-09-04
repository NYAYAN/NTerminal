import { useEffect, useMemo, useRef, useState } from "react";

import { joinDir } from "../lib/dirs";
import { baseName, rankFiles, shortenPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";

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
 * Dosya sütununun arama sonuçları — DÜZ bir liste, ağaç değil.
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
 * ## Sıralama
 *
 * `rankFiles` ile: en iyi eşleşme önce. O işlev bir kez ters yazılmıştı ve
 * aranan dosya listenin en sonunda kalıyordu; gerekçesi ve testi
 * `lib/fileRank.test.ts` içinde.
 */
export function FileSearch({
  cwd,
  query,
  onOpened,
}: {
  cwd: string;
  query: string;
  /**
   * Bir dosya GÖRÜNTÜLEYİCİDE açıldı — arama kutusunu boşaltmak için.
   *
   * BİLDİRİLEN HATA: "aradığım dosyaya tıklıyorum, detayı açılmıyor." Sebep
   * sütunun çizim sırasıydı: sorgu doluyken sonuç listesi HER ZAMAN
   * kazanıyordu, dolayısıyla `openFile` yolu ayarlasa da görüntüleyici hiç
   * çizilmiyordu — kullanıcı tıklıyor ve hiçbir şey olmuyormuş gibi
   * görünüyordu.
   *
   * Çözüm sırayı değiştirmek DEĞİL: yol öne alınsaydı, görüntüleyici açıkken
   * yazmaya başlamak sonuçları göstermezdi ve arama kullanılamaz hâle
   * gelirdi. Doğrusu aramanın işini BİTİRMİŞ olması — dosya bulundu ve
   * seçildi. Kutu yerinde kalıyor, yeni bir arama bir tuş uzakta.
   */
  onOpened: () => void;
}) {
  const t = useT();
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

        return (
          <button
            key={path}
            type="button"
            className="file-result"
            title={full}
            onClick={(e) => {
              // Shift: yolu komut satırına ekle — ağaçtaki tıklamayla aynı
              // ayrım, aynı değiştirici tuş.
              //
              // Shift'te sorgu KORUNUYOR: kullanıcı arka arkaya birkaç yol
              // eklemek isteyebilir ve listeyi elinden almak onu her seferinde
              // yeniden aramaya zorlardı. Düz tıklamada ise arama işini
              // bitirdi (bkz. `onOpened`).
              if (e.shiftKey) {
                useStore.getState().insertPath(full);
                return;
              }
              useStore.getState().openFile(full);
              onOpened();
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
