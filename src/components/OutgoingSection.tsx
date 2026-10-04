import { useEffect, useState } from "react";

import { formatWhen } from "../lib/format";
import { pushPlan } from "../lib/gitStage";
import { tp, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import type { GitCommitSummary, GitInfo, GitOutgoing } from "../types";
import { useActiveGit } from "./gitShared";
import { ArrowIcon, ChevronIcon } from "./Icons";
import { RevisionFiles } from "./RevisionFiles";

/**
 * "Gönderilecek commit'ler": Push'a basmadan önce neyin gideceği.
 *
 * BİLDİRİLEN: "push edeceğim içeriği de görmem gerekmez mi? hangi commitler var
 * diye." Commit kutusu yalnızca "N commit gönderilmedi" diyordu; hangileri
 * olduğunu görmek için terminale `git log` yazmak gerekiyordu.
 *
 * IntelliJ'in Push penceresindeki gibi: commit'lerin listesi (karma, ileti,
 * yazar, zaman), commit'e tıklayınca dosyaları, dosyaya tıklayınca farkı.
 * Ayrı bir pencere yok; stash bölümü gibi Değişiklikler listesinin başında
 * açılıp kapanan bir bölüm.
 *
 * YALNIZCA gönderilecek bir şey varken çiziliyor — Push düğmesinin açık olduğu
 * iki durum (`pushPlan`): yukarı akışın önünde commit var (`push`) ya da dal
 * uzakta yok (`publish`). Liste Rust'ta Push'un yaptığı ayrımla okunuyor (bkz.
 * `git.rs` `outgoing`): neyin gideceğini göstermek, gidecek olanla aynı soruyu
 * sormalı.
 *
 * Liste bölüm AÇIKKEN ve `git` durumu her tazelendiğinde yeniden okunuyor
 * (stash listesiyle aynı yol): commit atınca, push edince ya da terminalden
 * `git commit --amend` yapınca liste kendiliğinden güncelleniyor.
 */
export function OutgoingSection() {
  const t = useT();
  const { cwd, git } = useActiveGit();
  const open = useStore((s) => s.ui.outgoingOpen);
  const setUi = useStore((s) => s.setUi);

  if (!cwd || !git) return null;
  const plan = pushPlan(git);
  if (plan.kind !== "push" && plan.kind !== "publish") return null;

  const title =
    plan.kind === "push"
      ? tp("git.pushHint", plan.ahead, { upstream: plan.upstream })
      : t("git.publishHint");

  return (
    <div className="outgoing-section">
      {/* Başlık stash bölümününkiyle aynı yapıda (bkz. `StashSection`): satıra
          basmak da açıp kapatıyor, gerçek düğme `outgoing-toggle`. */}
      <div className="outgoing-section-head" title={title} onClick={() => setUi({ outgoingOpen: !open })}>
        <button type="button" className="outgoing-toggle" aria-expanded={open}>
          <span className="git-caret" aria-hidden="true">
            <ChevronIcon open={open} size={11} />
          </span>
          <ArrowIcon dir="up" size={12} />
          <span>{t("git.outgoing")}</span>
        </button>
        {plan.kind === "push" && <span className="pill-count">{plan.ahead}</span>}
      </div>
      {open && <OutgoingList cwd={cwd} git={git} />}
    </div>
  );
}

function OutgoingList({ cwd, git }: { cwd: string; git: GitInfo }) {
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
      {data.commits.map((commit) => (
        <OutgoingRow key={commit.id} cwd={cwd} commit={commit} />
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
function OutgoingRow({ cwd, commit }: { cwd: string; commit: GitCommitSummary }) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
