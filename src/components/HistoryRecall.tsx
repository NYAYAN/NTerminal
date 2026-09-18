import { useEffect, useMemo, useRef, useState } from "react";

import { formatDuration, formatWhen, fuzzyScore, shortenPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import type { Favorite, HistoryEntry } from "../types";

/** Listede hem favoriler hem gecmis kayitlari var; kaynagi isaretliyoruz. */
interface Row {
  key: string;
  command: string;
  cwd: string | null;
  durationMs: number | null;
  exitCode: number | null;
  startedAt: number;
  favorite: Favorite | null;
}

/**
 * Ctrl+R: hızlı komut geri çağırma.
 *
 * Geçmiş panelinden farkı: burada amaç göz gezdirmek değil, aradığın komutu
 * iki üç harfle bulup Enter'a basmak. Bu yüzden liste bulanık (fuzzy) eşleşmeye
 * göre sıralanıyor ve klavye tek başına yeterli.
 */
export function HistoryRecall() {
  const t = useT();
  const setUi = useStore((s) => s.setUi);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);

  const favorites = useStore((s) => s.favorites);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];

  const [query, setQuery] = useState("");
  const [scopeAll, setScopeAll] = useState(false);
  /**
   * Favoriler listeye karışsın mı. VARSAYILAN HAYIR.
   *
   * BİLDİRİLEN: "Ctrl+R yapınca 'bu sekmenin geçmişinde ara' çıkıyor ama en
   * üstte favorilere eklediklerim geliyor, gelmemeli."
   *
   * Pencerenin sorduğu soru "bu sekmede ne çalıştırdım"; favori ise bir NİYET
   * — hiç çalıştırılmamış bir favori de listenin başını tutuyor ve aranan
   * komutu aşağı itiyordu. Favorilerin kendi paneli var. Yine de aynı kutudan
   * çağırmak isteyen için tik duruyor: kapatılan şey kaybolmuyor, isteğe
   * bağlı hâle geliyor.
   */
  const [showFavorites, setShowFavorites] = useState(false);
  const [all, setAll] = useState<HistoryEntry[]>([]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Tik ile odak kutudan çıkıyor; yazmaya devam edilebilmeli (bkz. onChange).
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void api
      .historyQuery({
        tabId: scopeAll ? null : (tab?.id ?? "__none__"),
        dedupe: true,
        limit: 2000,
      })
      .then((page) => setAll(page.entries))
      .catch(() => setAll([]));
  }, [scopeAll, tab?.id]);

  const rows = useMemo<Row[]>(() => {
    // Tik açıksa favoriler listenin BAŞINDA: oradayken en çok çağrılacak
    // komutlar onlar. Kapalıyken hiç yok (gerekçesi `showFavorites` üzerinde).
    const favoriteRows: Row[] = !showFavorites
      ? []
      : favorites
          .filter((f) => !f.groupId || f.groupId === group?.id)
          .map((f) => ({
            key: `fav:${f.id}`,
            command: f.command,
            cwd: f.cwd,
            durationMs: null,
            exitCode: null,
            startedAt: f.lastUsedAt ?? f.createdAt,
            favorite: f,
          }));
    /*
     * Aynı komut iki kez görünmesin — ama süzgeç YALNIZCA favoriler
     * listedeyken çalışıyor. Tik kapalıyken de süzseydi, favoriye eklenmiş bir
     * komut geçmişten de düşerdi: kullanıcı en çok kullandığı komutu Ctrl+R
     * ile hiç bulamazdı. Kova boş olduğu için aşağıdaki süzgeç o hâlde
     * kendiliğinden etkisiz.
     */
    const favoriteCommands = new Set(favoriteRows.map((r) => r.command));
    const historyRows: Row[] = all
      .filter((e) => !favoriteCommands.has(e.command))
      .map((e) => ({
        key: `h:${e.id}`,
        command: e.command,
        cwd: e.cwd,
        durationMs: e.durationMs,
        exitCode: e.exitCode,
        startedAt: e.startedAt,
        favorite: null,
      }));
    return [...favoriteRows, ...historyRows];
  }, [all, favorites, group?.id, showFavorites]);

  const results = useMemo(() => {
    const needle = query.trim();
    if (!needle) return rows.slice(0, 200);
    return rows
      .map((row) => ({ row, score: fuzzyScore(row.command, needle) }))
      .filter((r): r is { row: Row; score: number } => r.score !== null)
      // Esit puanda favori once gelsin.
      .sort((a, b) => a.score - b.score || (a.row.favorite ? -1 : 1))
      .slice(0, 200)
      .map((r) => r.row);
  }, [rows, query]);

  // Liste değiştiğinde seçim başa dönüyor: kapsam ya da tik değişince eski
  // indeks bambaşka bir komutu gösterir, Enter da onu çalıştırırdı.
  useEffect(() => {
    setIndex(0);
  }, [query, scopeAll, showFavorites]);

  // Seçili satırı görünür tut.
  useEffect(() => {
    const container = listRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const apply = (row: Row | undefined, execute: boolean) => {
    if (!row || !tab) return;
    const store = useStore.getState();
    if (row.favorite) {
      // Favoriler klasor bilgisi tasiyabiliyor; store bunu da uyguluyor.
      void store.runFavorite(row.favorite.id, execute);
      setUi({ searchOpen: false });
      return;
    }
    if (!store.activeSession()) {
      store.toast("Etkin bir terminal yok", "err");
      return;
    }
    store.insertCommand(row.command, execute);
    setUi({ searchOpen: false });
  };

  return (
    <div className="overlay" onMouseDown={() => setUi({ searchOpen: false })}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          ref={inputRef}
          placeholder={t(scopeAll ? "recall.placeholderAll" : "recall.placeholderTab")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "PageDown") {
              e.preventDefault();
              setIndex((i) => Math.min(results.length - 1, i + 8));
            } else if (e.key === "PageUp") {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 8));
            } else if (e.key === "Enter") {
              e.preventDefault();
              apply(results[index], true);
            } else if (e.key === "Tab") {
              e.preventDefault();
              apply(results[index], false);
            } else if (e.key === "Escape") {
              setUi({ searchOpen: false });
            } else if (e.key.toLowerCase() === "a" && e.ctrlKey) {
              e.preventDefault();
              setScopeAll((v) => !v);
            } else if (e.key.toLowerCase() === "f" && e.ctrlKey) {
              // Tikin klavye karşılığı: kutu klavyeyle kullanılıyor, favorileri
              // açmak için fareye uzanmak akışı kesiyor.
              e.preventDefault();
              setShowFavorites((v) => !v);
            }
          }}
        />

        <div className="palette-list" ref={listRef}>
          {results.length === 0 && (
            <div className="hint">
              {rows.length === 0
                ? t(scopeAll ? "recall.emptyAll" : "recall.emptyTab")
                : t("recall.noMatch")}
            </div>
          )}
          {results.map((row, i) => (
            <div
              key={row.key}
              data-i={i}
              className={i === index ? "palette-row on" : "palette-row"}
              onMouseEnter={() => setIndex(i)}
              onClick={() => apply(row, false)}
              onDoubleClick={() => apply(row, true)}
            >
              {row.favorite ? (
                <span className="star" title={t("recall.favorite")}>
                  &#9733;
                </span>
              ) : (
                <span
                  style={{
                    flex: "none",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      row.exitCode === null
                        ? "var(--text-dim)"
                        : row.exitCode === 0
                          ? "var(--ok)"
                          : "var(--err)",
                  }}
                />
              )}
              <span className="txt mono">
                {row.favorite?.label ? `${row.favorite.label} \u2014 ${row.command}` : row.command}
              </span>
              <span className="kbd">{shortenPath(row.cwd, 1)}</span>
              <span className="kbd">{formatDuration(row.durationMs)}</span>
              {!row.favorite && <span className="kbd">{formatWhen(row.startedAt)}</span>}
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span>{t("palette.arrows")}</span>
          <span>{t("recall.enter")}</span>
          <span>{t("recall.tabKey")}</span>
          <span>
            {t("recall.scope", {
              scope: t(scopeAll ? "recall.scopeAll" : "recall.scopeTab"),
            })}
          </span>
          <span>{t("common.escClose")}</span>
          {/* Tik SAĞA yaslı: soldakiler "hangi tuş ne yapar", bu ise listenin
              neyi içerdiğini değiştiren tek denetim. */}
          <label className="check-row" style={{ marginLeft: "auto", padding: 0 }}>
            <input
              type="checkbox"
              checked={showFavorites}
              onChange={(e) => {
                setShowFavorites(e.target.checked);
                // Odak kutuya DÖNMELİ: tıkladıktan sonra yazmaya devam eden
                // kullanıcının harfleri hiçbir yere gitmezdi (odak tikte).
                inputRef.current?.focus();
              }}
            />
            <span>{t("recall.showFavorites")}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
