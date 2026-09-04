import { useEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import { useStore } from "../store/useStore";
import { FileSearch } from "./FileSearch";
import { FileTree, useActiveCwd } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { CollapseAllIcon, ExpandAllIcon, SearchIcon } from "./Icons";

/** Sütunun inebileceği ve çıkabileceği genişlik (px). */
const MIN_WIDTH = 200;
/**
 * Üst sınır kenar çubuğunun sınırından (480) belirgin şekilde YÜKSEK.
 *
 * Sebep içerik: kenar çubuğu sekme adı gösteriyor, burası dosyanın kendisini —
 * görüntüleyici bu sütunda açılıyor. Satırları sarmayan bir kod dosyasını
 * okumak 480px'te sürekli yatay kaydırma demek.
 */
const MAX_WIDTH = 900;

/**
 * Dosya sütunu — grupların SAĞINDA, terminalin solunda.
 *
 * ## Neden sağ panelin sekmesi değil
 *
 * Önceki hâli sağ panelin dördüncü sekmesiydi ("Dosyalar") ve gerekçesi
 * "ikinci bir çekmece açmayalım"dı. Ölçülen sonuç başka: ağaç bir GEZİNME
 * yüzeyi, geçmiş/favoriler/değişiklikler ise BAKILAN listeler. Gezinirken
 * terminale bakmak gerekiyor ve ağaç sağda açıldığında terminali daraltıyor,
 * üstelik grup listesiyle arasında bütün pencere duruyordu — oysa ikisi de
 * aynı işin parçası: "hangi projede, hangi dosyada".
 *
 * Şimdi düzenin sırası soldan sağa şu: gruplar → dosyalar → terminal →
 * (isteğe bağlı) sağ panel. Başlık çubuğundaki iki görünüm düğmesinin sırası
 * da bu (bkz. `titlebar.test.tsx`).
 *
 * ## İki durum, tek sütun
 *
 * Yol seçilmişse içerik (`FileViewer`), yoksa ağaç. Görüntüleyicinin "geri"
 * düğmesi yolu boşaltıyor ve ağaca dönüyor — ikisi aynı sütunun iki hâli,
 * ayrı bir yer değil.
 *
 * ## Genişlik sürüklenebilir ve KALICI
 *
 * BİLDİRİLEN HATA: "bir dosyayı aradım ve dosyalar kısmında açtım, o alanı
 * genişletemiyorum." İlk hâli sabit genişlikteydi; ağaç için yetiyordu ama
 * görüntüleyici de buraya açıldığı için dosya içeriği bir şeride sıkışıyordu.
 * Tutamak kenar çubuğununkiyle aynı düzenekte (sağ kenar, sürükleyince
 * genişliyor) ve bırakıldığında ayara yazılıyor — kullanıcı ölçüyü her
 * açılışta yeniden vermek zorunda kalmamalı.
 */
export function FilePanel() {
  const t = useT();
  const viewerPath = useStore((s) => s.ui.viewerPath);
  const setUi = useStore((s) => s.setUi);
  const width = useStore((s) => s.settings.appearance.filesWidth);
  const patchAppearance = useStore((s) => s.patchAppearance);
  const cwd = useActiveCwd();

  /**
   * Arama sorgusu.
   *
   * YEREL durum, ayarda ya da depoda değil: bir arama tek seferlik bir iş ve
   * uygulamayı yeniden açan kullanıcı ağacı görmek istiyor, önceki aramasını
   * değil.
   */
  const [query, setQuery] = useState("");
  /**
   * Arama kutusu AÇIK mı.
   *
   * Kutu sürekli durmuyor: sütunun asıl işi ağaç ve kutu her zaman görünür
   * olduğunda ondan bir satır yer çalıyordu. Başlıktaki büyüteç açıyor.
   *
   * Sorgudan AYRI bir durum: kutu açık ama boş olabilir (henüz yazılmadı) ve
   * o hâlde ağaç görünmeye devam etmeli.
   */
  const [aramaAcik, setAramaAcik] = useState(false);
  /** Arama etkin mi — boşluk yazmak aramayı başlatmasın. */
  const arama = query.trim().length > 0;

  /**
   * Aramayı bitirir: kutuyu kapatır ve sorguyu boşaltır.
   *
   * Üç yol da buraya çıkıyor — düğmeyle kapatmak, Escape ve bir sonucu
   * seçmek. Tek yerde olması şart: sorgu boşaltılıp kutu açık bırakılırsa
   * ekranda işlevsiz bir kutu kalıyor, kutu kapatılıp sorgu bırakılırsa
   * sonuç listesi görünmeye devam ediyordu.
   */
  const aramayiKapat = () => {
    setQuery("");
    setAramaAcik(false);
  };

  const expanded = useStore((s) => s.ui.treeExpanded);
  const acikVar = expanded.length > 0;
  /**
   * Toplu daraltmadan ÖNCEKİ hâl — ikinci tıklama bunu geri açıyor.
   *
   * Yerel durum, depoda değil: bu bir geri alma tamponu, uygulamanın durumu
   * değil. Sütun kapanınca unutulması da doğru — kullanıcı geri döndüğünde
   * ağaç neyse onu görüyor, aylar önceki bir daraltmanın gölgesini değil.
   */
  const [katlanmis, setKatlanmis] = useState<readonly string[]>([]);

  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  /*
   * Sürükleme sırasında DOM'a yazıyoruz, ayara değil.
   *
   * Her karede ayarı güncellemek her karede diske yazmak demek (`patchAppearance`
   * kalıcılaştırıyor). Kenar çubuğu da aynı düzeneği kullanıyor.
   */
  useEffect(() => {
    const move = (event: MouseEvent) => {
      const state = drag.current;
      if (!state) return;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, state.startWidth + (event.clientX - state.startX)),
      );
      const el = document.querySelector<HTMLElement>(".file-panel");
      if (el) el.style.width = `${next}px`;
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      const el = document.querySelector<HTMLElement>(".file-panel");
      const final = el ? parseInt(el.style.width || `${width}`, 10) : width;
      if (Number.isFinite(final) && final !== width) {
        void patchAppearance({ filesWidth: final });
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [width, patchAppearance]);

  return (
    <aside className="file-panel" style={{ width }}>
      <div className="file-panel-head">
        <span className="file-panel-title">{t("app.files")}</span>

        {/* Büyüteç başlığın HEMEN yanında: aramayı açan şey burası ve
         * "DOSYALAR" yazısıyla birlikte okunuyor. Sağdaki düğmeler
         * (katlama, kapatma) sütuna ait eylemler; arama içeriğe ait. */}
        <button
          className={aramaAcik ? "icon-btn on" : "icon-btn"}
          title={t(aramaAcik ? "tree.searchClose" : "tree.searchOpen")}
          aria-pressed={aramaAcik}
          onClick={() => (aramaAcik ? aramayiKapat() : setAramaAcik(true))}
        >
          <SearchIcon size={13} />
        </button>

        {/* Esneyen boşluk: başlık ve büyüteç solda, sütun eylemleri sağda.
            Başlık `flex: 1` olsaydı büyüteç de sağa savrulurdu. */}
        <span className="file-panel-spacer" />

        {/* Toplu katlama — kapatma çarpısının SOLUNDA, "Değişiklikler"deki
         * düğmeyle aynı yerde ve aynı simgelerle.
         *
         * İKİ DURUM, ama "tümünü genişlet" DEĞİL: ağaç tembel yükleniyor
         * (bkz. `FileTree`), yani "tümü" tüm dizin ağacını diskten yürümek
         * demek — derin bir projede binlerce klasör ve on binlerce satır.
         * Bunun yerine daraltmadan önceki hâl hatırlanıyor ve ikinci tıklama
         * onu GERİ AÇIYOR. Kullanıcının istediği iş bu: üst düzeye bakmak
         * için toplamak, sonra kaldığı yere dönmek.
         *
         * Ağaç görünmüyorken (arama ya da görüntüleyici) çizilmiyor: o anda
         * katlanacak bir şey ekranda yok. Açık klasör de yoksa ve
         * hatırlanan bir hâl de yoksa yapacağı iş kalmıyor. */}
        {!arama && !viewerPath && (acikVar || katlanmis.length > 0) && (
          <button
            className="icon-btn"
            title={t(acikVar ? "tree.collapseAll" : "tree.reopen")}
            aria-pressed={!acikVar && katlanmis.length > 0}
            onClick={() => {
              if (acikVar) {
                setKatlanmis(expanded);
                setUi({ treeExpanded: [] });
                return;
              }
              setUi({ treeExpanded: katlanmis });
              setKatlanmis([]);
            }}
          >
            {acikVar ? <CollapseAllIcon size={14} /> : <ExpandAllIcon size={14} />}
          </button>
        )}
        {/* Kapatma yolu sütunun KENDİSİNDE de var.
         *
         * Başlık çubuğundaki düğme zaten kapatıyor, ama bir paneli kapatmanın
         * yolu panelin üstünde aranıyor — sağ panelde de aynı çarpı duruyor. */}
        <button
          className="icon-btn"
          title={t("app.filesCloseTitle")}
          onClick={() => setUi({ treeOpen: false })}
        >
          ×
        </button>
      </div>

      {/* Arama kutusu YALNIZCA açıldığında.
       *
       * `autoFocus`: kutuyu açan kullanıcı yazmak istiyor; ayrıca fareyi
       * düğmeden kutuya taşımak zorunda kalmamalı. Kutu koşullu çizildiği
       * için her açılışta yeniden kuruluyor, yani odak her seferinde
       * geliyor.
       *
       * `onKeyDown` durduruluyor: uygulamanın genel kısayol yakalayıcısı
       * pencere düzeyinde dinliyor (bkz. `App.tsx`) ve kutuya yazılan harfler
       * oraya sızarsa "n" yeni sekme açardı. Escape aramayı tümden kapatıyor —
       * çıkmanın en kısa yolu. */}
      {aramaAcik && (
        <div className="panel-controls">
          <input
            autoFocus
            value={query}
            placeholder={t("tree.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") aramayiKapat();
            }}
          />
        </div>
      )}

      {/*
       * Üç durum ve sıra ÖNEMLİ:
       *
       *  1. Arama yazılmışsa sonuçlar — kullanıcı o an dosya arıyor, en son
       *     istediği şey aramanın altında duran eski bir dosya içeriği.
       *  2. Yol seçilmişse içerik.
       *  3. Yoksa ağaç.
       *
       * Sıranın bedeli bir kez ödendi: sonuç listesi sorgu doluyken HER ZAMAN
       * kazandığı için, bir sonuca tıklamak `viewerPath`i ayarlasa bile
       * görüntüleyici çizilmiyordu — kullanıcının gördüğü "tıklıyorum, detay
       * açılmıyor"du. Sırayı ters çevirmek çözüm değil (görüntüleyici açıkken
       * yazmak sonuçları göstermezdi); doğrusu seçim yapıldığında aramanın
       * işini bitirmiş olması, o yüzden `onOpened` kutuyu boşaltıyor.
       *
       * Arama kutusu boşalınca (seçim, Escape ya da elle silme) görüntüleyici
       * geri geliyor: sonuç listesi aramanın bir GÖRÜNÜMÜ, kalıcı bir durum
       * değil.
       */}
      {arama && cwd && <FileSearch cwd={cwd} query={query} onOpened={aramayiKapat} />}
      {!arama && viewerPath && <FileViewer path={viewerPath} />}

      {/*
       * Ağaç SÖKÜLMÜYOR, gizleniyor.
       *
       * BİLDİRİLEN HATA: dizinleri aça aça en alta inip bir dosyaya
       * tıklıyorsunuz, içerik açılıyor; "geri" dediğinizde açtığınız bütün
       * dizinler kapanmış oluyor.
       *
       * SEBEP: ağacın açılma durumu her `Level` bileşeninin kendi
       * `useState`inde yaşıyor (tembel yükleme böyle çalışıyor — bkz.
       * `FileTree`). Görüntüleyici çizilirken ağaç koşullu daldan düşüyor,
       * React onu söküyor ve o durumun tamamı gidiyor. Geri dönmek sıfırdan
       * bir ağaç kuruyor.
       *
       * Gizlemek durumu YERİNDE bırakıyor; yan kazanç olarak açılmış
       * dizinlerin girdileri yeniden okunmuyor. `display: contents` (bkz.
       * `.file-tree-keep`) sarmalayıcıyı düzenden çıkarıyor, yani ağaç
       * eskisi gibi panelin doğrudan esnek öğesi kalıyor.
       *
       * Not: sütunu tümden KAPATIP açmak durumu hâlâ sıfırlıyor — o zaman
       * `FilePanel`in kendisi sökülüyor. Bunu korumak açılma durumunu
       * bileşenlerin dışına taşımayı gerektiriyor; bildirilen akış bu değil.
       */}
      <div className="file-tree-keep" data-hidden={arama || !!viewerPath}>
        <FileTree />
      </div>

      {/* Tutamak SAĞ kenarda: sütun solda olduğu için genişleyen kenar o.
       *
       * Sağ panelin tutamağı aynı sebeple SOL kenarında. En sonda çiziliyor ve
       * `z-index` taşıyor: içeriğin üstünde kalmalı, yoksa ağaç satırları
       * imleci yakalıyor. */}
      <div
        className="file-panel-resize"
        onMouseDown={(e) => {
          drag.current = { startX: e.clientX, startWidth: width };
          e.preventDefault();
        }}
      />
    </aside>
  );
}
