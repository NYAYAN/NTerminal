import { useEffect, useRef, useState } from "react";

import { commitBlock, pushPlan, stagePaths, stageSummary, unstagePaths } from "../lib/gitStage";
import { tp, useT } from "../lib/i18n";
import { modKey } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { GitChange, GitInfo } from "../types";
import { ArrowIcon, StashIcon } from "./Icons";

/**
 * Değişiklikler panelinin başındaki commit kutusu: ileti, commit, push.
 *
 * ## Neden panelin içinde, terminalde değil
 *
 * Dal seçicide geçiş kabuğa YAZILIYOR (bkz. `BranchPicker`): tek satırlık, geri
 * dönüşü bir adım ve çıktısı komut geçmişinde kalması değerli bir komut. Commit
 * öyle değil — bir iletisi var, hangi dosyaların girdiği listede görünür
 * olmalı ve sonucu ("reddedildi", "kanca başarısız") ekranda kalmalı. Komutu
 * kabuğa göndermek kabuğun boşta olmasını şart koşardı ve başarıyı anlamanın
 * tek yolu çıktıyı okumak olurdu.
 *
 * Bu yüzden git doğrudan çağrılıyor (Rust `git_commit` / `git_push`) ve hata
 * metni git'in kendi cümlesi olarak kutunun İÇİNDE, kalıcı gösteriliyor. Bildirim
 * (`toast`) burada yetmezdi: üç saniyede kayboluyor ve bir kanca çıktısı üç
 * saniyede okunmaz.
 *
 * ## Kutu neyi gösteriyor
 *
 * - Değişiklik VARSA: ileti alanı, toplu seçim kutusu, Commit ve Push.
 * - Değişiklik YOKSA ama gönderilecek bir şey varsa: yalnızca "N commit
 *   gönderilmedi" satırı ve Push. Bir şey commit'lendikten sonra listenin
 *   boşalması ile itilecek commit'in görünmemesi çakışmamalı — kullanıcı tam da
 *   "commit'leri push edeyim" diye buraya bakıyor.
 * - İkisi de yoksa hiçbir şey: boş bir kutu gürültü.
 */
