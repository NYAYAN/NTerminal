import { useEffect, useState } from "react";

import { diffStat, parseDiff, type DiffLine } from "../lib/diff";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";
import { ChevronIcon } from "./Icons";
import type { GitChange } from "../types";

/**
 * Değişen dosyalar — sağ panelin "Değişiklikler" sekmesi.
 *
 * ## Neden var olan panelin içinde
 *
 * İlk hâli kendi çekmecesiydi ve geri alındı. Kullanıcının zaten bildiği
 * çekmece bu: geçmiş ve favoriler orada. İkinci bir çekmece ikinci bir kapatma
 * yolu, ikinci bir genişlik tutamacı ve ikinci bir "bu nasıl kapanıyor" sorusu
 * demekti.
 *
 * ## Fark YERİNDE açılıyor
 *
 * Dosyaya tıklamak satırı katlıyor ve altında farkı gösteriyor. Önceki hâli
 * `git diff` komutunu komut satırına yazıyordu — çalışması için bir tuş daha
 * gerekiyordu ve çıktı terminale gidip listeyi ekrandan atıyordu. Oysa aranan
 * şey "şu dosyada ne değişti" sorusunun listeyi KAYBETMEDEN yanıtlanması.
 *
 * Fark yalnızca açılan dosya için isteniyor: her dosya için önden `git diff`
 * çalıştırmak yüz dosyalık bir değişiklikte yüz süreç demekti.
 */
export function GitChanges() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const allGit = useStore((s) => s.gitInfo);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const cwd = tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;
  const git = cwd ? (allGit[cwd] ?? null) : null;
  const changes = git?.changes ?? [];

  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="panel-list git-list">
      {!git && <div className="pop-empty">{t("git.noRepo")}</div>}
      {git && changes.length === 0 && <div className="pop-empty">{t("git.clean")}</div>}

      {changes.map((change) => (
        <ChangeRow
          key={change.status + change.path}
          change={change}
          cwd={cwd!}
          open={open === change.path}
          onToggle={() => setOpen((p) => (p === change.path ? null : change.path))}
        />
      ))}
    </div>
  );
}

/**
 * Durum harflerinin okunabilir karşılığı.
 *
 * Porcelain iki karakter veriyor: ilki indeks, ikincisi çalışma ağacı. `??`
 * takip edilmeyen. Bileşik durumlarda (`AM`) İNDEKS harfi belirleyici, çünkü
 * commit'e girecek olan o.
 */
function useLabel(status: string): { text: string; tone: string } {
  const t = useT();
  const trimmed = status.trim();
  if (trimmed === "??") return { text: t("git.untracked"), tone: "new" };
  const kod = trimmed[0] ?? "";
  if (kod === "A") return { text: t("git.added"), tone: "new" };
  if (kod === "D") return { text: t("git.deleted"), tone: "del" };
  if (kod === "R") return { text: t("git.renamed"), tone: "mod" };
  return { text: t("git.modified"), tone: "mod" };
}

function ChangeRow({
  change,
  cwd,
  open,
  onToggle,
}: {
  change: GitChange;
  cwd: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const { text, tone } = useLabel(change.status);
  const [lines, setLines] = useState<DiffLine[] | null>(null);

  /*
   * Fark yalnızca satır AÇIKKEN isteniyor.
   *
   * Kapalıyken de istemek yüz dosyalık bir değişiklikte yüz `git` süreci
   * demekti. Bir kez alınan fark saklanıyor: aynı satırı kapatıp açmak yeni
   * bir çağrı üretmiyor.
   */
  useEffect(() => {
    if (!open || lines !== null) return;
    let cancelled = false;
    const untracked = change.status.trim() === "??";
    void api
      .gitDiff(cwd, change.path, untracked)
      .then((text) => !cancelled && setLines(parseDiff(text ?? "")))
      .catch(() => !cancelled && setLines([]));
    return () => {
      cancelled = true;
    };
  }, [open, lines, cwd, change.path, change.status]);

  const stat = lines ? diffStat(lines) : null;

  return (
    <div className={open ? "git-item open" : "git-item"}>
      <button type="button" className="git-row" title={change.path} onClick={onToggle}>
        <span className="git-caret" aria-hidden="true">
          <ChevronIcon open={open} size={11} />
        </span>
        <span className={`git-tag ${tone}`}>{text}</span>
        {/* Yol BAŞTAN kırpılıyor: uzun yollarda ayırt edici olan dosya adı,
            klasör zinciri değil. */}
        <span className="git-path">{change.path}</span>
        {stat && (
          <span className="git-stat">
            <span className="add">{`+${stat.added}`}</span>
            <span className="del">{`-${stat.removed}`}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="git-diff">
          {lines === null && <div className="pop-empty">{t("common.loading")}</div>}
          {lines !== null && lines.length === 0 && (
            <div className="pop-empty">{t("git.noDiff")}</div>
          )}
          {lines?.map((line, i) => (
            <div key={i} className={`diff-line ${line.kind}`}>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
