import { useEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import { useStore } from "../store/useStore";
import { ContentSearch, FileSearch } from "./FileSearch";
import { FileTree, useActiveCwd } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { CollapseAllIcon, ExpandAllIcon, SearchIcon } from "./Icons";
import { flagForKey, SearchToggles, toggleFlag } from "./SearchToggles";

/** Ağaç sütununun inebileceği ve çıkabileceği genişlik (px). */
const MIN_WIDTH = 200;
/**
 * Üst sınır kenar çubuğunun sınırından (480) biraz yüksek.
 *
 * Eskiden 900'dü, çünkü görüntüleyici de bu sütunda açılıyordu ve kod okumak
 * genişlik istiyordu. Görüntüleyici artık YANINDA, kendi genişliğinde; sütunda
 * yalnızca dosya adları kalıyor. Eski ayarda 900'e çekilmiş bir sütun da
 * burada (ve CSS'te) sınırlanıyor — yoksa görüntüleyiciye yer kalmazdı.
 */
const MAX_WIDTH = 600;

/** Aramada ok tuşlarıyla gezilen satırlar: ad sonuçları, dosya başlıkları, eşleşmeler. */
const SONUC = ".file-result, .hit-head, .hit-line";

/**
 * Panel kapanırken odak çalışılan yere dönüyor: uygulamanın komut kutusu
 * açıksa oraya, değilse terminale. Sökülen bir düğmede kalan odak `body`ye
 * düşüyor ve yazılan hiçbir yere gitmiyordu.
 */
function focusWorkArea() {
  const box = document.querySelector<HTMLTextAreaElement>(".command-input textarea");
  if (box && !box.disabled) {
    box.focus();
    return;
  }
  useStore.getState().activeSession()?.focus();
}

/**
 * Dosya paneli — terminalin ÜSTÜNDE, sol kenarında açılan katman.
 *
 * ## Neden terminali daraltmıyor
 *
 * İSTEK: "klasörleri göster'e basınca açılıyor ve terminali sıkıştırıyor;
 * üstüne açılacak şekilde yapalım." İlk hâli ızgarada kendi sütunuydu
 * (gruplar → dosyalar → terminal): açılınca terminal daralıyor, xterm yeni
 * sütun sayısıyla yeniden ölçülüyor, PTY'ye yeni boyut gidiyor ve kabuk ekranı
 * YENİDEN çiziyordu — uzun satırlar kırılıyor, `htop`/`vim` gibi tam ekran
 * programlar baştan çiziliyordu. Bir bakış için açılan bir panelin bedeli bu
 * olmamalı.
 *
 * Şimdi panel terminal alanının ızgara hücresinde, terminalin ÜSTÜNDE duran
 * mutlak konumlu bir katman: terminalin boyutu hiç değişmiyor. Katmanın
 * kendisi tıklamaları geçiriyor (`pointer-events: none`); yalnızca sütun ve
 * görüntüleyici yakalıyor — ağaç açıkken sağda kalan terminale tıklanabiliyor.
 *
 * Sekme çubuğu, komut kutusu ve durum çubuğu ÖRTÜLMÜYOR: ağaçta Shift+tıklama
 * yolu komut kutusuna ekliyor, kutu görünür kalmalı.
 *
 * ## Dosya seçilince yanında, kalan bütün genişlikte
 *
 * İSTEK: "bir dosyayı da seçersem yanına full width olarak açılsın." Ağaç
 * solda kalıyor, görüntüleyici sağdaki bütün genişliği alıyor (bkz.
 * `FileViewer`). Başka bir dosyaya tıklamak görüntüleyiciyi değiştiriyor;
 * geri-ileri yok.
 *
 * ## Kapatmak
 *
 * Başlık çubuğundaki klasör düğmesi, sütunun × düğmesi ya da panelin içindeyken
 * Esc. Esc katman katman: önce arama kapanıyor, sonra panel. Düzenleme yazı
 * alanındaki Esc yazı alanının — orada panel kapanmıyor.
 */
export function FilePanel() {
  const t = useT();
  const viewerPath = useStore((s) => s.ui.viewerPath);
  const reveal = useStore((s) => s.ui.viewerReveal);
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
  /**
   * Ne aranıyor: dosya ADI mı, İÇERİK mi. Sorgu iki kipte ortak — adında
   * bulunamayanı içinde aramak için yeniden yazmak gerekmesin.
   */
  const [kip, setKip] = useState<"name" | "content">("name");
  /** Arama etkin mi — boşluk yazmak aramayı başlatmasın. */
  const arama = query.trim().length > 0;

  const layerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  /**
   * Aramayı bitirir: kutuyu kapatır ve sorguyu boşaltır.
   *
   * İki yol da buraya çıkıyor — düğmeyle kapatmak ve Esc. Tek yerde olması
   * şart: sorgu boşaltılıp kutu açık bırakılırsa ekranda işlevsiz bir kutu
   * kalıyor, kutu kapatılıp sorgu bırakılırsa sonuç listesi görünmeye devam
   * ediyordu.
   */
  const aramayiKapat = () => {
    setQuery("");
    setAramaAcik(false);
  };

  /** Esc ile arama kapanınca odak büyüteçte: ikinci Esc paneli kapatsın. */
  const aramayiKapatOdakla = () => {
    aramayiKapat();
    searchButtonRef.current?.focus();
  };

  /** Paneli kapatır; odak paneldeyse çalışılan yere döner (bkz. `focusWorkArea`). */
  const paneliKapat = () => {
    if (layerRef.current?.contains(document.activeElement)) focusWorkArea();
    setUi({ treeOpen: false });
  };

  /** Sonuçlarda ok tuşlarıyla gezinme; ilk satırdan yukarı kutuya dönüyor. */
  const odakTasi = (from: EventTarget | null, yon: 1 | -1) => {
    const items = [...(resultsRef.current?.querySelectorAll<HTMLElement>(SONUC) ?? [])];
    const at = from instanceof HTMLElement ? items.indexOf(from) : -1;
    const next = at === -1 ? (yon === 1 ? items[0] : undefined) : items[at + yon];
    if (next) {
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    } else if (yon === -1 && at === 0) {
      inputRef.current?.focus();
    }
  };

  const expanded = useStore((s) => s.ui.treeExpanded);
  const acikVar = expanded.length > 0;
  /**
   * Toplu daraltmadan ÖNCEKİ hâl — ikinci tıklama bunu geri açıyor.
   *
   * Yerel durum, depoda değil: bu bir geri alma tamponu, uygulamanın durumu
   * değil. Panel kapanınca unutulması da doğru — kullanıcı geri döndüğünde
   * ağaç neyse onu görüyor, aylar önceki bir daraltmanın gölgesini değil.
   */
  const [katlanmis, setKatlanmis] = useState<readonly string[]>([]);

  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  /*
   * Sürükleme sırasında DOM'a yazıyoruz, ayara değil.
   *
   * Her karede ayarı güncellemek her karede diske yazmak demek (`patchAppearance`
   * kalıcılaştırıyor). Kenar çubuğu da aynı düzeneği kullanıyor.
   *
   * Bırakınca ÇİZİLEN genişlik yazılıyor, istenen değil: CSS sütunu
   * görüntüleyiciye yer bırakacak kadar sınırlıyor (bkz. `.files-overlay
   * .file-panel`); sınırın ötesine sürüklenen değer ayara yazılsaydı geniş
   * pencerede sütun beklenmedik biçimde büyürdü.
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
      const drawn = el ? Math.round(el.getBoundingClientRect().width) : 0;
      const final = drawn > 0 ? drawn : el ? parseInt(el.style.width || `${width}`, 10) : width;
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
    <div
      className="files-layer"
      ref={layerRef}
      onKeyDown={(e) => {
        // Katman katman Esc: arama kutusu ve sonuçlar kendi Esc'lerini
        // durduruyor; buraya gelen Esc paneli kapatıyor. Düzenleme yazı
        // alanında Esc yazı alanının.
        if (e.key !== "Escape" || e.defaultPrevented) return;
        if ((e.target as HTMLElement).closest(".viewer-editor")) return;
        e.preventDefault();
        paneliKapat();
      }}
    >
      <div className={viewerPath ? "files-overlay with-viewer" : "files-overlay"}>
        <aside className="file-panel" style={{ width }}>
          <div className="file-panel-head">
            <span className="file-panel-title">{t("app.files")}</span>

            {/* Büyüteç başlığın HEMEN yanında: aramayı açan şey burası ve
             * "DOSYALAR" yazısıyla birlikte okunuyor. Sağdaki düğmeler
             * (katlama, kapatma) sütuna ait eylemler; arama içeriğe ait. */}
            <button
              ref={searchButtonRef}
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
             * Ağaç görünmüyorken (arama) çizilmiyor: o anda katlanacak bir şey
             * ekranda yok. Görüntüleyici açıkken ağaç YANINDA görünüyor, düğme
             * de duruyor. Açık klasör de yoksa ve hatırlanan bir hâl de yoksa
             * yapacağı iş kalmıyor. */}
            {!arama && (acikVar || katlanmis.length > 0) && (
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
            {/* Kapatma yolu panelin KENDİSİNDE de var.
             *
             * Başlık çubuğundaki düğme zaten kapatıyor, ama bir paneli kapatmanın
             * yolu panelin üstünde aranıyor — sağ panelde de aynı çarpı duruyor.
             * Açık dosyayla birlikte kapatıyor; dosyayı tek başına kapatan çarpı
             * görüntüleyicinin başlığında. */}
            <button className="icon-btn" title={t("app.filesCloseTitle")} onClick={paneliKapat}>
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
           * çıkmanın en kısa yolu. Aşağı ok sonuçlara iniyor. */}
          {aramaAcik && (
            <div className="panel-controls column file-search-box">
              <div className="seg full" role="tablist" aria-label={t("search.modeLabel")}>
                {(["name", "content"] as const).map((which) => (
                  <button
                    key={which}
                    type="button"
                    role="tab"
                    aria-selected={kip === which}
                    className={kip === which ? "on" : undefined}
                    // Odak kutuda kalsın: kipi değiştirip yazmaya devam edilebilmeli.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setKip(which)}
                  >
                    {t(which === "name" ? "search.nameShort" : "search.contentShort")}
                  </button>
                ))}
              </div>
              <div className="search-field">
                <input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  placeholder={kip === "name" ? t("tree.searchPlaceholder") : t("search.contentPlaceholder")}
                  spellCheck={false}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      aramayiKapatOdakla();
                      return;
                    }
                    const flag = kip === "content" ? flagForKey(e) : null;
                    if (flag) {
                      e.preventDefault();
                      toggleFlag(flag);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      odakTasi(null, 1);
                    }
                  }}
                />
                {kip === "content" && <SearchToggles />}
              </div>
            </div>
          )}

          {/*
           * Arama yazılmışsa sonuçlar ağacın YERİNDE; görüntüleyici yanda
           * kaldığı için seçim aramayı kapatmıyor (gerekçesi `FileSearch`ta).
           * Arama kutusu boşalınca (Esc, büyüteç ya da elle silme) ağaç geri
           * geliyor: sonuç listesi aramanın bir GÖRÜNÜMÜ, kalıcı bir durum
           * değil.
           *
           * Sarmalayıcı `display: contents`: liste eskisi gibi sütunun esnek
           * öğesi kalıyor; yalnızca tuşlar burada yakalanıyor.
           */}
          {arama && cwd && (
            <div
              className="file-search-area"
              ref={resultsRef}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  odakTasi(e.target, e.key === "ArrowDown" ? 1 : -1);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  aramayiKapatOdakla();
                }
              }}
            >
              {kip === "name" ? <FileSearch cwd={cwd} query={query} /> : <ContentSearch cwd={cwd} query={query} />}
            </div>
          )}

          {/*
           * Ağaç SÖKÜLMÜYOR, gizleniyor.
           *
           * BİLDİRİLEN HATA: dizinleri aça aça en alta inip bir dosyaya
           * tıklıyorsunuz, içerik açılıyor; "geri" dediğinizde açtığınız bütün
           * dizinler kapanmış oluyor. Açık klasörler artık depoda
           * (`ui.treeExpanded`), ama okunmuş klasörlerin girdileri her `Level`in
           * kendi durumunda: arama sırasında ağacı gizlemek onları yeniden
           * okutmuyor. `display: contents` (bkz. `.file-tree-keep`) sarmalayıcıyı
           * düzenden çıkarıyor, yani ağaç eskisi gibi sütunun doğrudan esnek
           * öğesi kalıyor.
           */}
          <div className="file-tree-keep" data-hidden={arama}>
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

        {/* `key` dosya yolu: başka dosyaya geçmek görüntüleyiciyi baştan
            kuruyor — kaydırma, düzenleme ve geri alma geçmişi önceki dosyadan
            taşınmasın. Kaydedilmemiş olan sökülürken yazılıyor. */}

        {viewerPath && (
          <section className="file-viewer-pane">
            <FileViewer key={viewerPath} path={viewerPath} root={cwd} reveal={reveal} />
          </section>
        )}
      </div>
    </div>
  );
}