export function GitCommitBox({
  cwd,
  git,
  changes,
}: {
  cwd: string;
  git: GitInfo;
  changes: readonly GitChange[];
}) {
  const t = useT();
  /**
   * Taslağın anahtarı deponun KÖKÜ: aynı depoya bakan iki sekme aynı iletiyi
   * görmeli, başka bir depoya geçen kendi taslağını (bkz. `ui.gitDrafts`).
   */
  const key = git.root || cwd;
  const message = useStore((s) => s.ui.gitDrafts[key] ?? "");
  const [busy, setBusy] = useState<"commit" | "push" | null>(null);
  const [error, setError] = useState<{ title: string; text: string } | null>(null);
  const master = useRef<HTMLInputElement | null>(null);

  const summary = stageSummary(changes);
  const plan = pushPlan(git);
  const hasChanges = changes.length > 0;

  // "Kısmen" durumu yalnızca DOM özelliği olarak var, öznitelik değil.
  useEffect(() => {
    if (master.current) master.current.indeterminate = summary.state === "partial";
  });

  // Başka bir depoya geçildi: öncekinin hatası burada anlamsız.
  useEffect(() => {
    setError(null);
  }, [key]);

  if (!hasChanges && plan.kind !== "push" && plan.kind !== "publish") return null;

  const setMessage = (value: string) => {
    const store = useStore.getState();
    store.setUi({ gitDrafts: { ...store.ui.gitDrafts, [key]: value } });
  };

  /**
   * Commit atılınca taslak SİLİNİYOR, boş dizeye çekilmiyor: boş bırakmak
   * haritayı her depo için sonsuza kadar büyütürdü.
   */
  const clearDraft = () => {
    const store = useStore.getState();
    const { [key]: _gone, ...rest } = store.ui.gitDrafts;
    store.setUi({ gitDrafts: rest });
  };

  const block = commitBlock(git.staged, message);

  const commit = async () => {
    if (busy || block) return;
    const store = useStore.getState();
    setError(null);
    setBusy("commit");
    try {
      const hash = await store.commitStaged(cwd, message);
      // İleti yalnızca BAŞARIDA siliniyor: kanca reddettiyse kullanıcı yazdığı
      // iletiyi yeniden yazmak zorunda kalmamalı.
      clearDraft();
      store.toast(t("git.committed", { hash }), "ok");
    } catch (err) {
      setError({ title: t("git.commitFailed"), text: String(err) });
    } finally {
      setBusy(null);
    }
  };

  const push = async () => {
    if (busy || plan.kind === "none" || plan.kind === "detached") return;
    const store = useStore.getState();
    setError(null);
    setBusy("push");
    try {
      const target = await store.pushBranch(cwd);
      store.toast(t("git.pushed", { target }), "ok");
    } catch (err) {
      setError({ title: t("git.pushFailed"), text: String(err) });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Toplu kutu: hepsi seçiliyse hepsini bırakıyor, yoksa (kısmen dâhil)
   * hepsini seçiyor. "Kısmen"de seçmek doğru yön: kutuya basan kişi "hepsini
   * commit'e al" diyor, geri almak için ikinci basış var.
   */
  const toggleAll = async () => {
    const store = useStore.getState();
    try {
      if (summary.state === "staged") await store.unstageFiles(cwd, unstagePaths(changes));
      else await store.stageFiles(cwd, stagePaths(changes));
    } catch (err) {
      setError({ title: t("git.stageFailed"), text: String(err) });
    }
  };

  const commitTitle =
    block === "noFiles"
      ? t("git.commitNoFiles")
      : block === "noMessage"
        ? t("git.commitNoMessage")
        : t("git.commitHint", { keys: `${modKey()}+Enter` });

  const pushTitle =
    plan.kind === "push"
      ? tp("git.pushHint", plan.ahead, { upstream: plan.upstream })
      : plan.kind === "publish"
        ? t("git.publishHint")
        : plan.kind === "detached"
          ? t("git.pushDetached")
          : t("git.pushNothing");

  const pushButton = (
    <button
      type="button"
      className="outline git-push"
      disabled={busy !== null || plan.kind === "none" || plan.kind === "detached"}
      title={pushTitle}
      onClick={() => void push()}
    >
      <ArrowIcon dir="up" size={12} />
      <span>
        {busy === "push" ? t("git.pushing") : t(plan.kind === "publish" ? "git.publish" : "git.push")}
      </span>
      {plan.kind === "push" && <span className="pill-count">{plan.ahead}</span>}
    </button>
  );

  const errorBox = error && (
    <div className="git-commit-error" role="alert">
      <div className="git-commit-error-head">
        <strong>{error.title}</strong>
        <button
          type="button"
          className="icon-btn"
          title={t("common.close")}
          onClick={() => setError(null)}
        >
          ×
        </button>
      </div>
      {/* Git'in kendi metni, olduğu gibi: satır sonları anlam taşıyor (kanca
          çıktısı, "hint:" satırları) ve kopyalanabilmeli. */}
      <pre>{error.text}</pre>
    </div>
  );

  const behindHint = plan.kind === "push" && plan.behind > 0 && (
    <div className="git-commit-hint">{tp("git.behindHint", plan.behind)}</div>
  );

  if (!hasChanges) {
    return (
      <div className="git-commit compact">
        <div className="git-commit-row">
          <span className="git-commit-status">
            {plan.kind === "push" ? tp("git.unpushed", plan.ahead) : t("git.notPublished")}
          </span>
          <div className="git-commit-buttons">{pushButton}</div>
        </div>
        {behindHint}
        {errorBox}
      </div>
    );
  }

  return (
    <div className="git-commit">
      <textarea
        className="git-commit-msg"
        value={message}
        rows={3}
        placeholder={t("git.commitMessage")}
        aria-label={t("git.commitMessage")}
        // Commit sürerken kilitli: bitince taslak silinecek ve bu arada yazılan
        // metin de onunla birlikte giderdi.
        readOnly={busy === "commit"}
        spellCheck={false}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void commit();
          }
        }}
      />
      <div className="git-commit-row">
        <label
          className="git-commit-all"
          title={t(summary.state === "staged" ? "git.deselectAll" : "git.selectAll")}
        >
          <input
            ref={master}
            type="checkbox"
            checked={summary.state === "staged"}
            onChange={() => void toggleAll()}
          />
          <span>{tp("git.selectedCount", git.staged)}</span>
        </label>
        <div className="git-commit-buttons">
          {/* Stash: değişiklikleri commit'lemeden kenara alır. Kendi penceresi
              var (hangi dosyalar, hangi ad; bkz. `StashDialog`) ve satırlardaki
              kutulardan BAĞIMSIZ: onlar "commit'e ekle" diyor, stash başka bir
              soru. Dolgulu düğme yine yalnızca Commit: bir kutuda tek dolgulu. */}
          <button
            type="button"
            className="outline git-stash-btn"
            disabled={git.unborn}
            title={t(git.unborn ? "git.stashUnborn" : "git.stashHint")}
            onClick={() => useStore.getState().setUi({ stashDialog: { cwd } })}
          >
            <StashIcon size={12} />
            <span>{t("git.stash")}</span>
          </button>
          <button
            type="button"
            className="primary git-commit-btn"
            disabled={busy !== null || block !== null}
            title={commitTitle}
            onClick={() => void commit()}
          >
            <span>{busy === "commit" ? t("git.committing") : t("git.commit")}</span>
            {git.staged > 0 && busy === null && <span className="pill-count">{git.staged}</span>}
          </button>
          {pushButton}
        </div>
      </div>
      {behindHint}
      {errorBox}
    </div>
  );
}
