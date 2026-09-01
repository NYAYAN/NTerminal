import { useEffect, useState } from "react";

import { diffStat, parseDiff, type DiffLine } from "../lib/diff";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";
import {
  ChevronIcon,
  CopyIcon,
  OpenFileIcon,
  RevertIcon,
  GitAddedIcon,
  GitDeletedIcon,
  GitModifiedIcon,
  GitRenamedIcon,
  GitUntrackedIcon,
} from "./Icons";
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
 *
 * ## Neden yazı değil simge
 *
 * Etiket ("DEĞİŞTİ", "YENİDEN ADLANDIRILDI") sabit 88px'lik bir sütun
 * tutuyordu ve o sütun dosya YOLUNDAN çalınmıştı: panel dar olduğunda asıl
 * aranan bilgi kırpılıyor, her satırda tekrarlanan aynı beş kelimeden biri
 * yerinde duruyordu. Durum listede zaten renkle kodlanmış; simge o rengi
 * taşıyor, tam metin ipucunda ve ekran okuyucuda kalıyor — yani hiçbir bilgi
 * kaybolmuyor, yalnızca yerini bırakıyor.
 */
type StatusLook = {
  text: string;
  tone: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
};

function useLabel(status: string): StatusLook {
  const t = useT();
  const trimmed = status.trim();
  if (trimmed === "??")
    return { text: t("git.untracked"), tone: "untracked", Icon: GitUntrackedIcon };
  const kod = trimmed[0] ?? "";
  if (kod === "A") return { text: t("git.added"), tone: "new", Icon: GitAddedIcon };
  if (kod === "D") return { text: t("git.deleted"), tone: "del", Icon: GitDeletedIcon };
  if (kod === "R") return { text: t("git.renamed"), tone: "mod", Icon: GitRenamedIcon };
  return { text: t("git.modified"), tone: "mod", Icon: GitModifiedIcon };
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
  const { text, tone, Icon } = useLabel(change.status);
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
  const untracked = change.status.trim() === "??";
  // Yol depo köküne göre; açma ve silme için tam yol gerekiyor.
  const fullPath = `${cwd}/${change.path}`;

  /*
   * Geri alma YIKICI, o yüzden her zaman soruyor.
   *
   * İki ayrı soru: takip edilen dosya son commit'teki hâline döner (geri
   * getirilebilir), takipsiz dosya SİLİNİR ve git'te kaydı olmadığı için geri
   * getirilemez. Aynı metni iki duruma da göstermek ikincisini olduğundan
   * masum gösterirdi.
   */
  const revert = async () => {
    const store = useStore.getState();
    const ok = await store.askConfirm({
      title: t(untracked ? "confirm.revertUntrackedTitle" : "confirm.revertTitle"),
      message: t(untracked ? "confirm.revertUntrackedMessage" : "confirm.revertMessage", {
        path: change.path,
      }),
      detail: t(untracked ? "confirm.revertUntrackedDetail" : "confirm.revertDetail"),
      confirmLabel: t(untracked ? "confirm.deleteFile" : "confirm.revertButton"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.gitRevert(cwd, change.path, untracked);
    } catch (err) {
      store.toast(String(err), "err");
      return;
    }
    // Liste komuttan bağımsız değişti; rozet ve satırlar tazelensin.
    await store.refreshGit(cwd);
  };

  return (
    <div className={open ? "git-item open" : "git-item"}>
      <button type="button" className="git-row" title={change.path} onClick={onToggle}>
        <span className="git-caret" aria-hidden="true">
          <ChevronIcon open={open} size={11} />
        </span>
        {/* İpucu satırın kendisininkinden (dosya yolu) ayrı: simgenin
            üstünde durumun adı, geri kalanında yol. */}
        <span className={`git-icon ${tone}`} title={text} role="img" aria-label={text}>
          <Icon size={13} />
        </span>
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

      {/* Satır eylemleri.
       *
       * Satırın KENDİSİ katlama düğmesi olduğu için bunlar onun dışında ve
       * ayrı düğmeler: iç içe düğme geçersiz işaretleme ve tıklamalar
       * karışıyor. Yalnızca satırın üstündeyken görünüyorlar — üçü birden her
       * satırda durunca liste bir araç çubuğu tarlasına dönüyor ve asıl
       * bilgi olan yol geri plana düşüyor. */}
      <div className="git-actions">
        <button
          type="button"
          className="icon-btn"
          title={t("git.copyPath")}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(change.path)
              .then(() => useStore.getState().toast(t("git.pathCopied"), "ok"))
              .catch(() => {});
          }}
        >
          <CopyIcon size={14} />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          title={t("git.revert")}
          onClick={() => void revert()}
        >
          <RevertIcon size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("git.openFile")}
          onClick={() => useStore.getState().openFile(fullPath)}
        >
          <OpenFileIcon size={14} />
        </button>
      </div>

      {open && (
        <div className="git-diff">
          {lines === null && <div className="pop-empty">{t("common.loading")}</div>}
          {lines !== null && lines.length === 0 && (
            <div className="pop-empty">{t("git.noDiff")}</div>
          )}
          {/* Satır numarası SOLDA, ayrı bir sütunda.
           *
           * Silinen satırda ESKİ, eklenen satırda YENİ numara yazıyor; bağlam
           * satırında ikisi de aynı şeyi gösterdiği için yeni yeterli. Tek
           * sütun bilinçli: iki sütun dar panelde metne kalan yeri yarıya
           * indiriyor ve fark okunamaz hâle geliyor.
           *
           * `user-select: none` (CSS): farkı kopyalayan kişi satır
           * numaralarını değil kodu istiyor. */}
          {lines?.map((line, i) => (
            <div key={i} className={`diff-line ${line.kind}`}>
              <span className="diff-no" aria-hidden="true">
                {line.newLine ?? line.oldLine ?? ""}
              </span>
              <span className="diff-text">{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
