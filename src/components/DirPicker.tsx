import { useEffect, useMemo, useRef, useState } from "react";

import { filterDirs, joinDir, parentDir } from "../lib/dirs";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { anchorAbove } from "../lib/popover";
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
  const boxRef = useRef<HTMLDivElement | null>(null);

  const parent = parentDir(cwd);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    /*
     * Liste ÖNCE boşaltılıyor — süs değil, yanlış `cd`'nin önü.
     *
     * Hiçbir satır seçiciyi kapatmıyor, yani `cwd` bileşen yaşarken
     * değişebiliyor. Eski adlar ekranda kalsaydı satırların yolu
     * `joinDir(YENİ cwd, ESKİ ad)` olurdu: o aralıkta tıklanan satır var
     * olmayan bir dizine `cd` etmeye çalışırdı.
     */
    setNames(null);
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

  // Dizin değişince de başa dön: üst dizine çıkıldığında seçili satır eski
  // listenin sırasında kalırdı.
  useEffect(() => {
    setIndex(0);
  }, [query, cwd]);

  /*
   * Pencere ROZETİN ÜSTÜNDE açılıyor.
   *
   * Yerleşim listeden SONRA hesaplanıyor (`names` bağımlılığı): pencerenin
   * yüksekliği içeriğe göre değişiyor ve üstüne oturması için o yüksekliğin
   * bilinmesi gerekiyor. Boş listeyken hesaplayıp sonra doldurmak pencereyi
   * dayanağın üstüne bindiriyordu.
   */
  useEffect(() => anchorAbove(boxRef.current, ".ctx-chip.dir"), [names]);

  // Seçili satır listeden taşmasın; klavyeyle gezinirken görünür kalmalı.
  useEffect(() => {
    listRef.current?.querySelector(".pop-row.on")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  /**
   * Bir satırın karşılığı: kabuğa `cd` ve seçici o dizinde AÇIK KALIR.
   *
   * ## Hiçbir satır kapatmıyor
   *
   * BİLDİRİLEN İSTEK: "üst klasör dediğimde kapanmamalı", ardından "klasör
   * seçtikçe de kapanmasın, boşluğa tıklayınca kapanıyor zaten."
   *
   * İlk hâli her satırı bir VARIŞ sayıyordu: `cd` gönder, kapat. Oysa dizin
   * gezinmek adım adım bir iş — iki basamak yukarı çıkıp komşu dalın içine
   * inmek "rozete tıkla → satır → rozete tıkla → satır" diye tekrarlanıyordu.
   * Seçici açık kalınca aynı yolculuk tek açılışta bitiyor.
   *
   * Kapatmanın iki yolu ZATEN var ve ikisi de kullanıcının kendi kararı:
   * boşluğa tıklamak (kaplama) ve Escape. Bir eylemin yan etkisi olarak
   * kapanmak ise karar değil, sürpriz.
   *
   * `cd` gezinme için ERTELENMİYOR: çalışma dizini kabuğun süreç durumu
   * (bkz. bileşen başlığı) ve rozet, istem, dosya sütunu hep ondan
   * besleniyor. Ertelenmiş bir "gezinme dizini" tutmak ekrandaki o üç yeri
   * seçicinin iç durumundan ayrı düşürürdü.
   *
   * Seçici yeni dizine `ui.dirPicker` üzerinden taşınıyor — `cwd` bu
   * bileşenin propu, kendi içinde tutulan bir kopya ikinci bir doğru kaynak
   * olurdu.
   */
  const goto = (path: string) => {
    // `cd` her kabukta var ve boşluklu yol için tırnak gerekiyor.
    useStore.getState().insertCommand(`cd "${path}"`, true);
    useStore.getState().setUi({ dirPicker: path });
    /*
     * Arama BOŞALIYOR: sorgu bir ÖNCEKİ listeye aitti.
     *
     * Taşınmasaydı yeni dizin eski metinle süzülürdü — çoğu zaman boş bir
     * liste, üstelik sorgu doluyken üst dizin satırı da çizilmiyor (bkz.
     * `rows`). Yani "src" yazıp klasöre giren kullanıcı hem boş bir liste
     * hem de geri dönüş yolu olmayan bir pencere görürdü.
     */
    setQuery("");
    // Odak arama kutusunda kalmalı: tıklama onu satıra almıştı ve satır
    // birazdan yeni listeyle değişiyor — odak boşta kalırsa ok tuşları ve
    // Escape çalışmaz.
    inputRef.current?.focus();
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
    <div className="overlay popover-overlay" onMouseDown={onClose}>
      <div
        ref={boxRef}
        className="pop-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="pop-search"
          value={query}
          placeholder={t("dirs.search")}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        <div className="pop-list" ref={listRef}>
          {names === null && <div className="pop-empty">{t("common.loading")}</div>}
          {names !== null && rows.length === 0 && (
            <div className="pop-empty">{t("dirs.empty")}</div>
          )}
          {rows.map((row, i) => (
            <button
              key={row.key}
              type="button"
              className={i === index ? "pop-row on" : "pop-row"}
              onMouseEnter={() => setIndex(i)}
              onClick={() => goto(row.path)}
            >
              <span className="pop-mark" aria-hidden="true">
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
