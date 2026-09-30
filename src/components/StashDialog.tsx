import { useEffect, useMemo, useRef, useState } from "react";

import { baseName, dirName } from "../lib/format";
import {
  initialSelection,
  needsUntracked,
  pruneSelection,
  selectionState,
  stashPaths,
  toggleAll,
  toggleOne,
} from "../lib/gitStash";
import { tp, useT } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { GitChange } from "../types";
import { useLabel } from "./gitShared";

/**
 * "Stash'e at" penceresi: hangi dosyalar, hangi adla.
 *
 * ## Seçim listeden geliyor, ama pencerenin KENDİ seçimi
 *
 * Satırdaki kutular "commit'e ekle" demek (`git add`); stash'in ayrı bir işareti
 * yok. Kutuları doğrudan stash seçimi saymak iki soruyu tek işarete yüklerdi: bir
 * dosyayı commit için işaretleyen kişi onu stash'e de atmak istemiyor olabilir.
 * İstek ise açıktı: "Değişiklikler listesinde neler seçiliyse Stash'a bastığımda
 * onlar seçili gelsin, kişi isterse değiştirsin." Bu yüzden pencere listedeki
 * işaretli dosyalarla AÇILIYOR (`initialSelection`) ve ondan sonra kendi seçimini
 * taşıyor: buradaki değişiklik listedeki kutulara dokunmuyor. Hiçbiri işaretli
 * değilse seçim boş açılıyor.
 *
 * ## Klasör yolları varsayılan olarak GİZLİ
 *
 * Listedeki ile aynı kural ve aynı ayar (`ui.gitShowPaths`): satırlarda yalnızca
 * dosya adı, tam yol ipucunda. Pencerede bir kutu var ("Klasör yollarını göster");
 * ayar ortak olduğu için listede açılmış yollar pencerede de açık geliyor.
 *
 * ## Takipsiz dosya sormuyor
 *
 * Seçimde takipsiz dosya varsa `--include-untracked` KENDİLİĞİNDEN ekleniyor
 * (`needsUntracked`): git onsuz tüm seçimi "pathspec did not match" ile düşürüyor
 * ve takipsiz bir dosyayı seçmek onu stash'e almak istemek demek. Ayrı bir kutu
 * yalnızca "neden hata verdi" sorusunu doğururdu.
 */
export function StashDialog({ cwd }: { cwd: string }) {
  const t = useT();
  const git = useStore((s) => s.gitInfo[cwd] ?? null);
  const changes = useMemo(() => git?.changes ?? [], [git]);

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => initialSelection(changes));
  const showPaths = useStore((s) => s.ui.gitShowPaths);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const master = useRef<HTMLInputElement | null>(null);

  /**
   * Seçim, GÜNCEL listeye göre ayıklanmış hâliyle kullanılıyor.
   *
   * Pencere açıkken git durumu tazelenebiliyor (bir dosya terminalden commit'lendi
   * ya da geri alındı). Listede artık olmayan bir yol seçili kalırsa git'e gider
   * ve "pathspec did not match" ile TÜM stash'i düşürür.
   */
  const picked = useMemo(() => pruneSelection(changes, selected), [changes, selected]);
  const paths = stashPaths(changes, picked);
  const state = selectionState(changes, picked);
  const untracked = needsUntracked(changes, picked);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (master.current) master.current.indeterminate = state === "some";
  });

  const close = () => useStore.getState().setUi({ stashDialog: null });

  // Capture fazında: App'in genel kısayol dinleyicisine ulaşmadan karara bağlıyoruz
  // (bkz. `ConfirmDialog`), yoksa Esc başka bir örtüyü kapatabilir. Stash sürerken
  // kapatılamaz: pencere kapanınca sonucu (ve hatayı) gösterecek yer kalmaz.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [busy]);

  const submit = async () => {
    if (busy || paths.length === 0) return;
    const store = useStore.getState();
    const label = name.trim();
    setBusy(true);
    setError(null);
    try {
      await store.stashChanges(cwd, label, paths, untracked);
      store.toast(label ? t("git.stashDone", { name: label }) : t("git.stashDoneUnnamed"), "ok");
      close();
    } catch (err) {
      // Pencere AÇIK kalıyor: seçim ve ad korunuyor, kullanıcı düzeltip yeniden dener.
      setError(String(err));
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={() => !busy && close()}>
      <div
        className="modal narrow stash-dialog"
        role="dialog"
        aria-label={t("git.stashTitle")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{t("git.stashTitle")}</h2>
          <button className="icon-btn" disabled={busy} title={t("common.close")} onClick={close}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="stash-field">
            <label htmlFor="stash-name">{t("git.stashNameLabel")}</label>
            <input
              id="stash-name"
              ref={nameRef}
              value={name}
              placeholder={t("git.stashNamePlaceholder")}
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>

          <div className="stash-files-head">
            <label className="check-row">
              <input
                ref={master}
                type="checkbox"
                checked={state === "all"}
                onChange={() => setSelected(toggleAll(changes, picked))}
              />
              <span>{t("git.stashSelectAll")}</span>
            </label>
            <span className="dim">{tp("git.selectedCount", picked.size)}</span>
            <label className="check-row stash-paths">
              <input
                type="checkbox"
                checked={showPaths}
                onChange={(e) => useStore.getState().setUi({ gitShowPaths: e.target.checked })}
              />
              <span>{t("git.showPaths")}</span>
            </label>
          </div>

          <div className="stash-pick-list">
            {changes.map((change) => (
              <StashPickRow
                key={change.path}
                change={change}
                checked={picked.has(change.path)}
                showPaths={showPaths}
                onToggle={() => setSelected(toggleOne(picked, change.path))}
              />
            ))}
          </div>

          {untracked && <div className="hintline">{t("git.stashUntrackedHint")}</div>}

          {error && (
            <div className="git-commit-error" role="alert">
              <div className="git-commit-error-head">
                <strong>{t("git.stashFailed")}</strong>
                <button
                  type="button"
                  className="icon-btn"
                  title={t("common.close")}
                  onClick={() => setError(null)}
                >
                  ×
                </button>
              </div>
              {/* Git'in kendi metni, olduğu gibi (bkz. `GitCommitBox`). */}
              <pre>{error}</pre>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="spacer" />
          <button className="outline" disabled={busy} onClick={close}>
            {t("common.cancel")}
          </button>
          <button
            className="primary"
            disabled={busy || paths.length === 0}
            title={paths.length === 0 ? t("git.stashNoFiles") : undefined}
            onClick={() => void submit()}
          >
            {busy ? t("git.stashing") : t("git.stashConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Seçim listesindeki tek satır: kutu, durum simgesi, (istenirse) klasör ve ad. */
function StashPickRow({
  change,
  checked,
  showPaths,
  onToggle,
}: {
  change: GitChange;
  checked: boolean;
  /** Dosya adının solunda klasör zinciri de gösterilsin mi (`ui.gitShowPaths`). */
  showPaths: boolean;
  onToggle: () => void;
}) {
  const { text, tone, Icon } = useLabel(change.status);
  const dir = dirName(change.path);
  return (
    <label
      className="stash-pick"
      title={change.origPath ? `${change.origPath} → ${change.path}` : change.path}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className={`git-icon ${tone}`} title={text} role="img" aria-label={text}>
        <Icon size={13} />
      </span>
      {showPaths && dir && <span className="git-dir">{dir}</span>}
      <span className="git-path">{baseName(change.path)}</span>
    </label>
  );
}
