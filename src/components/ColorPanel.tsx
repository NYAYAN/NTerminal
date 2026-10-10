import { useLayoutEffect, useRef, useState } from "react";

import { type Hsv, hexToHsv, hsvToHex, normalizeHex } from "../lib/hsv";
import { useT } from "../lib/i18n";

/** Kayıtlı rengi olmayan alanda seçicinin başladığı renk. */
const FALLBACK = "#58a6ff";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Uygulamanın kendi renk seçicisi: doygunluk-parlaklık alanı, ton çubuğu ve
 * renk kodu kutusu. Seçim ANINDA bildiriliyor (`onChange`), seçici açık
 * kalıyor — hazır renklerdeki gibi (gerekçe `GroupColorPicker`).
 *
 * ## Neden yerel `<input type="color">` değil
 *
 * BİLDİRİLEN: "özel renk deyince özel renk kutusu ekranın en sol alt köşesinde
 * çıkıyor". macOS'ta WebKit yerel seçiciyi (renk kutulu açılır pencere, oradan
 * da sistemin Renkler paneli) GİRDİYE göre konumluyor ve sayfa bu yere
 * karışamıyor. Ekran dışı bir WKWebView'de ölçüldü:
 *
 * - Girdi görünmez ve 0×0'dı (tıklamayı yuvarlak kutu taşıyordu): açılır
 *   pencere pencere nerede olursa olsun ekranın başlangıç noktasına, sol alt
 *   köşeye (0,23) düştü.
 * - Girdiye boyut verilince yatayda doğru yere geldi ama dikeyde pencerenin
 *   TERSİNE yansıdı: üstten 100px'teki girdi için alttan ~100px'te, üstten
 *   700px'teki için üst tarafta açıldı.
 * - Sistemin Renkler paneli de ana ekranın sol alt köşesinde açılıyor.
 *
 * Sayfanın içindeki seçici hep tıklanan kutunun hemen altında, tasarımın
 * diliyle ve her platformda aynı.
 */
export function ColorPanel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const t = useT();
  const hex = normalizeHex(value) ?? FALLBACK;
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(hex)!);
  const [draft, setDraft] = useState(hex);
  const shown = hsvToHex(hsv);
  // Seçicinin en son gösterdiği ya da bildirdiği kod.
  const last = useRef(hex);

  /*
   * Değer DIŞARIDAN değişince (hazır bir renk, başka bir pencere) seçici ona
   * dönüyor; kendi bildirdiği değer geri geldiğinde dönmüyor — griye inen
   * rengin tonu koddan geri hesaplanamaz, kaybolurdu.
   *
   * Çizim sırasında değil, değer DEĞİŞİNCE: seçicinin kendi durumu, üstteki
   * bileşenin değeri almasından önce de çizilebiliyor. O ara çizimde "değer
   * gösterilenden farklı" demek seçiciyi eski renge döndürüyor ve ton koddan
   * yeniden hesaplanıp kayıyordu (ölçüldü: sürüklerken #0077ff yerine
   * #0076ff). Düzen etkisi: ekrana eski renk hiç çıkmıyor.
   */
  useLayoutEffect(() => {
    if (hex === last.current) return;
    last.current = hex;
    setHsv(hexToHsv(hex)!);
    setDraft(hex);
  }, [hex]);

  const emit = (next: Hsv) => {
    const out = hsvToHex(next);
    last.current = out;
    setHsv(next);
    setDraft(out);
    if (out !== hex) onChange(out);
  };

  const area = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const fromPointer = (clientX: number, clientY: number) => {
    const rect = area.current!.getBoundingClientRect();
    emit({
      ...hsv,
      s: clamp01((clientX - rect.left) / rect.width),
      v: clamp01(1 - (clientY - rect.top) / rect.height),
    });
  };

  const s = Math.round(hsv.s * 100);
  const v = Math.round(hsv.v * 100);
  const valid = normalizeHex(draft) !== null;

  return (
    <div className="color-panel">
      <div
        ref={area}
        className="color-area"
        // Zemin tonun en canlı hâli; beyaz ve siyah geçişler CSS'te üstünde.
        style={{ backgroundColor: `hsl(${Math.round(hsv.h)}, 100%, 50%)` }}
        role="slider"
        tabIndex={0}
        aria-label={t("color.area")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={s}
        aria-valuetext={t("color.areaValue", { s, v })}
        onPointerDown={(e) => {
          e.preventDefault();
          dragging.current = true;
          // Alanın dışına taşan sürükleme de buraya gelsin.
          e.currentTarget.setPointerCapture?.(e.pointerId);
          e.currentTarget.focus();
          fromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging.current) fromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={(e) => {
          // Ok tuşları yüzde bir, Shift ile yüzde on.
          const step = e.shiftKey ? 0.1 : 0.01;
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const d = delta[e.key];
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          emit({ ...hsv, s: clamp01(hsv.s + d[0]), v: clamp01(hsv.v + d[1]) });
        }}
      >
        <span
          className="color-knob"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: shown }}
        />
      </div>
      <input
        className="color-hue"
        type="range"
        min={0}
        max={359}
        step={1}
        value={Math.round(hsv.h) % 360}
        aria-label={t("color.hue")}
        onChange={(e) => emit({ ...hsv, h: Number(e.target.value) })}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="color-code">
        <span className="color-preview" style={{ background: shown }} />
        <input
          className="color-hex"
          value={draft}
          spellCheck={false}
          maxLength={7}
          aria-label={t("color.hex")}
          aria-invalid={!valid}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            // Geçerli olur olmaz uygulanıyor; yazarken ara hâller dokunmuyor.
            const next = normalizeHex(text);
            if (!next) return;
            last.current = next;
            setHsv(hexToHsv(next)!);
            if (next !== hex) onChange(next);
          }}
          // Yarım kalan kod kutuda kalmasın: odak çıkınca geçerli renge dönüyor.
          onBlur={() => setDraft(shown)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") setDraft(shown);
          }}
        />
      </div>
    </div>
  );
}

/**
 * Formdaki renk alanı: rengi gösteren düğme, basınca seçici hemen altında.
 * Ayarlar'da yerel `<input type="color">`un yerinde (gerekçe `ColorPanel`).
 */
export function ColorButton({
  value,
  label,
  onChange,
}: {
  value: string | null;
  label: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = value ?? FALLBACK;
  return (
    <div className="color-field">
      <button
        type="button"
        className="color-well"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span style={{ background: color }} />
      </button>
      {open && <ColorPanel value={color} onChange={onChange} />}
    </div>
  );
}
