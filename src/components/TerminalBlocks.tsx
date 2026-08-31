import { useEffect, useState } from "react";

import { blockRect, blockTone, type BlockView } from "../lib/blocks";
import { formatDuration, shortenPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import { GitChanges } from "./GitChanges";
import { BranchIcon, FolderIcon } from "./Icons";

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
  const [changesOpen, setChangesOpen] = useState(false);
  const allGit = useStore((s) => s.gitInfo);

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
  // Git durumu DİZİNE bağlı, sekmeye değil: aynı depoda iki sekme aynı rozeti
  // görüyor ve `git` bir kez çalışıyor.
  const git = session.cwd ? (allGit[session.cwd] ?? null) : null;
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
        /*
         * Komutu olmayan blok = kabuğun ŞU AN beklediği istem.
         *
         * Ondan yalnızca başlık çiziliyor: şerit "bu komut şöyle bitti" diyor
         * ama daha çalışmış bir komut yok; araç çubuğu da kopyalanacak bir şey
         * bulamaz. Başlık ise anlamlı — bir sonraki komutun hangi dizinde
         * çalışacağını söylüyor ve kutunun hemen üstünde duruyor.
         */
        const bekleyen = !block.command;
        const on = !bekleyen && hovered === block.id;

        return (
          <div
            key={block.id}
            className={`block block-${tone}${on ? " on" : ""}${bekleyen ? " pending" : ""}`}
            style={{ top: rect.top, height: rect.height }}
            onMouseEnter={() => !bekleyen && setHovered(block.id)}
            onMouseLeave={() => setHovered((id) => (id === block.id ? null : id))}
          >
            {/* Şerit bloğun BÜTÜN yüksekliğince: çıktının nerede bittiği
                ancak sürekli bir çizgiyle okunuyor. */}
            {!bekleyen && <span className="block-stripe" />}

            {/* Başlık bloğun İLK satırında — kabuğun istem yazmadığı, boş
                bıraktığı satır. Blok görünümün üstünden taşmışsa (uzun çıktı)
                başlık da yukarıda kalır ve görünmez; doğrusu bu, başlık komuta
                ait ve komut yukarıda. */}
            {headers && block.startLine >= view.top && (
              /*
               * Yükseklik bekleyen blokta BÜTÜN bloğu, bitmişte tek satırı
               * kaplıyor.
               *
               * ÖLÇÜLEN BELİRTİ: bekleyen bloğun rozeti üstteki ayırıcı çizgiye
               * yapışık duruyor, altında ise koca bir boşluk kalıyordu. Sebep:
               * başlık satırı bir terminal satırı kadar (~17px) ve rozet
               * neredeyse onu dolduruyor, üstte bir piksel kalıyor. Altındaki
               * boşluk ise kabuğun kullanmadığı komut satırı.
               *
               * Bekleyen bloğun İKİ satırı da boş, dolayısıyla rozeti ikisinin
               * ortasına almak hem güvenli hem simetrik. Bitmiş blokta bu
               * yapılamaz: oradaki alt satırlar çıktı ve rozet onların üstüne
               * biner.
               */
              <span
                className="block-head"
                style={{ height: bekleyen ? rect.height : view.cellHeight }}
              >
                {block.cwd &&
                  (bekleyen ? (
                    /* BEKLEYEN bloğun rozeti tıklanabilir: bir sonraki komut
                       orada çalışacak, yani değiştirmek anlamlı. Bitmiş bir
                       bloğunki değil — o komut çoktan çalıştı, dizinini
                       değiştirmek geçmişi değiştirmez. */
                    <button
                      type="button"
                      className="block-cwd as-button"
                      title={t("dirs.open")}
                      onClick={() => useStore.getState().setUi({ dirPicker: block.cwd })}
                    >
                      <FolderIcon size={10} />
                      {shortenPath(block.cwd, 3)}
                    </button>
                  ) : (
                    <span className="block-cwd" title={block.cwd}>
                      <FolderIcon size={10} />
                      {shortenPath(block.cwd, 3)}
                    </span>
                  ))}

                {/* Git rozeti YALNIZCA bekleyen blokta.
                    
                    Bitmiş bir bloğunki yanıltıcı olurdu: durum ŞU ANKİ dal ve
                    sayaç, o komut çalıştığı andaki değil. Geçmişteki bir
                    satırın yanında güncel bir sayaç göstermek "o komut bu
                    durumda çalıştı" demek olurdu. */}
                {bekleyen && git && (
                  <>
                    <span className="git-chip" title={t("git.branch")}>
                      <BranchIcon size={10} />
                      {git.branch}
                      {git.ahead > 0 && <span className="git-num">{`↑${git.ahead}`}</span>}
                      {git.behind > 0 && <span className="git-num">{`↓${git.behind}`}</span>}
                    </span>
                    {git.changes.length > 0 && (
                      <button
                        type="button"
                        className="git-chip as-button"
                        title={t("git.viewChanges")}
                        onClick={() => setChangesOpen(true)}
                      >
                        {`± ${git.changes.length}`}
                      </button>
                    )}
                  </>
                )}
              </span>
            )}

            {/* Durum rozeti bloğun ilk satırında; blok görünümün üstünden
                taşmışsa (uzun çıktı) rozet de yukarıda kalır ve görünmez —
                istenen bu, rozet komuta ait ve komut yukarıda. */}
            {!block.running && !bekleyen && (
              <span className="block-badge" style={{ height: view.cellHeight }}>
                {block.durationMs !== null && (
                  <span className="block-dur">{formatDuration(block.durationMs)}</span>
                )}
                {block.exitCode !== null && block.exitCode !== 0 && (
                  <span className="block-code">{block.exitCode}</span>
                )}
              </span>
            )}

            {!bekleyen && (
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
            )}
          </div>
        );
      })}

      {/* Pencere katmanın DIŞINDA çiziliyor: katman `overflow: hidden` ve
          `pointer-events: none`; içeride açılsa hem kırpılır hem tıklanamazdı. */}
      {changesOpen && git && (
        <GitChanges changes={git.changes} onClose={() => setChangesOpen(false)} />
      )}
    </div>
  );
}

export type { BlockView };
