import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { joinDir, sameDir } from "../lib/dirs";
import { baseName } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";
import { fileKind } from "../lib/images";
import { ChevronIcon, FileKindIcon, FolderIcon } from "./Icons";
import type { DirEntry } from "../types";

/**
 * Dosya ağacı — dosya panelinin sol sütunu (bkz. `FilePanel`).
 *
 * ## Görüntüleyicide açık dosya İŞARETLİ
 *
 * Görüntüleyici ağacın yanında açılıyor; hangi dosyanın açık olduğu ağaçta da
 * görünmeli. Aramadan ya da paletten açılan dosyanın dalları da açılıyor
 * (`openFile`) ve satırı bir kez görünür alana kaydırılıyor — her çizimde
 * değil: kullanıcı ağacı başka yere kaydırdıysa bir klasör açmak onu geri
 * çekmemeli.
 *
 * ## Tembel açılıyor
 *
 * Her klasör yalnızca AÇILDIĞINDA okunuyor. Bütün ağacı önden okumak derin bir
 * projede binlerce klasör gezmek demek ve panel açılırken uygulamayı
 * kilitlerdi.
 *
 * ## Satırda türün simgesi
 *
 * Klasörde klasör, dosyada türü (görsel, kod, belge): Ctrl+P paletiyle ve
 * içerik aramasının sonuçlarıyla AYNI simgeler (`FileKindIcon`). BİLDİRİLEN:
 * "klasör yapısını açtığımda dosyaların tiplerini gösteren iconlar burada
 * yok, cmd + p deyince görüyorum." Klasörün de simgesi var: yalnız dosyalarda
 * olsaydı dosya adları klasör adlarından bir simge kadar içeride başlardı.
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

  /*
   * Açık dosyanın satırı: bir kez, açılışta görünür alana.
   *
   * Anahtar yol + gidiş sırası: aynı dosya aramadan yeniden açıldığında da
   * kaydırılsın. Satır tembel yüklenen bir dalda olabilir; ref geri çağırması
   * satır ÇİZİLDİĞİ an çalışıyor, dal ne zaman gelirse gelsin.
   */
  const selected = useStore((s) => s.ui.viewerPath);
  const seq = useStore((s) => s.ui.viewerReveal?.seq ?? 0);
  const kaydirilan = useRef<string | null>(null);
  const anahtar = selected ? `${selected}#${seq}` : null;
  const onSelectedRow = useCallback(
    (el: HTMLElement | null) => {
      if (!el || !anahtar || kaydirilan.current === anahtar) return;
      kaydirilan.current = anahtar;
      el.scrollIntoView({ block: "nearest" });
    },
    [anahtar],
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
      <Level
        key={cwd}
        path={cwd}
        depth={0}
        expanded={expanded}
        onToggle={toggle}
        selected={selected}
        onSelectedRow={onSelectedRow}
      />
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
  selected,
  onSelectedRow,
}: {
  path: string;
  depth: number;
  expanded: ReadonlySet<string>;
  onToggle: (full: string) => void;
  /** Görüntüleyicide açık dosya. */
  selected: string | null;
  onSelectedRow: (el: HTMLElement | null) => void;
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
        const secili = !entry.dir && !!selected && sameDir(full, selected);

        return (
          <div key={entry.name}>
            <button
              type="button"
              ref={secili ? onSelectedRow : undefined}
              className={entry.dir ? "tree-row dir" : secili ? "tree-row on" : "tree-row"}
              aria-current={secili || undefined}
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
              <span
                className="tree-ico"
                data-kind={entry.dir ? "dir" : fileKind(entry.name)}
                aria-hidden="true"
              >
                {entry.dir ? <FolderIcon size={12} /> : <FileKindIcon path={entry.name} size={12} />}
              </span>
              <span className="tree-name">{entry.name}</span>
            </button>

            {entry.dir && acik && (
              <Level
                path={full}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                selected={selected}
                onSelectedRow={onSelectedRow}
              />
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
