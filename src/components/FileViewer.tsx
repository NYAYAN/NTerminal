import { useEffect, useState } from "react";

import { baseName, formatBytes } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { ChevronIcon } from "./Icons";
import type { FileText } from "../types";

/**
 * Dosya görüntüleyici — "Dosyalar" sekmesinin ikinci hâli.
 *
 * ## Neden beşinci bir sekme değil
 *
 * Görüntüleyici tek başına bir yer değil, bir dosyayı SEÇTİKTEN sonraki hâl.
 * Beşinci bir sekme çoğu zaman boş dururdu ve "hangi dosya açık" sorusunun
 * yanıtı sekme adında olmazdı. Şimdi ağaç ile görüntüleyici aynı sekmenin iki
 * durumu: yol seçilince içerik, geri denince ağaç.
 *
 * ## Neden sözdizimi renklendirmesi yok
 *
 * Bir renklendirici (Prism, Shiki, highlight.js) onlarca dil grameri ve
 * yüzlerce kilobayt demek. Görüntüleyicinin işi "şu dosyada ne var" sorusunu
 * yanıtlamak; onu düzenlemek ya da incelemek bir düzenleyici işi ve NTerminal
 * düzenleyici değil. Satır numarası ve eş aralıklı yazı tipi bu soruyu
 * yanıtlamaya yetiyor.
 *
 * ## Sınırlar BİLDİRİLİYOR
 *
 * Yarım megabayttan sonrası kesiliyor ve kesildiği yazılıyor; ikili dosya da
 * öyle. Sessizce kesmek "dosyanın sonu buymuş" sanmaya yol açardı.
 */
export function FileViewer({ path }: { path: string }) {
  const t = useT();
  const [file, setFile] = useState<FileText | null | "err">(null);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    void api
      .readTextFile(path)
      .then((res) => !cancelled && setFile(res ?? "err"))
      .catch(() => !cancelled && setFile("err"));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const lines = file && file !== "err" && !file.binary ? file.text.split("\n") : [];

  return (
    <div className="viewer">
      <div className="viewer-head">
        <button
          type="button"
          className="viewer-back"
          title={t("viewer.back")}
          onClick={() => useStore.getState().setUi({ viewerPath: null })}
        >
          {/* Sola bakan ok: ağaca dönüş. `ChevronIcon` kapalı hâlde sağa
              bakıyor, bu yüzden çevriliyor. */}
          <span className="flip">
            <ChevronIcon open={false} size={11} />
          </span>
        </button>
        <span className="viewer-name" title={path}>
          {baseName(path) || path}
        </span>
        {file && file !== "err" && <span className="viewer-size">{formatBytes(file.size)}</span>}
      </div>

      <div className="viewer-body">
        {file === null && <div className="pop-empty">{t("common.loading")}</div>}
        {file === "err" && <div className="pop-empty">{t("viewer.failed")}</div>}
        {file && file !== "err" && file.binary && (
          <div className="pop-empty">{t("viewer.binary")}</div>
        )}

        {lines.length > 0 && (
          <div className="viewer-code">
            {lines.map((line, i) => (
              <div key={i} className="viewer-line">
                {/* Satır numarası seçime girmiyor: kodu kopyalayan biri
                    numaraları da kopyalamak istemiyor. */}
                <span className="viewer-no">{i + 1}</span>
                <span className="viewer-text">{line || " "}</span>
              </div>
            ))}
          </div>
        )}

        {file && file !== "err" && file.truncated && (
          <div className="viewer-cut">{t("viewer.truncated")}</div>
        )}
      </div>
    </div>
  );
}
