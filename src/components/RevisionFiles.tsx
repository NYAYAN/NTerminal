import { useEffect, useState } from "react";

import { baseName, dirName } from "../lib/format";
import { hiddenFileCount } from "../lib/gitStash";
import { tp, useT } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { StashFile, StashFiles } from "../types";
import { useLabel } from "./gitShared";
import { ChevronIcon } from "./Icons";
import { StashDiff } from "./StashDiff";

/**
 * Bir revizyonun (stash ya da commit) dosyaları; dosyaya tıklayınca farkı.
 *
 * Stash bölümünün içindeydi; gönderilecek commit'ler de aynı şeyi gösteriyor
 * ("bu revizyon hangi dosyalara dokundu, nasıl"). İkisi tek yerden çiziliyor,
 * fark yalnızca verinin nereden okunduğu.
 *
 * Dosya listesi ve toplam sayı Rust'tan geliyor; liste 200'de kesiliyor ve
 * kesildiği "… ve N dosya daha" satırıyla söyleniyor (sessizce kesmek "dosyam
 * nerede" diye sordururdu).
 *
 * `depKey` revizyonu tanımlıyor (depo + kimlik): yükleyiciler her çizimde yeni
 * birer işlev ama aynı revizyonu okuyorlar; listeyi yalnızca anahtar değişince
 * yeniden istemek gerekiyor.
 */
export function RevisionFiles({
  depKey,
  loadFiles,
  loadDiff,
  emptyText,
}: {
  depKey: string;
  loadFiles: () => Promise<StashFiles>;
  loadDiff: (file: StashFile) => Promise<string | null>;
  emptyText: string;
}) {
  const t = useT();
  const [data, setData] = useState<StashFiles | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(null);
    loadFiles()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setFailed(String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  // Hata git'in kendi metni: revizyon artık yoksa ("liste değişmiş olabilir")
  // bunu söylüyor ve liste zaten tazelenince satır kayboluyor.
  if (failed) return <div className="pop-empty">{failed}</div>;
  if (!data) return <div className="pop-empty">{t("common.loading")}</div>;
  if (data.files.length === 0) return <div className="pop-empty">{emptyText}</div>;

  const hidden = hiddenFileCount(data.total, data.files.length);
  return (
    <div className="stash-files">
      {data.files.map((file) => (
        <RevisionFileRow key={file.path} file={file} loadDiff={loadDiff} />
      ))}
      {hidden > 0 && <div className="pop-empty">{tp("git.moreFiles", hidden)}</div>}
    </div>
  );
}

/**
 * Revizyondaki tek dosya: satıra tıklayınca farkı açılıyor.
 *
 * Fark yalnızca AÇILINCA isteniyor: yüz dosyalık bir revizyonda hepsini önden
 * istemek yüz `git` süreci demek (bkz. `DIFF_LIMIT` `GitChanges`te). Gelen sonuç
 * saklanıyor; satırı kapatıp açmak yeni istek üretmiyor.
 */
function RevisionFileRow({
  file,
  loadDiff,
}: {
  file: StashFile;
  loadDiff: (file: StashFile) => Promise<string | null>;
}) {
  const t = useT();
  const { text, tone, Icon } = useLabel(file.status);
  const [open, setOpen] = useState(false);
  /** `undefined` = henüz istenmedi, `null` = okunamadı. */
  const [diff, setDiff] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!open || diff !== undefined) return;
    let cancelled = false;
    loadDiff(file)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch(() => {
        if (!cancelled) setDiff(null);
      });
    return () => {
      cancelled = true;
    };
    // Satır yola göre anahtarlı: dosya değişirse bileşen yeniden kuruluyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, diff]);

  /*
   * Klasör ön eki Değişiklikler listesiyle AYNI ayardan (`ui.gitShowPaths`,
   * panel başlığındaki klasör düğmesi). İSTEK: "Klasör yollarını göster
   * etkisi Stash'te de olmalı" — burada her zaman çiziliyordu.
   */
  const showPaths = useStore((s) => s.ui.gitShowPaths);
  const dir = dirName(file.path);
  return (
    <div className={open ? "stash-file open" : "stash-file"}>
      <button
        type="button"
        className="git-row"
        title={file.origPath ? `${file.origPath} → ${file.path}` : file.path}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="git-caret" aria-hidden="true">
          <ChevronIcon open={open} size={11} />
        </span>
        <span className={`git-icon ${tone}`} title={text} role="img" aria-label={text}>
          <Icon size={13} />
        </span>
        {showPaths && dir && <span className="git-dir">{dir}</span>}
        <span className="git-path">{baseName(file.path)}</span>
      </button>
      {open && diff === undefined && <div className="pop-empty">{t("common.loading")}</div>}
      {open && diff !== undefined && (diff === null || diff === "") && (
        <div className="pop-empty">{t("git.noDiff")}</div>
      )}
      {open && diff && <StashDiff text={diff} />}
    </div>
  );
}
