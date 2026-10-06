import { useT } from "../lib/i18n";
import { SYSTEM_PAIR, SYSTEM_THEME, THEMES, getTheme, type TerminalTheme } from "../lib/themes";

/**
 * Tema seçici: her tema kendi renkleriyle küçük bir kart.
 *
 * Önceki hâli adlardan oluşan bir açılır menüydü. Bir temayı adına bakarak
 * seçmek zor ("One Half Koyu" neye benziyor?), görünüşüne bakarak kolay —
 * yazı tipi menüsünün her seçeneği kendi yazı tipiyle çizildiği gibi.
 * Örnekte metin YOK, yalnızca renk: zemin, ön plan, vurgu ve altı palet rengi.
 * Örnek renkler `getTheme`den, yani terminalde gerçekten çizilen (okunabilirlik
 * düzeltmesinden geçmiş) hâliyle.
 *
 * "Sistemi izle" ilk kart: iki yarısı Açık ve Koyu.
 */
export function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const options = [SYSTEM_THEME, ...THEMES.map((theme) => theme.id)];
  return (
    <div className="theme-grid" role="radiogroup" aria-label={t("settings.colorTheme")}>
      {options.map((id) => {
        const on = value === id;
        const theme = THEMES.find((x) => x.id === id);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? "theme-card on" : "theme-card"}
            onClick={() => onChange(id)}
          >
            {id === SYSTEM_THEME ? (
              <span className="theme-swatch split" aria-hidden="true">
                <Sample theme={getTheme(SYSTEM_PAIR.dark)} />
                <Sample theme={getTheme(SYSTEM_PAIR.light)} />
              </span>
            ) : (
              <span className="theme-swatch" aria-hidden="true">
                <Sample theme={getTheme(id)} />
              </span>
            )}
            <span className="theme-name">{theme ? t(theme.nameKey) : t("theme.system")}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Bir temanın renk örneği: istem satırı gibi iki çubuk, altında palet. */
function Sample({ theme }: { theme: TerminalTheme }) {
  const x = theme.xterm;
  return (
    <span className="theme-sample" style={{ background: x.background }}>
      <span className="theme-line">
        <i style={{ background: theme.ui.accent, width: "28%" }} />
        <i style={{ background: x.foreground, width: "46%" }} />
      </span>
      <span className="theme-dots">
        {[x.red, x.green, x.yellow, x.blue, x.magenta, x.cyan].map((color, i) => (
          <i key={i} style={{ background: color }} />
        ))}
      </span>
    </span>
  );
}
