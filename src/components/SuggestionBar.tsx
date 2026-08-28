import { useT } from "../lib/i18n";
import { ChevronIcon } from "./Icons";
import { useStore } from "../store/useStore";

/**
 * Komut önerisi listesi.
 *
 * Neden terminalin İÇİNDE değil, altında ayrı bir satırda: öneriyi ekran
 * tamponuna yazmak kabuğun kendi satır düzenleyicisiyle yarışmak demek —
 * kabuk satırı yeniden çizdiğinde yazdığımız hayalet metin ya siliniyor ya da
 * gerçek girdiye karışıyor. Terminalin üstüne bindirmek de olmaz: istem satırı
 * genellikle en altta ve tam olarak yazdığınız yeri kapatırdı.
 *
 * Liste ters sırada çiziliyor (en yeni komut en altta, istem satırına en
 * yakın): kabuk alışkanlığıyla "yukarı = daha eski" tutarlı kalsın.
 */
export function SuggestionBar() {
  const t = useT();
  const suggest = useStore((s) => s.ui.suggest);

  if (!suggest) return null;

  return (
    <div className="suggest-bar">
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
