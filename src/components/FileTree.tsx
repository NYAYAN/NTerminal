import { useCallback, useEffect, useMemo, useState } from "react";

import { joinDir } from "../lib/dirs";
import { baseName } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";
import { ChevronIcon, FolderIcon } from "./Icons";
import type { DirEntry } from "../types";

/**
 * Dosya ağacı — sağ panelin "Dosyalar" sekmesi.
 *
 * ## Neden var olan panelin içinde
 *
 * Warp'ta ağaç solda, sekme listesinin yanında ayrı bir panel. Burada sağ
 * panelin dördüncü sekmesi: geçmiş, favoriler ve değişiklikler zaten orada.
 * Yeni bir panel yeni bir kapatma yolu, yeni bir genişlik tutamacı ve
 * "bunu nasıl kapatıyorum" sorusu demekti — değişiklikler için de aynı kararı
 * verdik.
 *
 * ## Tembel açılıyor
 *
 * Her klasör yalnızca AÇILDIĞINDA okunuyor. Bütün ağacı önden okumak derin bir
 * projede binlerce klasör gezmek demek ve panel açılırken uygulamayı
 * kilitlerdi.
 *
 * ## Dosyaya tıklamak ne yapıyor
 *
 * İçeriğini görüntüleyicide açıyor — Ctrl+P paletiyle aynı. Shift ile tıklamak
 * ise yolu komut satırına ekliyor; ikisi de gerçek bir ihtiyaç ve ayrımı tek
 * bir değiştirici tuş taşıyor.
 */
/**
 * Etkin sekmenin çalışma dizini.
 *
 * AYRI bir kanca çünkü dosya sütununda iki yer aynı dizini görmek zorunda:
 * ağaç ve onun üstündeki arama kutusu (`FileSearch`). Doğru kaynak oturumun
 * kendisi (`sessions`), sekmedeki kopya yalnızca yedek: kabuk `cd` yaptığında
 * oturum güncel, sekme kaydı bir olay gecikmesi geriden gelebiliyor.
 */
export function useActiveCwd(): string | null {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  return tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;
}

export function FileTree() {
  const t = useT();
  const cwd = useActiveCwd();

  /*
   * Açık klasörler DEPODAN ve tek yerden okunuyor.
   *
   * Küme burada kurulup aşağı geçiriliyor; her `Level`in kendi aboneliği
   * olsaydı derin bir ağaçta onlarca abonelik olurdu ve hepsi aynı diziye
   * bakardı. Kümeye çevirmek de bir kez: satır başına `Array.includes` yerine
   * sabit zamanlı arama.
   */
  const expandedList = useStore((s) => s.ui.treeExpanded);
  const setUi = useStore((s) => s.setUi);
  const expanded = useMemo(() => new Set(expandedList), [expandedList]);

  const toggle = useCallback(
    (full: string) => {
      const next = new Set(useStore.getState().ui.treeExpanded);
      if (!next.delete(full)) next.add(full);
      useStore.getState().setUi({ treeExpanded: [...next] });
    },
    // `setUi` depo kimliği; bağımlılık listesi bilinçli olarak boş kalmasın
    // diye duruyor. Geri çağırma her çizimde yeniden kurulmuyor.
    [setUi],
  );

  if (!cwd) return <div className="pop-empty">{t("tree.noDir")}</div>;

  return (
    <div className="panel-list file-tree">
      <div className="tree-root">
        <FolderIcon size={12} />
        <span className="tree-root-name" title={cwd}>
          {baseName(cwd) || cwd}
        </span>
      </div>
      {/* `key` dizinle: sekme değişip dizin değişince ağaç sıfırdan kurulmalı,
          eski klasörlerin açık kalması yanıltıcı olurdu. */}
      <Level key={cwd} path={cwd} depth={0} expanded={expanded} onToggle={toggle} />
    </div>
  );
}

/**
 * Bir klasörün girdileri; açılan alt klasörler kendi `Level`ini kuruyor.
 *
 * Girdiler (`entries`) YEREL kalıyor: bir kez okunan klasörün içeriği o
 * bileşenle yaşıyor ve yeniden açılınca diske gidilmiyor. Açık olma durumu ise
 * paylaşılan (bkz. `ui.treeExpanded`) — toplu daraltma düğmesi ve sütunun
 * kapanıp açılması onu görmek zorunda.
 */
function Level({
  path,
  depth,
  expanded,
  onToggle,
}: {
  path: string;
  depth: number;
  expanded: ReadonlySet<string>;
  onToggle: (full: string) => void;
}) {
  const t = useT();
  const [entries, setEntries] = useState<DirEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listEntries(path)
      // Okunamayan klasör (izin, kopmuş ağ sürücüsü) ağacı kilitlememeli.
      .then((list) => !cancelled && setEntries(list))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (entries === null) {
    return <div className="tree-info" style={{ paddingLeft: pad(depth) }}>{t("common.loading")}</div>;
  }
  if (entries.length === 0) {
    return <div className="tree-info" style={{ paddingLeft: pad(depth) }}>{t("tree.empty")}</div>;
  }

  return (
    <>
      {entries.map((entry) => {
        const full = joinDir(path, entry.name);
        const acik = expanded.has(full);

        return (
          <div key={entry.name}>
            <button
              type="button"
              className={entry.dir ? "tree-row dir" : "tree-row"}
              style={{ paddingLeft: pad(depth) }}
              title={full}
              onClick={(e) => {
                if (!entry.dir) {
                  // Shift: yolu komut satırına ekle. Düz tıklama içeriği
                  // gösteriyor — ağaçta bir dosyaya tıklayan çoğu zaman
                  // içine bakmak istiyor.
                  if (e.shiftKey) useStore.getState().insertPath(full);
                  else useStore.getState().openFile(full);
                  return;
                }
                onToggle(full);
              }}
            >
              {/* Klasörde ok, dosyada boş bir yer tutucu: ikisi aynı sütundan
                  başlamalı, yoksa satırlar yatay olarak kayıyor. */}
              <span className="tree-caret" aria-hidden="true">
                {entry.dir ? <ChevronIcon open={acik} size={10} /> : null}
              </span>
              <span className="tree-name">{entry.name}</span>
            </button>

            {entry.dir && acik && (
              <Level path={full} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Derinliğe göre girinti (px). */
function pad(depth: number): number {
  return 8 + depth * 13;
}
