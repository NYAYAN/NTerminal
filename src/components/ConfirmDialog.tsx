import { useEffect, useRef } from "react";

import { useT } from "../lib/i18n";
import { resolveConfirm, useStore } from "../store/useStore";

/**
 * Uygulama içi onay penceresi.
 *
 * Neden `window.confirm` değil: webview'ün yerleşik iletişim pencereleri
 * uygulamanın temasını ve dilini taşımıyor, ana iş parçacığını bloklayarak
 * terminal çıktısını dondurabiliyor ve gömülü webview'lerde davranışı
 * platforma göre değişiyor — sessizce hiç görünmemesi de mümkün. Onay
 * penceresinin görünmemesi, "onay istedim ama kapandı" demek; yanlışlıkla
 * kapatmaya karşı koyduğumuz korumanın tam olarak kaybı.
 *
 * Bu yüzden kendi penceremiz: temalı, çevrilmiş ve varlığı testlenebilir.
 */
export function ConfirmDialog() {
  const t = useT();
  const request = useStore((s) => s.ui.confirm);
  const okRef = useRef<HTMLButtonElement | null>(null);

  // Odak onay düğmesinde: Enter'a basmak en olası eylemi yapsın.
  useEffect(() => {
    okRef.current?.focus();
  }, [request?.id]);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      // Capture fazında: App'in genel kısayol dinleyicisine ulaşmadan önce
      // burada karara bağlıyoruz, yoksa Esc başka bir örtüyü kapatabilir.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        resolveConfirm(request.id, false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        resolveConfirm(request.id, true);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [request]);

  if (!request) return null;

  return (
    <div
      className="overlay"
      // Dışına tıklamak vazgeçmek anlamına geliyor; yanlışlıkla onaylamak
      // mümkün olmamalı.
      onMouseDown={() => resolveConfirm(request.id, false)}
    >
      <div className="modal confirm" onMouseDown={(e) => e.stopPropagation()} role="alertdialog">
        <div className="modal-head">
          <h2>{request.title}</h2>
        </div>

        <div className="modal-body">
          <p className="confirm-message">{request.message}</p>
          {request.detail && <p className="confirm-detail dim">{request.detail}</p>}
        </div>

        <div className="modal-foot">
          <span className="spacer" />
          <button className="outline" onClick={() => resolveConfirm(request.id, false)}>
            {request.cancelLabel ?? t("common.cancel")}
          </button>
          <button
            ref={okRef}
            className={request.danger ? "danger" : "primary"}
            onClick={() => resolveConfirm(request.id, true)}
          >
            {request.confirmLabel ?? t("confirm.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
