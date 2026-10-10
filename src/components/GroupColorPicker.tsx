import { useT } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { Group } from "../types";

/**
 * Seçicideki HAZIR renkler — dört tane.
 *
 * Sekiz hazır renk vardı ve dar kenar çubuğunda ikinci satıra sarıyordu; seçici
 * bir renk kutusu tarlasına dönüşüyordu. Dört, birbirinden açıkça ayrılan bir
 * yelpaze veriyor (mavi / yeşil / amber / mor) ve tek satırda duruyor. Bunların
 * dışındaki her renk özel renk seçicisinden geliyor, yani kısıtlama değil
 * sadeleştirme.
 *
 * `useStore` içindeki AYNI ADLI liste bununla ilgisiz: o yeni grupların
 * rengini sırayla atıyor ve daha geniş olması iyi — iki grup aynı renge daha
 * geç düşüyor.
 */
const GROUP_COLORS = ["#58a6ff", "#3fb950", "#d29922", "#bc8cff"];

/**
 * Grup rengi seçicisi.
 *
 * İki yerde açılıyor: kenar çubuğunda grup satırının altında, Kokpit'in grup
 * rayında karonun yanındaki kutuda. Seçici tek: iki kopya, birinde düzeltilen
 * davranışın ötekinde eski kalması demek.
 *
 * ## Seçmek KAPATMIYOR
 *
 * BİLDİRİLEN HATA: bir renge basınca seçici hemen kapanıyordu. Renk seçmek
 * tek hamlelik bir iş değil — kullanıcı birkaç rengi deneyip grubun listedeki
 * hâline bakarak karar veriyor. Kapanan seçici her deneme için menüyü yeniden
 * açmayı gerektiriyordu. Artık seçim ANINDA uygulanıyor (grup rengi canlı
 * değişiyor) ve seçici açık kalıyor; kapatma ayrı bir eylem (`onClose`).
 *
 * ## Kapatma düğmesi kutuların DIŞINDA
 *
 * Kutular dar kenar çubuğunda alt satıra sarıyor. "×" onlarla aynı sarma
 * akışındayken en alta düşüyor ve arandığı yerde bulunmuyordu. Şimdi seçici
 * iki parça: saran kutu ızgarası ve onun sağında, ilk satıra hizalı sabit bir
 * kapatma düğmesi.
 */
export function GroupColorPicker({ group, onClose }: { group: Group; onClose: () => void }) {
  const t = useT();
  const store = useStore.getState;
  return (
    <div className="color-picker">
      {/* Sıra: temizle → dört hazır renk → (boşluk) → özel renk.
       *
       * "Temizle" BAŞTA çünkü "rengi yok" bir renk seçeneği değil,
       * listenin sıfır noktası — soldan sağa okuyan göz önce onu
       * geçiyor. Özel renk ise SONDA ve araya nefes payı konuyor
       * (`.swatch.custom` kenar boşluğu): hazır renkler bir küme,
       * o ayrı bir kapı. */}
      <div className="color-swatches">
        {/* Rengi kaldırmak da bir seçim: burada da kapatmıyor,
            kullanıcı temizleyip başka bir renk deneyebilir. */}
        <button
          className={group.color === null ? "swatch clear on" : "swatch clear"}
          title={t("group.clearColor")}
          aria-pressed={group.color === null}
          onClick={() => store().updateGroup(group.id, { color: null })}
        />
        {GROUP_COLORS.map((option) => (
          <button
            key={option}
            className={group.color === option ? "swatch on" : "swatch"}
            style={{ background: option }}
            title={option}
            aria-pressed={group.color === option}
            onClick={() => store().updateGroup(group.id, { color: option })}
          />
        ))}
        <label className="swatch custom" title={t("group.customColor")}>
          <input
            type="color"
            value={group.color ?? "#58a6ff"}
            onChange={(e) => store().updateGroup(group.id, { color: e.target.value })}
          />
        </label>
      </div>
      <button className="icon-btn color-close" title={t("group.colorClose")} onClick={onClose}>
        ×
      </button>
    </div>
  );
}
