import { useLayoutEffect, useMemo, useRef } from "react";

import { placeSuggestions } from "../lib/anchor";
import { formatWhen } from "../lib/format";
import { useT } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import { ArrowIcon } from "./Icons";

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
  useLayoutEffect(() => {
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
  });

  if (!suggest) return null;

  return (
    <div className="suggest-bar" ref={ref}>
      <div className="suggest-head">
        <span className="suggest-title">{t("suggest.title")}</span>
        <span className="spacer" />
        <span className="kbd">
          {suggest.index + 1}/{suggest.items.length}
        </span>
      </div>

      <div className="suggest-list">
        {suggest.items.map((item, index) => {
          const at = times.get(item);
          return (
            <button
              key={item}
              className={index === suggest.index ? "suggest-row on" : "suggest-row"}
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
      </div>
    </div>
  );
}
