import { useT } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { GitChange } from "../types";

/**
 * Değişen dosyalar penceresi — Warp'taki "View Changes"in karşılığı.
 *
 * ## Neden fark görüntüleyici değil
 *
 * Warp değişikliği kendi içinde satır satır gösteriyor. Bunu yapmak bir fark
 * (diff) görüntüleyicisi yazmak demek: sözdizimi renklendirmesi, sarma, yan
 * yana/üst üste kipleri. Terminalde zaten `git diff` var ve o işi ondan iyi
 * yapıyor.
 *
 * Burada eksik olan şey görüntüleyici değil, ERİŞİM: hangi dosyaların
 * değiştiğini görmek için `git status` yazmak gerekiyordu. Liste onu veriyor;
 * bir dosyaya tıklamak da `git diff` komutunu satıra koyuyor. Tıklamak
 * çalıştırmıyor — hangi komutun çalışacağını görmek, körlemesine çalışan bir
 * düğmeden iyi.
 */
export function GitChanges({ changes, onClose }: { changes: GitChange[]; onClose: () => void }) {
  const t = useT();

  /**
   * Durum harflerinin okunabilir karşılığı.
   *
   * Porcelain iki karakter veriyor: ilki indeks, ikincisi çalışma ağacı.
   * `??` takip edilmeyen. Kullanıcıya harf yerine renk ve sözcük gösteriyoruz;
   * `AM` gibi bileşik durumlarda İNDEKS harfi belirleyici, çünkü commit'e
   * girecek olan o.
   */
  const label = (status: string): { text: string; tone: string } => {
    const trimmed = status.trim();
    if (trimmed === "??") return { text: t("git.untracked"), tone: "new" };
    const kod = trimmed[0] ?? "";
    if (kod === "A") return { text: t("git.added"), tone: "new" };
    if (kod === "D") return { text: t("git.deleted"), tone: "del" };
    if (kod === "R") return { text: t("git.renamed"), tone: "mod" };
    return { text: t("git.modified"), tone: "mod" };
  };

  return (
    <div className="overlay dir-overlay" onMouseDown={onClose}>
      <div className="git-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="git-head">
          <span className="git-title">{t("git.changesTitle")}</span>
          <span className="spacer" />
          <span className="kbd">{changes.length}</span>
        </div>

        <div className="git-list">
          {changes.length === 0 && <div className="dir-empty">{t("git.clean")}</div>}
          {changes.map((change) => {
            const { text, tone } = label(change.status);
            return (
              <button
                key={change.status + change.path}
                type="button"
                className="git-row"
                title={change.path}
                onClick={() => {
                  useStore.getState().insertCommand(`git diff -- "${change.path}"`, false);
                  onClose();
                }}
              >
                <span className={`git-tag ${tone}`}>{text}</span>
                {/* Yol SONDAN kısalıyor: uzun yollarda ayırt edici olan dosya
                    adı, klasör zinciri değil. */}
                <span className="git-path">{change.path}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
