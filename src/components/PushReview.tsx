import { useEffect, useRef, useState, type RefObject } from "react";

import { formatWhen } from "../lib/format";
import { tp, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import type { GitCommitSummary, GitInfo, GitOutgoing } from "../types";
import { ArrowIcon, ChevronIcon, UndoIcon } from "./Icons";
import { RevisionFiles } from "./RevisionFiles";

/**
 * Push'un onay paneli: neyin gideceği, göndermeden önce.
 *
 * BİLDİRİLEN: "push edeceğim içeriği de görmem gerekmez mi? hangi commitler var
 * diye." İlk çözüm Değişiklikler listesinin başında açılıp kapanan bir bölümdü.
 * İSTEK: "Gönderilecek commitler push butonu üzerinde yer alması daha iyi olmaz
 * mı?" — sorulunca IntelliJ'in Push penceresi gibi bir onay seçildi: Push'a
 * basmak paneli açıyor, gönderen paneldeki düğme. Liste kararın verildiği yerde
 * ve ne gittiğini görmeden göndermek mümkün değil; bedeli Push'un iki tık olması.
 * Commit'lenmemiş değişikliklerle çalışırken listenin başında yer kaplayan bölüm
 * de böylece kalktı.
 *
 * Panel DÜĞMENİN ALTINDA açılıyor, üstünde değil: commit kutusu panelin en
 * üstünde, yukarıda yer yok ve uzun bir liste pencereden taşardı. Esc ve
 * dışarıya basmak kapatıyor (stash ayar penceresiyle aynı düzenek); Push düğmesi
 * de aç/kapa — ona basmak "dışarı" sayılmıyor, yoksa kapatıp hemen yeniden
 * açardı. Açılınca odak paneldeki Push'ta: klavyeyle Enter göndermek demek.
 *
 * Liste Rust'ta Push'un yaptığı ayrımla okunuyor (bkz. `git.rs` `outgoing`):
 * neyin gideceğini göstermek, gidecek olanla aynı soruyu sormalı. Panel açıkken
 * `git` durumu tazelenirse liste de tazeleniyor.
 */
export function PushReview({
  cwd,
  git,
  publish,
  title,
  anchor,
  onCancel,
  onConfirm,
  onUndo,
}: {
  cwd: string;
  git: GitInfo;
  /** Dal uzakta yok: düğme "Yayınla". */
  publish: boolean;
  /** Başlık: kaç commit nereye, ya da yayınlanacağı. */
  title: string;
  /** Paneli açan düğme: ona basmak dışarı sayılmıyor. */
  anchor: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * En üstteki (son) commit'i geri al. İSTEK: "push basınca açılan ekranda
   * commit'i geri almak mümkün mü?" — IntelliJ'in "Undo Commit"i gibi yalnızca
   * son commit'te: içerik kaybolmuyor (`git::undo_last_commit`).
   */
  onUndo?: (commit: GitCommitSummary) => Promise<void>;
}) {
  const t = useT();
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>(".push-review-go")?.focus();
  }, []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      onCancel();
    };
    // Yakalama fazında: uygulamanın genel Esc'i başka bir örtüyü kapatmasın.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      anchor.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [anchor, onCancel]);

  return (
    <div ref={panel} className="push-review" role="dialog" aria-label={t("git.outgoing")}>
      <div className="push-review-head">{title}</div>
      <div className="push-review-list">
        <OutgoingList cwd={cwd} git={git} onUndo={onUndo} />
      </div>
      <div className="push-review-foot">
        <button type="button" className="outline" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="primary push-review-go" onClick={onConfirm}>
          <ArrowIcon dir="up" size={12} />
          <span>{t(publish ? "git.publish" : "git.push")}</span>
        </button>
      </div>
    </div>
  );
}

function OutgoingList({
  cwd,
  git,
  onUndo,
}: {
  cwd: string;
  git: GitInfo;
  onUndo?: (commit: GitCommitSummary) => Promise<void>;
}) {
  const t = useT();
  const [data, setData] = useState<GitOutgoing | null>(null);
  /**
   * Okuma hatası "gönderilecek commit yok" diye GÖSTERİLMİYOR (stash listesindeki
   * ders): uygulamanın Rust tarafı eski bir derlemeyse ("Command git_outgoing not
   * found") boş liste bunu gizler ve kullanıcı push edilecek bir şey olmadığını
   * sanardı.
   */
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .gitOutgoing(cwd)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFailed(null);
      })
      .catch((err) => {
        if (!cancelled) setFailed(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, git]);

  if (failed) {
    return (
      <div className="git-commit-error" role="alert">
        <strong>{t("git.outgoingFailed")}</strong>
        <pre>{failed}</pre>
      </div>
    );
  }
  if (!data) return <div className="pop-empty">{t("common.loading")}</div>;
  // Yeni dal ana dalla aynı yerdeyken "yayınla" yalnızca dalı oluşturuyor.
  if (data.commits.length === 0) return <div className="pop-empty">{t("git.outgoingNone")}</div>;

  const hidden = data.total - data.commits.length;
  return (
    <div className="outgoing-body">
      {/* Liste en yeniden eskiye: ilk satır HEAD, geri alınabilen yalnızca o. */}
      {data.commits.map((commit, i) => (
        <OutgoingRow key={commit.id} cwd={cwd} commit={commit} onUndo={i === 0 ? onUndo : undefined} />
      ))}
      {hidden > 0 && <div className="pop-empty">{tp("git.outgoingMore", hidden)}</div>}
    </div>
  );
}

/**
 * Tek commit: ileti, altında kısa karma, yazar ve zaman; tıklayınca dosyaları.
 *
 * Satır `Değişiklikler`in ve stash'in satırlarıyla AYNI sınıfları kullanıyor
 * (`git-item`, `git-head`, `git-row`): aynı düzen, aynı katlama oku.
 */
function OutgoingRow({
  cwd,
  commit,
  onUndo,
}: {
  cwd: string;
  commit: GitCommitSummary;
  onUndo?: (commit: GitCommitSummary) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const meta = [commit.author, formatWhen(commit.time * 1000)].filter(Boolean).join(" · ");

  return (
    <div className={open ? "git-item open" : "git-item"}>
      <div className="git-head">
        <button
          type="button"
          className="git-row"
          title={`${commit.short} ${commit.subject}\n${meta}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="git-caret" aria-hidden="true">
            <ChevronIcon open={open} size={11} />
          </span>
          {/* İki satır: ileti üstte bütün genişlikte, karma · yazar · zaman
              altta (gerekçesi `.outgoing-text`te). */}
          <span className="outgoing-text">
            <span className="outgoing-subject">{commit.subject}</span>
            <span className="outgoing-meta">
              <span className="outgoing-hash">{commit.short}</span>
              {` · ${meta}`}
            </span>
          </span>
        </button>
        {onUndo && (
          <div className="git-actions">
            <button
              type="button"
              className="icon-btn"
              disabled={undoing}
              title={t("git.undoCommit")}
              aria-label={t("git.undoCommit")}
              onClick={() => {
                setUndoing(true);
                void onUndo(commit).finally(() => setUndoing(false));
              }}
            >
              <UndoIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {open && (
        <RevisionFiles
          depKey={`${cwd}\0${commit.id}`}
          loadFiles={() => api.gitCommitFiles(cwd, commit.id)}
          loadDiff={(file) => api.gitCommitDiff(cwd, commit.id, file.path, file.origPath)}
          emptyText={t("git.commitNoFilesInside")}
        />
      )}
    </div>
  );
}
