import { DESIGNS, type Design } from "../lib/design";
import { useT } from "../lib/i18n";

/**
 * Tasarım seçici: her tasarım bir kart, kart o tasarımın küçük bir şeması.
 *
 * Tema kartları gibi (bkz. `ThemePicker`): bir tasarımı adına bakarak seçmek
 * zor, görünüşüne bakarak kolay. Şema metin değil biçim gösteriyor — başlık
 * çubuğu, kenar çubuğu, sekme şeridi ve komut kutusu; Premium'da köşeler
 * yuvarlak, katmanlar gölgeli, Klasik'te düz ve bitişik; Kokpit'te solda grup
 * rayı, sağda sabit panel. Şemanın renkleri
 * geçerli temanın değişkenlerinden geliyor, yani tema değişince şema da
 * o temada çiziliyor.
 *
 * Kartın kendisi `data-design` özniteliği taşıyor: `premium.css` o
 * öznitelikle kartın şemasını kökteki tasarımdan BAĞIMSIZ biçimlendiriyor.
 * Böylece Klasik seçiliyken Premium kartı yine yuvarlak ve gölgeli görünüyor.
 */
export function DesignPicker({
  value,
  onChange,
}: {
  value: Design;
  onChange: (id: Design) => void;
}) {
  const t = useT();
  return (
    <div className="design-grid" role="radiogroup" aria-label={t("settings.designLabel")}>
      {DESIGNS.map((design) => {
        const on = value === design.id;
        return (
          <button
            key={design.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? "design-card on" : "design-card"}
            data-design={design.id}
            onClick={() => onChange(design.id)}
          >
            <span className="design-preview" aria-hidden="true">
              <i className="dp-title" />
              {/* Ray ve sabit panel yalnızca Kokpit şemasında görünüyor. */}
              <i className="dp-rail" />
              <i className="dp-side" />
              <i className="dp-tabs">
                <b className="on" />
                <b />
              </i>
              <i className="dp-term" />
              <i className="dp-input" />
              <i className="dp-panel" />
            </span>
            <span className="design-text">
              <span className="design-name">{t(design.nameKey)}</span>
              <span className="design-desc">{t(design.descKey)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
