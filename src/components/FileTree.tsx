import { useEffect, useState } from "react";

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
export function FileTree() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const cwd = tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;

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
      <Level key={cwd} path={cwd} depth={0} />
    </div>
  );
}

/** Bir klasörün girdileri; açılan alt klasörler kendi `Level`ini kuruyor. */
function Level({ path, depth }: { path: string; depth: number }) {
  const t = useT();
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

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
        const acik = open.has(entry.name);

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
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(entry.name)) next.delete(entry.name);
                  else next.add(entry.name);
                  return next;
                });
              }}
            >
              {/* Klasörde ok, dosyada boş bir yer tutucu: ikisi aynı sütundan
                  başlamalı, yoksa satırlar yatay olarak kayıyor. */}
              <span className="tree-caret" aria-hidden="true">
                {entry.dir ? <ChevronIcon open={acik} size={10} /> : null}
              </span>
              <span className="tree-name">{entry.name}</span>
            </button>

            {entry.dir && acik && <Level path={full} depth={depth + 1} />}
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
