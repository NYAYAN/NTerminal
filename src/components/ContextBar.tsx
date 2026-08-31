import { useEffect } from "react";

import { shortenPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import { BranchIcon, FolderIcon } from "./Icons";

/**
 * Komut satırının başlığı: dizin, dal ve değişiklik sayısı — HER ZAMAN görünür.
 *
 * ## Neden hepsi burada
 *
 * İlk hâlinde dizin rozeti bekleyen bloğun başlık satırındaydı, dal rozeti de
 * öyleydi. İki ölçülen sorun çıktı:
 *
 *  * Komut ÇALIŞIRKEN bekleyen blok yok, dolayısıyla rozetler de yok —
 *    kullanıcı tam da git ile uğraşırken bilgiyi yitiriyordu.
 *  * Rozetler terminalin içinde, satır yüksekliğine sıkışmış hâlde duruyordu;
 *    "dizin bilgisi kayboldu" tepkisi bundan.
 *
 * Üçü tek bir şeritte ve terminalin dışında. Warp'ta da öyle: girdi bloğunun
 * başlığı hiç kaybolmuyor ve dizin, dal, değişiklik yan yana duruyor.
 *
 * Bitmiş blokların başlığındaki dizin rozeti KALIYOR — o tarihsel bir kayıt,
 * "bu komut şu dizinde çalıştı" diyor. Buradaki ise şimdiki hâl.
 */
/**
 * Yoklama aralığı (ms).
 *
 * Beş saniye: dal değişimini "hemen" saymaya yetecek kadar sık, iki dosya
 * okumasının bedelini görünmez kılacak kadar seyrek. Bir saniye yapmak imza
 * denetimini yüz kat sıklaştırır ve karşılığında hissedilir bir şey vermez —
 * dal değişimi elle yapılan bir iş.
 */
const GIT_POLL_MS = 5000;

export function ContextBar() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const allGit = useStore((s) => s.gitInfo);
  const setUi = useStore((s) => s.setUi);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const cwd = tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;
  const git = cwd ? (allGit[cwd] ?? null) : null;

  /*
   * Dışarıdan yapılan değişiklikleri yakala.
   *
   * ÖLÇÜLEN SORUN: dal başka bir uygulamadan değiştirildiğinde rozet eski dalı
   * göstermeye devam ediyordu — tazeleme yalnızca dizin değişince ve komut
   * bitince koşuyordu.
   *
   * İki tetikleyici var ve ikisi ayrı durumu kapsıyor:
   *
   *  * Pencereye DÖNÜŞ: "başka bir IDE'de dal değiştirdim, buraya geldim" —
   *    en sık durum. Tam sorgu koşuyor, çünkü arada çalışma ağacı da
   *    değişmiş olabilir.
   *  * Yoklama: NTerminal ODAKTAYKEN olan değişiklikler. Ucuz imza
   *    denetimi; `git status` ancak imza değişince koşuyor.
   *
   * Yoklama yalnızca pencere odaktayken: arka planda duran bir terminalin
   * rozetini tazelemek kimsenin görmediği bir iş.
   */
  useEffect(() => {
    if (!cwd) return;
    const store = useStore.getState();

    const onFocus = () => void store.refreshGit(cwd);
    window.addEventListener("focus", onFocus);

    const timer = window.setInterval(() => {
      if (document.hasFocus()) void store.pollGit(cwd);
    }, GIT_POLL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [cwd]);

  // Dizin bilinmiyorsa (kabuk henüz bildirmedi, entegrasyon yok) şerit hiç
  // çizilmiyor ve `auto` ızgara satırı sıfıra iniyor.
  if (!cwd) return null;

  return (
    <div className="context-bar">
      {/* Dizin rozeti tıklanabilir: klasör seçici açılıyor.
          
          İpucu iki satır: tam yol (rozet kısaltıyor, uzun yollarda tek ayırt
          edici bilgi bu) ve tıklamanın ne yaptığı. */}
      <button
        type="button"
        className="ctx-chip dir"
        title={`${cwd}
${t("dirs.open")}`}
        onClick={() => setUi({ dirPicker: cwd })}
      >
        <FolderIcon size={11} />
        {shortenPath(cwd, 3)}
      </button>

      {git && (
        <>
          {/* Ayrık HEAD'de geçilecek dal listesi yok; rozet bilgi olarak
              kalıyor ama tıklanmıyor. */}
          <button
            type="button"
            className="ctx-chip branch"
            title={t("git.branch")}
            disabled={git.detached}
            onClick={() => setUi({ branchPicker: { cwd, current: git.branch } })}
          >
            <BranchIcon size={11} />
            {git.branch}
            {git.ahead > 0 && <span className="ctx-num">{`↑${git.ahead}`}</span>}
            {git.behind > 0 && <span className="ctx-num">{`↓${git.behind}`}</span>}
          </button>

          {git.changes.length > 0 && (
            <button
              type="button"
              className="ctx-chip changes"
              title={t("git.viewChanges")}
              onClick={() => setUi({ historyOpen: true, panelMode: "git" })}
            >
              {`± ${git.changes.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
