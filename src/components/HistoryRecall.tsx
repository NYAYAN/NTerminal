import { useEffect, useMemo, useRef, useState } from "react";

import { formatDuration, formatWhen, fuzzyScore, shortenPath } from "../lib/format";
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
  const setUi = useStore((s) => s.setUi);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);

  const favorites = useStore((s) => s.favorites);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];

  const [query, setQuery] = useState("");
  const [scopeAll, setScopeAll] = useState(false);
  const [all, setAll] = useState<HistoryEntry[]>([]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

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
    // Favoriler her zaman listenin basinda: Ctrl+R ile en cok cagrilacak
    // komutlar onlar. Ayni komut gecmiste de varsa iki kez gosterilmiyor.
    const favoriteRows: Row[] = favorites
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
  }, [all, favorites, group?.id]);

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

  useEffect(() => {
    setIndex(0);
  }, [query, scopeAll]);

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
    const session = store.activeSession();
    if (!session) {
      store.toast("Etkin bir terminal yok", "err");
      return;
    }
    session.insertCommand(row.command, execute);
    setUi({ searchOpen: false });
  };

  return (
    <div className="overlay" onMouseDown={() => setUi({ searchOpen: false })}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={
            scopeAll ? "tüm geçmişte ara…" : "bu sekmenin geçmişinde ara… (Ctrl+A: tüm sekmeler)"
          }
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
            }
          }}
        />

        <div className="palette-list" ref={listRef}>
          {results.length === 0 && (
            <div className="hint">
              {rows.length === 0
                ? scopeAll
                  ? "Henüz kayıtlı komut yok."
                  : "Bu sekmede henüz komut çalıştırılmadı. Ctrl+A ile tüm geçmişe bakabilirsiniz."
                : "Eşleşen komut yok."}
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
                <span className="star" title="favori">
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
          <span>↑↓ gez</span>
          <span>Enter çalıştır</span>
          <span>Tab yalnızca yaz</span>
          <span>Ctrl+A kapsam: {scopeAll ? "tüm sekmeler" : "bu sekme"}</span>
          <span>Esc kapat</span>
        </div>
      </div>
    </div>
  );
}
