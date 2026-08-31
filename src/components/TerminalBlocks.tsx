import { useEffect, useState } from "react";

import { blockRect, blockTone, type BlockView } from "../lib/blocks";
import { formatDuration, shortenPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import { FolderIcon } from "./Icons";

/**
 * Komut bloklarının görsel katmanı.
 *
 * Terminalin ÜSTÜNE çiziliyor, terminalin İÇİNE değil. Sınırları xterm'in
 * işaretçilerinden okuyup piksele çeviriyoruz (bkz. `lib/blocks.ts`); ızgaranın
 * kendisine dokunmuyoruz. Bunun bedeli sınırlı bir görsel dil (şerit, zemin,
 * rozet), kazancı ise `vim`in, aramanın, seçimin ve bağlantıların olduğu gibi
 * çalışmaya devam etmesi.
 *
 * ## Neden `pointer-events: none`
 *
 * Katman metnin üstünde duruyor. Fare olaylarını yutarsa terminalde seçim
 * yapılamaz, bağlantılar tıklanamaz. Yalnızca üzerine gelince beliren araç
 * çubuğu olayları geri alıyor.
 */
export function TerminalBlocks({ tabId }: { tabId: string }) {
  const t = useT();
  const enabled = useStore((s) => s.settings.behavior.commandBlocks);
  const [, redraw] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  /*
   * Pencereler BURADA ÇİZİLMİYOR, depoya bir bayrak yazılıyor.
   *
   * ÖLÇÜLEN HATA: ilk hâlinde dal seçici ve değişiklikler penceresi bu
   * bileşenin içinde çiziliyordu. Katman `pointer-events: none` (metnin
   * üstünde duruyor, seçimi engellememeli) ve `overflow: hidden`; sonuç iki
   * belirti: pencere tıklama almıyor — yani KAPANMIYOR — ve kırpılıyor.
   *
   * Uygulamanın kökünde çizilmeleri gerekiyor; buradan yalnızca "aç" deniyor.
   */

  /*
   * Yeniden çizim tetikleyicisi.
   *
   * Oturum, blok listesi değişince VE görünüm kayınca haber veriyor; ikincisi
   * kare başına bir kez sınırlanmış (bkz. `scheduleBlockSync`). Depoya durum
   * yazmıyoruz: bu veri saniyede onlarca kez değişiyor ve depoya yazmak bütün
   * aboneleri boşuna uyandırırdı.
   */
  useEffect(() => {
    /*
     * Oturum HENÜZ VAR OLMAYABİLİR.
     *
     * React çocuk etkilerini ebeveyninkinden ÖNCE koşuyor; oturumu yaratan
     * etki ise ebeveynde (`TerminalHost`). İlk denemede `sessions.get` boş
     * dönüyor ve bir daha denenmezse katman o sekme için sonsuza kadar ölü
     * kalıyordu — sekme yeniden kurulana dek hiç blok çizilmiyor.
     *
     * Kareye kadar bekleyip yeniden bakmak yeterli: oturum ya bir sonraki
     * karede var, ya da sekme kapanmış ve temizlik iptal ediyor.
     */
    let frame = 0;
    const bagla = () => {
      const session = sessions.get(tabId);
      if (!session) {
        frame = window.requestAnimationFrame(bagla);
        return;
      }
      session.setBlockListener(() => redraw((n) => n + 1));
    };
    bagla();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      sessions.get(tabId)?.setBlockListener(null);
    };
  }, [tabId]);

  const session = sessions.get(tabId);
  const geometry = enabled ? session?.blockGeometry() : null;
  if (!session || !geometry) return null;

  const view = {
    top: geometry.viewportTop,
    rows: geometry.rows,
    cellHeight: geometry.cellHeight,
  };

  const blocks = session.snapshotBlocks();
  /*
   * Başlık YALNIZCA kabuk boş satır bıraktığını bildirdiyse çiziliyor.
   *
   * Bildirmeyen bir kabukta (bash, cmd, eski sürüm) bloğun ilk satırında
   * kabuğun kendi istemi duruyor; başlığı oraya çizmek onu örterdi. Yani ayar
   * açık olsa bile karar kabuğun bildirimine bağlı.
   */
  const headers = session.hasBlockHeaders();

  const copy = (text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div
      className="blocks-layer"
      // Yükseklik satırlardan hesaplanıyor, `bottom: 0`dan değil: `.xterm`
      // ögesinin alt dolgusu katmanı son satırın 10px altına taşırıyordu.
      style={{
        top: geometry.top,
        left: geometry.left,
        width: geometry.width,
        height: geometry.cellHeight * geometry.rows,
      }}
    >
      {blocks.map((block) => {
        const rect = blockRect(block, view);
        if (!rect) return null;
        const tone = blockTone(block);
        const on = hovered === block.id;

        return (
          <div
            key={block.id}
            className={`block block-${tone}${on ? " on" : ""}`}
            style={{ top: rect.top, height: rect.height }}
            onMouseEnter={() => setHovered(block.id)}
            onMouseLeave={() => setHovered((id) => (id === block.id ? null : id))}
          >
            {/* Şerit bloğun BÜTÜN yüksekliğince: çıktının nerede bittiği
                ancak sürekli bir çizgiyle okunuyor. */}
            <span className="block-stripe" />

            {/* Başlık bloğun İLK satırında — kabuğun istem yazmadığı, boş
                bıraktığı satır. Blok görünümün üstünden taşmışsa (uzun çıktı)
                başlık da yukarıda kalır ve görünmez; doğrusu bu, başlık komuta
                ait ve komut yukarıda. */}
            {/* Başlık bloğun İLK satırında — kabuğun istem yazmadığı, boş
                bıraktığı satır. Tarihsel bir kayıt: "bu komut şu dizinde
                çalıştı". Tıklanmıyor; dizin değiştirmek şimdiki hâlle ilgili
                ve o iş bağlam şeridinde. */}
            {headers && block.startLine >= view.top && block.cwd && (
              <span className="block-head" style={{ height: view.cellHeight }}>
                <span className="block-cwd" title={block.cwd}>
                  <FolderIcon size={10} />
                  {shortenPath(block.cwd, 3)}
                </span>
              </span>
            )}

            {/* Durum rozeti bloğun ilk satırında; blok görünümün üstünden
                taşmışsa (uzun çıktı) rozet de yukarıda kalır ve görünmez —
                istenen bu, rozet komuta ait ve komut yukarıda. */}
            {!block.running && (
              <span className="block-badge" style={{ height: view.cellHeight }}>
                {block.durationMs !== null && (
                  <span className="block-dur">{formatDuration(block.durationMs)}</span>
                )}
                {block.exitCode !== null && block.exitCode !== 0 && (
                  <span className="block-code">{block.exitCode}</span>
                )}
              </span>
            )}

            <span className="block-tools">
              <button
                type="button"
                onClick={() => copy(block.command ?? "")}
                title={t("block.copyCommand")}
              >
                {t("block.copyCommandShort")}
              </button>
              <button
                type="button"
                onClick={() => copy(session.readBlockText(block.startLine, block.endLine))}
                title={t("block.copyOutput")}
              >
                {t("block.copyOutputShort")}
              </button>
              <button
                type="button"
                onClick={() => useStore.getState().insertCommand(block.command ?? "", false)}
                title={t("block.rerun")}
              >
                {t("block.rerunShort")}
              </button>
            </span>
          </div>
        );
      })}

    </div>
  );
}

export type { BlockView };
