import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { folderLabel } from "../lib/dirs";
import { baseName, formatBytes } from "../lib/format";
import { useT } from "../lib/i18n";
import { imageErrorText, imageMime } from "../lib/images";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { ActualSizeIcon, CloseIcon, CodeIcon, FitIcon } from "./Icons";

/** Sahnenin her yandaki boşluğu (px) — `.image-stage` dolgusuyla aynı. */
const PAD = 16;

type Load =
  | { kind: "loading" }
  | { kind: "ready"; src: string; size: number }
  | { kind: "error"; message: string };

/**
 * Görsel önizlemesi — dosya panelinde, metin görüntüleyicisinin yerinde.
 *
 * İSTEK: "dosyalardan png tıkladığımda görsel olarak göremiyorum." Görüntüleyici
 * her dosyayı metin olarak okuyup PNG'ye "ikili dosya" diyordu.
 *
 * ## Neden `data:` adresi
 *
 * Bayt Rust'tan base64 geliyor (`read_image_file`) ve `<img>`e `data:` adresiyle
 * veriliyor. Uygulamanın güvenlik ilkesi (CSP, `tauri.conf.json`) görsellere
 * `'self'`, `asset:` ve `data:` dışında kaynak tanımıyor: `blob:` adresi
 * geliştirmede çalışıp ÜRETİM derlemesinde boş çıkardı. Varlık protokolünü
 * açmak (`asset:`) bütün diski adresle okunabilir yapmak demekti; burada ise
 * yalnızca uygulamanın kendi komutu, boyut sınırıyla okuyor.
 *
 * ## Sığdır / gerçek boyut
 *
 * Varsayılan SIĞDIR ama büyütmeden: küçük bir simge alanı doldurmak için
 * bulanıklaştırılmıyor, alandan büyük görsel küçültülüyor. Görsele ya da
 * başlıktaki düğmeye tıklamak gerçek boyuta (%100, kaydırılabilir) geçiyor;
 * ikinci tıklama geri. O anki ölçek başlıkta yazılı. Görsel zaten sığıyorsa
 * düğme yok — basınca hiçbir şey değişmeyecekti.
 *
 * Saydam alanlar dama zeminle gösteriliyor: düz zeminde saydamlık ile o rengi
 * ayırt etmek mümkün değil.
 */
export function ImageViewer({
  path,
  root = null,
  onSource,
}: {
  path: string;
  /** Ağacın kökü: başlıktaki klasör ona göre yazılıyor. */
  root?: string | null;
  /** SVG: kaynağı (metni) göster. */
  onSource?: () => void;
}) {
  const t = useT();
  const mime = imageMime(path) ?? "application/octet-stream";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState(true);
  /** Sığdırma ölçeği (≤ 1); ölçü yokken (gizli panel, test ortamı) null. */
  const [fitScale, setFitScale] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .readImageFile(path)
      .then((image) => {
        if (!cancelled) setLoad({ kind: "ready", src: `data:${mime};base64,${image.data}`, size: image.size });
      })
      .catch((err) => {
        if (!cancelled) setLoad({ kind: "error", message: imageErrorText(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [path, mime]);

  // Sığdırma ölçeği alanın ölçüsünden; panel boyutlanınca (sütun sürüklenince,
  // pencere küçülünce) yeniden.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !natural || natural.w === 0 || natural.h === 0) return;
    const measure = () => {
      const w = el.clientWidth - PAD * 2;
      const h = el.clientHeight - PAD * 2;
      setFitScale(w > 0 && h > 0 ? Math.min(1, w / natural.w, h / natural.h) : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [natural]);

  const folder = folderLabel(path, root);
  /** Gerçek boyuta geçmek bir şey değiştiriyor mu: görsel alandan büyük mü. */
  const scaled = fitScale !== null && fitScale < 1;
  const scale = fit ? fitScale : 1;
  const toggle = () => {
    if (scaled || !fit) setFit((f) => !f);
  };

  return (
    <div className="viewer image-viewer">
      <div className="viewer-head">
        <span className="viewer-name" title={path}>
          {baseName(path) || path}
        </span>
        {folder && (
          <span className="viewer-dir" title={path}>
            {folder}
          </span>
        )}
        <span className="viewer-spacer" />
        {natural && natural.w > 0 && (
          <span className="viewer-size" data-info="dims">{`${natural.w} × ${natural.h}`}</span>
        )}
        {natural && scale !== null && (
          <span className="viewer-size" data-info="zoom">
            {t("viewer.zoomPercent", { n: Math.round(scale * 100) })}
          </span>
        )}
        {load.kind === "ready" && <span className="viewer-size">{formatBytes(load.size)}</span>}
        {(scaled || !fit) && (
          <button
            type="button"
            data-tool="zoom"
            className="viewer-tool"
            title={t(fit ? "viewer.zoomActual" : "viewer.zoomFit")}
            aria-label={t(fit ? "viewer.zoomActual" : "viewer.zoomFit")}
            onClick={toggle}
          >
            {fit ? <ActualSizeIcon size={13} /> : <FitIcon size={13} />}
          </button>
        )}
        {onSource && (
          <button
            type="button"
            data-tool="source"
            className="viewer-tool"
            title={t("viewer.showSource")}
            aria-label={t("viewer.showSource")}
            onClick={onSource}
          >
            <CodeIcon size={13} />
          </button>
        )}
        <button
          type="button"
          className="viewer-tool viewer-close"
          title={t("viewer.close")}
          aria-label={t("viewer.close")}
          onClick={() => useStore.getState().setUi({ viewerPath: null, viewerReveal: null })}
        >
          <CloseIcon size={12} />
        </button>
      </div>

      <div className="image-body" ref={body}>
        {load.kind === "loading" && <div className="pop-empty">{t("common.loading")}</div>}
        {load.kind === "error" && (
          <div className="pop-empty" role="alert">
            {load.message}
          </div>
        )}
        {load.kind === "ready" && (
          <div className={fit ? "image-stage fit" : "image-stage actual"}>
            <img
              src={load.src}
              alt={baseName(path)}
              draggable={false}
              data-zoom={scaled || !fit ? (fit ? "in" : "out") : undefined}
              // Boyutu bildirmeyen SVG (yalnızca `viewBox`): sığdırmada alanın
              // genişliğini alsın, sıfır boyutlu görünmesin.
              data-nosize={natural && natural.w === 0 ? "" : undefined}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => setLoad({ kind: "error", message: t("viewer.imageFailed") })}
              onClick={toggle}
            />
          </div>
        )}
      </div>
    </div>
  );
}
