import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

import { useT } from "../lib/i18n";
import { isMac } from "../lib/platform";

/**
 * Pencere düğmeleri: küçült, büyüt/geri al, kapat.
 *
 * Uygulama artık yerel başlık çubuğu kullanmıyor (`decorations: false`);
 * sekme çubuğu başlık çubuğunun yerini aldı. Yerel çubuğun tek yaptığı iş
 * başlığı yazmak ve bu üç düğmeyi göstermekti — ikisi de burada.
 *
 * **macOS'ta hiç çizilmiyor.** Orada yerel trafik ışıkları duruyor
 * (`titleBarStyle: "Overlay"`, bkz. tauri.macos.conf.json): pencere
 * süslemeleri açık kalıyor, yalnızca çubuk saydamlaşıyor ve içerik altından
 * akıyor. Sağ üste Windows tarzı üç düğme çizmek mac kullanıcısına doğrudan
 * yanlış görünürdü.
 *
 * Sürükleme ve çift tıkla büyütme bu bileşende DEĞİL: onları Tauri'nin kendi
 * betiği `data-tauri-drag-region` üzerinden hallediyor (bkz. TabBar).
 */

/**
 * Pencere tanıtıcısı, Tauri yoksa null.
 *
 * Çizim sırasında ÇAĞRILMIYOR. `getCurrentWindow()` Tauri iç değişkenleri
 * olmayan bir ortamda (jsdom testleri, tarayıcıdaki ölçüm sondası) fırlatıyor;
 * çizim yolunda durursa sekme çubuğunu çizen her test düşüyor. Zaten her
 * çizimde pencereyi yeniden çözmenin bir anlamı da yok.
 */
function windowHandle(): ReturnType<typeof getCurrentWindow> | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function WindowControls() {
  const t = useT();
  const [maximized, setMaximized] = useState(false);

  // Büyütme durumu düğme simgesini belirliyor. Pencere bizim düğmemiz dışında
  // da büyüyebiliyor (çift tık, Win+Yukarı, kenara yaslama), o yüzden olayı
  // dinlemek şart — yalnızca tıklamada güncellemek simgeyi yanlış bırakırdı.
  useEffect(() => {
    if (isMac()) return;
    const win = windowHandle();
    if (!win) return;
    let alive = true;
    const oku = () => void win.isMaximized().then((v) => alive && setMaximized(v)).catch(() => {});
    oku();
    const stop = win.onResized(oku);
    return () => {
      alive = false;
      void stop.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // macOS'ta trafik ışıkları yerel; burada çizecek bir şey yok.
  if (isMac()) return null;

  return (
    <div className="win-controls">
      <button
        className="win-btn"
        title={t("window.minimize")}
        aria-label={t("window.minimize")}
        onClick={() => void windowHandle()?.minimize().catch(() => {})}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className="win-btn"
        title={maximized ? t("window.restore") : t("window.maximize")}
        aria-label={maximized ? t("window.restore") : t("window.maximize")}
        onClick={() => void windowHandle()?.toggleMaximize().catch(() => {})}
      >
        {maximized ? (
          // Geri al: öndeki kare ve arkasındaki çerçevenin görünen kısmı.
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M2.5 2.5V1h6.5v6.5H7.5M1 2.5h6.5V9H1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        )}
      </button>
      <button
        className="win-btn close"
        title={t("window.close")}
        aria-label={t("window.close")}
        // `close()` pencereye kapanma İSTEĞİ gönderiyor; App.tsx onu yakalayıp
        // oturumu kaydediyor ve kabukları düzgün kapatıyor. `destroy()` bunu
        // atlar ve kaydedilmemiş düzen kaybolurdu.
        onClick={() => void windowHandle()?.close().catch(() => {})}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
