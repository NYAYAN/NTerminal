import { useLayoutEffect, useRef } from "react";

import { placeSuggestions } from "../lib/anchor";
import { useT } from "../lib/i18n";
import { ChevronIcon } from "./Icons";
import { sessions, useStore } from "../store/useStore";

/** Liste ile imleç satırı arasındaki boşluk (px). */
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
 * Yeri terminalin DİBİ ve sabit — imlece yapışıp her satırda zıplayan bir kutu,
 * gözün aradığı yeri sürekli değiştiriyor. Yazdığınız satırı asla örtmüyor;
 * imleç dibe yaklaşıp altta yer kalmadığında üste çıkıyor (bkz. `lib/anchor.ts`).
 *
 * Liste ters sırada çiziliyor (en yeni komut en altta, istem satırına en
 * yakın): kabuk alışkanlığıyla "yukarı = daha eski" tutarlı kalsın.
 */
export function SuggestionBar() {
  const t = useT();
  const suggest = useStore((s) => s.ui.suggest);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const ref = useRef<HTMLDivElement | null>(null);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];

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
      <div className="suggest-list">
        {suggest.items.map((item, index) => (
          <button
            key={item}
            className={index === suggest.index ? "suggest-row on" : "suggest-row"}
            // Tıklama terminalden odağı almasın; kabul ettikten sonra odak
            // zaten terminale geri veriliyor.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => useStore.getState().acceptSuggestionAt(index)}
          >
            {/* İşaret her satırda çiziliyor, yalnızca seçili olanda görünüyor:
                yalnızca seçilide çizmek satırları yatay olarak kaydırırdı. */}
            <span className="suggest-mark" aria-hidden="true">
              <ChevronIcon open={false} size={9} />
            </span>
            {/* Yazdığınız kısım vurgusuz, önerinin devamı vurgulu: "bunu
                yazdınız, şu eklenecek" ayrımı görünsün. */}
            <span className="suggest-typed">{item.slice(0, suggest.input.length)}</span>
            <span className="suggest-rest">{item.slice(suggest.input.length)}</span>
          </button>
        ))}
      </div>

      <div className="suggest-foot">
        <span className="dim">{t("suggest.hint")}</span>
        <span className="spacer" />
        <span className="kbd">
          {suggest.index + 1}/{suggest.items.length}
        </span>
      </div>
    </div>
  );
}
