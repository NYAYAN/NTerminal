import { useLayoutEffect, useMemo, useRef } from "react";

import { placeSuggestions } from "../lib/anchor";
import { formatWhen } from "../lib/format";
import { useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { DELETE_SUGGESTION_KEY } from "../lib/suggest";
import { sessions, useStore } from "../store/useStore";
import { ArrowIcon, CloseIcon } from "./Icons";

/** İmleç satırı örtülmek üzereyken listenin bıraktığı boşluk (px). */
const ANCHOR_GAP = 4;

/**
 * Komut önerisi listesi.
 *
 * Neden terminalin İÇİNDE değil: öneriyi ekran tamponuna yazmak kabuğun kendi
 * satır düzenleyicisiyle yarışmak demek — kabuk satırı yeniden çizdiğinde
 * yazdığımız hayalet metin ya siliniyor ya da gerçek girdiye karışıyor.
 *
 * ## Neden yüzüyor
 *
 * Liste eskiden ızgarada ayrı bir satırdı (`grid-area: suggest`). Yüksekliği
 * öneri sayısıyla değiştiği için HER TUŞ VURUŞUNDA terminal alanı küçülüp
 * büyüyordu: `ResizeObserver` → `fit()` → yeni satır sayısı → PTY'ye yeni ölçü
 * → kabuk istemi yeniden çiziyor. Terminal hücresi ~17px, öneri satırı ~24px
 * olduğu için tek bir önerinin eklenmesi bile ekranı bir iki satır kaydırıyor
 * ve gözle görülür bir titreme üretiyordu.
 *
 * Liste artık terminalin ölçüsüne hiç dokunmuyor: `position: fixed`.
 *
 * Yeri terminal alanının ALT KENARINA YAPIŞIK ve sabit — imlece yapışıp her
 * satırda zıplayan bir kutu, gözün aradığı yeri sürekli değiştiriyor. Yazdığınız
 * satırı asla örtmüyor; imleç dibe yaklaşıp altta yer kalmadığında üste çıkıyor
 * (bkz. `lib/anchor.ts`).
 *
 * ## Düzen
 *
 * Warp'ın geçmiş paneli örnek alındı: üstte başlık şeridi, ortada komutlar,
 * altta klavye ipucu. Her satırda sağa yaslı olarak komutun EN SON ne zaman
 * çalıştırıldığı yazıyor — aynı ön ekle başlayan iki komut arasındaki seçim
 * çoğu zaman buna bakılarak yapılıyor ("dün çalıştırdığım olan").
 *
 * Liste ters sırada çiziliyor (en yeni komut en altta, istem satırına en
 * yakın): kabuk alışkanlığıyla "yukarı = daha eski" tutarlı kalsın.
 */
export function SuggestionBar() {
  const t = useT();
  const suggest = useStore((s) => s.ui.suggest);
  const history = useStore((s) => s.suggestHistory);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const ref = useRef<HTMLDivElement | null>(null);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];

  /**
   * Komut → en son çalıştırılma anı.
   *
   * Geçmiş en yeniden eskiye sıralı, yani aynı komutun İLK görüldüğü yer en
   * yenisi; sonrakiler eski tekrarlar ve yazılmıyor.
   */
  const times = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      if (entry.at && !map.has(entry.command)) map.set(entry.command, entry.at);
    }
    return map;
  }, [history]);

  /**
   * Konumlandırma.
   *
   * Ölçüm çizimden SONRA gerekiyor (listenin kendi yüksekliği yukarı mı aşağı
   * mı açılacağını belirliyor), ama boyamadan ÖNCE uygulanmalı — yoksa liste
   * bir kare yanlış yerde görünüyor. `useLayoutEffect` tam olarak bu aralık.
   */
  /*
   * Seçili satır GÖRÜNÜR kalıyor.
   *
   * BİLDİRİLEN HATA: "ok yönleriyle yukarı doğru gittiğimde bir şeyi seçtim
   * görünüyorum ama scroll ok ile beraber hareket etmediği için seçtiğim
   * şeyin yazısı görünmüyor". Liste yüksekliği sınırlı ve kaydırılabilir
   * (`max-height` + `overflow-y`), seçim ise sınırın dışına çıkabiliyordu —
   * yani kullanıcı neyi kabul edeceğini göremeden Enter'a basıyordu.
   *
   * `block: "nearest"`: liste yalnızca GEREKTİĞİ KADAR kayıyor. Ortalamak
   * her ok basışında listeyi zıplatır ve komşu satırların yerini değiştirir;
   * göz sırayı takip edemez hâle gelir. Aynı çözüm sekme çubuğunda da var
   * (etkin sekmeyi görünür tutan efekt).
   */
  useLayoutEffect(() => {
    const secili = ref.current?.querySelector<HTMLElement>(".suggest-row.on");
    secili?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [suggest?.index, suggest?.input]);

  /**
   * Panelin yerini ölçüp uygular.
   *
   * Ayrı bir işlev çünkü İKİ tetikleyicisi var: her çizim (içerik değişti) ve
   * düzenin değişmesi (pencere yeniden boyutlandı, kenar çubuğu sürüklendi,
   * yan panel açıldı). İkincisi bileşeni yeniden çizdirmiyor — abone olduğu
   * hiçbir depo dilimi değişmiyor — dolayısıyla yalnızca çizime bağlı bir
   * yerleştirme paneli ESKİ koordinatlarında bırakıyordu.
   *
   * BİLDİRİLEN HATA tam olarak buydu: "yukarı oka bastım sonra pencereyi
   * resize ettim, GEÇMİŞ kısmının boyutu bozuk geldi." Panel eski genişliği
   * ve eski üst kenarıyla ekranın ortasında kalıyordu.
   */
  const place = () => {
    const el = ref.current;
    if (!el || !tab) return;

    /*
     * Uygulama komut satırı açıkken dayanak İMLEÇ DEĞİL, kutu.
     *
     * O kipte kabuğun ızgaradaki imleci istemin sonunda öylece duruyor;
     * yazdığınız metin orada değil, kutuda. Listeyi imlece göre yerleştirmek
     * onu ekranın ortasında bırakırdı — ilgisiz bir yerde.
     *
     * Kutuyu DOM'dan okuyoruz: ölçüsü çizimden sonra belli oluyor ve depoya
     * kopyalamak her karede senkron tutulması gereken ikinci bir gerçek
     * üretirdi.
     */
    const box = document.querySelector<HTMLElement>(".command-input");
    if (box) {
      const rect = box.getBoundingClientRect();
      el.style.left = `${rect.left}px`;
      el.style.width = `${rect.width}px`;
      el.style.top = `${Math.max(0, rect.top - el.offsetHeight)}px`;
      return;
    }

    const anchor = sessions.get(tab.id)?.cursorAnchor();
    if (!anchor) return;

    el.style.left = `${anchor.left}px`;
    el.style.width = `${anchor.width}px`;

    el.style.top = `${placeSuggestions({
      anchorTop: anchor.top,
      cellHeight: anchor.cellHeight,
      areaBottom: anchor.bottom,
      height: el.offsetHeight,
      viewportHeight: window.innerHeight,
      gap: ANCHOR_GAP,
    })}px`;
  };

  // En son tanımlanan `place` her zaman elde: gözlemciyi her çizimde kurup
  // yıkmamak için aşağıdaki etki onu ref üzerinden çağırıyor.
  const placeRef = useRef(place);
  placeRef.current = place;

  // 1) İçerik değişince: her çizimden sonra, boyamadan önce.
  useLayoutEffect(place);

  /*
   * 2) Düzen değişince.
   *
   * `resize` tek başına yetmiyor: kenar çubuğunu sürüklemek ya da yan paneli
   * açmak pencereyi büyütmüyor ama panelin dayanağını yerinden oynatıyor.
   * Bu yüzden dayanakların KENDİLERİ gözleniyor.
   */
  const open = suggest !== null;
  useLayoutEffect(() => {
    if (!open) return;
    const run = () => placeRef.current();
    const observer = new ResizeObserver(run);
    observer.observe(document.body);
    for (const selector of [".command-input", ".terminal-area"]) {
      const node = document.querySelector(selector);
      if (node) observer.observe(node);
    }
    window.addEventListener("resize", run);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", run);
    };
  }, [open]);

  if (!suggest) return null;

  // Klasör önerileri diskten geliyor, geçmiş değil: silinecek bir şey yok.
  const deletable = suggest.kind !== "dirs";
  const deleteKey = prettyCombo(DELETE_SUGGESTION_KEY);
  const deleteTitle = t("suggest.deleteTitle", { key: deleteKey });

  return (
    <div className="suggest-bar" ref={ref}>
      <div className="suggest-head">
        <span className="suggest-title">
          {t(suggest.kind === "dirs" ? "suggest.titleDirs" : "suggest.title")}
        </span>
        <span className="spacer" />
        <span className="kbd">
          {suggest.index + 1}/{suggest.items.length}
        </span>
      </div>

      <div className="suggest-list">
        {suggest.items.map((item, index) => {
          const at = times.get(item);
          const rowClass = index === suggest.index ? "suggest-row on" : "suggest-row";
          return (
            /*
             * Satır ile silme düğmesi KARDEŞ, iç içe değil: satırın kendisi
             * bir düğme (tıklamak kabul ediyor) ve iç içe düğme hem geçersiz
             * işaretleme hem karışık tıklama demek — `GitChanges`teki satır
             * eylemleriyle aynı karar.
             */
            <div key={item} className="suggest-item">
              <button
                className={deletable ? `${rowClass} deletable` : rowClass}
                // Tıklama terminalden odağı almasın; kabul ettikten sonra odak
                // zaten terminale geri veriliyor.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => useStore.getState().acceptSuggestionAt(index)}
              >
                {/* İstem işareti her satırda: satırın bir KOMUT olduğunu söylüyor.
                    Seçim ayrı işaretlerle belli oluyor (arka plan, sol çizgi). */}
                <span className="suggest-mark" aria-hidden="true">
                  {">_"}
                </span>
                <span className="suggest-cmd">
                  {/* Yazdığınız kısım vurgusuz, önerinin devamı vurgulu: "bunu
                      yazdınız, şu eklenecek" ayrımı görünsün. */}
                  <span className="suggest-typed">{item.slice(0, suggest.input.length)}</span>
                  <span className="suggest-rest">{item.slice(suggest.input.length)}</span>
                </span>
                {/* Zaman bilinmiyorsa (eski kayıt, henüz yüklenmemiş geçmiş) alan
                    boş kalıyor: yer tutuyor ki komutlar satır satır kaymasın. */}
                <span className="suggest-when">{at ? formatWhen(at) : ""}</span>
              </button>
              {/* Her satırda duruyor: soluk, üzerine gelince etkin (bkz.
                  `.suggest-del`). Tıklanan SATIR siliniyor, seçili olan değil —
                  kabul etmedeki kuralın aynısı. Odağı kutudan almıyor: onay
                  kapandığında kullanıcı kaldığı yerden yazmaya devam etmeli. */}
              {deletable && (
                <button
                  type="button"
                  className="suggest-del"
                  title={deleteTitle}
                  aria-label={deleteTitle}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void useStore.getState().deleteSuggestionAt(index)}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Tuş başlıkları rozet olarak: "↑↓ gez · → kabul et" düz metin
          yazıldığında okların hangisinin TUŞ hangisinin süs olduğu
          okunmuyordu. Rozet sınırı bu ayrımı taşıyor.

          Oklar SVG, yazı tipi karakteri değil — sebebi Icons.tsx başlığında. */}
      <div className="suggest-foot">
        <span className="keycap">
          <ArrowIcon dir="up" size={10} />
        </span>
        <span className="keycap">
          <ArrowIcon dir="down" size={10} />
        </span>
        <span className="dim">{t("suggest.hintNav")}</span>
        <span className="keycap">
          <ArrowIcon dir="right" size={10} />
        </span>
        <span className="dim">{t("suggest.hintAccept")}</span>
        <span className="keycap keycap-word">Esc</span>
        <span className="dim">{t("suggest.hintDismiss")}</span>
        {deletable && (
          <>
            <span className="keycap keycap-word">{deleteKey}</span>
            <span className="dim">{t("suggest.hintDelete")}</span>
          </>
        )}
        {/* Kapsam SAĞA yaslı: soldaki üçlü "listede ne yapabilirim", bu ise
            "liste neyi gösteriyor" — ayrı sorular, ayrı yerler.

            Yalnızca yukarı okun açtığı son-komutlar panelinde anlamlı: ön ek
            eşleşmesi (`kind: "history"`) sekmeye göre süzülmüyor, kapsamı yok.
            `HistoryRecall` (Ctrl+R) penceresiyle AYNI kısayol ve AYNI metin —
            iki panelde iki farklı alışkanlık öğretmemek için. */}
        {suggest.kind === "recent" && (
          <>
            <span className="spacer" />
            <span className="dim">
              {t("recall.scope", {
                scope: t(suggest.scope === "all" ? "recall.scopeAll" : "recall.scopeTab"),
              })}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
