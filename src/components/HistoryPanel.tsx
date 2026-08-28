import { useCallback, useEffect, useMemo, useState } from "react";

import { formatDuration, formatFullDate, formatWhen, shortenPath } from "../lib/format";
import { api } from "../lib/ipc";
import { sessions, useStore, type HistoryScope } from "../store/useStore";
import type { HistoryEntry, HistoryFilter } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";

type Outcome = "all" | "ok" | "err";

const SCOPE_LABELS: Record<HistoryScope, string> = {
  tab: "Bu sekme",
  group: "Bu grup",
  all: "Tümü",
};

/**
 * Komut geçmişi listesi. Panelin kabuğu (başlık, genişlik) SidePanel'e ait;
 * burada yalnızca denetimler, liste ve alt eylem çubuğu var.
 */
export function HistoryPanel() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const scope = useStore((s) => s.ui.historyScope);
  const dedupeDefault = useStore((s) => s.settings.behavior.historyDedupe);
  const setUi = useStore((s) => s.setUi);
  const running = useStore((s) => s.running);
  const favorites = useStore((s) => s.favorites);
  const store = useStore.getState;

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];

  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [dedupe, setDedupe] = useState(dedupeDefault);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const menu = useContextMenu();

  // Favori komutlar kümesi: her satırda yıldızın dolu mu olduğunu göstermek için.
  const favoriteCommands = useMemo(
    () => new Set(favorites.map((f) => f.command)),
    [favorites],
  );

  const filter = useMemo<HistoryFilter>(
    () => ({
      tabId: scope === "tab" ? (tab?.id ?? "__none__") : null,
      groupId: scope === "group" ? (group?.id ?? "__none__") : null,
      query: query.trim() || null,
      onlySucceeded: outcome === "all" ? null : outcome === "ok",
      dedupe,
      limit: 400,
    }),
    [scope, tab?.id, group?.id, query, outcome, dedupe],
  );

  const refresh = useCallback(() => {
    void api
      .historyQuery(filter)
      .then((page) => {
        setEntries(page.entries);
        setTotal(page.total);
      })
      .catch(() => {});
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Komut bitince liste kendiliğinden güncellensin.
  useEffect(() => {
    refresh();
  }, [running, refresh]);

  // Çalışan komutun süresi aksın diye hafif bir yoklama.
  useEffect(() => {
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const session = tab ? sessions.get(tab.id) : undefined;

  const toggleSelect = (id: string, additive: boolean) => {
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedEntries = entries.filter((e) => selected.has(e.id));

  const insert = (command: string, execute: boolean) => {
    if (!session) {
      store().toast("Etkin bir terminal yok", "err");
      return;
    }
    session.insertCommand(command, execute);
  };

  const copy = async (commands: string[]) => {
    const text = commands.join("\r\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      store().toast(`${commands.length} komut kopyalandı`, "ok");
    } catch {
      store().toast("Panoya yazılamadı", "err");
    }
  };

  const runSelected = () => {
    if (selectedEntries.length === 0) return;
    if (selectedEntries.length === 1) {
      insert(selectedEntries[0].command, true);
      return;
    }
    const ok = window.confirm(
      `${selectedEntries.length} komut sırayla çalıştırılacak. Devam edilsin mi?`,
    );
    if (!ok) return;
    // Liste en yeniden eskiye sıralı; çalıştırma sırası kronolojik olmalı.
    for (const entry of [...selectedEntries].reverse()) {
      insert(entry.command, true);
    }
  };

  const deleteSelected = async () => {
    if (selectedEntries.length === 0) return;
    const removed = await api.historyDelete(selectedEntries.map((e) => e.id)).catch(() => 0);
    setSelected(new Set());
    refresh();
    store().toast(`${removed} kayıt silindi`, "ok");
  };

  const clearScope = async () => {
    const label = SCOPE_LABELS[scope].toLowerCase();
    if (!window.confirm(`"${label}" kapsamındaki tüm komut geçmişi silinecek. Emin misiniz?`)) return;
    const removed = await api
      .historyClear({
        tabId: filter.tabId,
        groupId: filter.groupId,
        query: null,
        onlySucceeded: null,
      })
      .catch(() => 0);
    setSelected(new Set());
    refresh();
    store().toast(`${removed} kayıt silindi`, "ok");
  };

  const entriesFor = (entry: HistoryEntry): MenuEntry[] => {
    const isFav = favoriteCommands.has(entry.command);
    return [
      { kind: "item", label: "Çalıştır", run: () => insert(entry.command, true) },
      { kind: "item", label: "İstem satırına yaz", hint: "çift tık", run: () => insert(entry.command, false) },
      { kind: "separator" },
      {
        kind: "item",
        label: isFav ? "Favoriden kaldır" : "Favorilere ekle",
        run: () => void store().toggleFavorite(entry.command),
      },
      {
        kind: "item",
        label: "Favoriler panelinde göster",
        run: () => setUi({ panelMode: "favorites" }),
      },
      { kind: "separator" },
      { kind: "item", label: "Komutu kopyala", run: () => void copy([entry.command]) },
      ...(entry.cwd
        ? [
            {
              kind: "item" as const,
              label: "Klasörü Gezgin'de aç",
              run: () => void api.revealInExplorer(entry.cwd!).catch(() => {}),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: "Geçmişten sil",
        danger: true,
        run: () => {
          void api.historyDelete([entry.id]).then(() => refresh());
        },
      },
    ];
  };

  return (
    <>
      <div className="panel-controls column">
        <div className="seg full">
          {(Object.keys(SCOPE_LABELS) as HistoryScope[]).map((key) => (
            <button
              key={key}
              className={scope === key ? "on" : ""}
              onClick={() => {
                setUi({ historyScope: key });
                setSelected(new Set());
              }}
            >
              {SCOPE_LABELS[key]}
            </button>
          ))}
        </div>

        <input
          placeholder="komut veya dizin ara…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />

        <div className="row">
          <div className="seg">
            <button className={outcome === "all" ? "on" : ""} onClick={() => setOutcome("all")}>
              Hepsi
            </button>
            <button className={outcome === "ok" ? "on" : ""} onClick={() => setOutcome("ok")}>
              Başarılı
            </button>
            <button className={outcome === "err" ? "on" : ""} onClick={() => setOutcome("err")}>
              Hatalı
            </button>
          </div>
          <label className="check-row" style={{ marginLeft: "auto", padding: 0 }}>
            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
            <span className="dim">tekrarları gizle</span>
          </label>
        </div>
      </div>

      <div className="panel-list">
        {entries.length === 0 && (
          <div className="hint">
            {query.trim()
              ? "Bu aramaya uyan komut yok."
              : scope === "tab"
                ? "Bu sekmede henüz komut çalıştırılmadı.\nKomutlar çalıştıkça burada birikir."
                : "Kayıtlı komut yok."}
          </div>
        )}

        {entries.map((entry) => {
          const isSelected = selected.has(entry.id);
          const isFav = favoriteCommands.has(entry.command);
          const badge =
            entry.exitCode === null
              ? { cls: "run", text: entry.durationMs === null ? "çalışıyor" : "?" }
              : entry.exitCode === 0
                ? { cls: "ok", text: formatDuration(entry.durationMs) || "0" }
                : { cls: "err", text: `çıkış ${entry.exitCode}` };

          return (
            <div
              key={entry.id}
              className={isSelected ? "hitem sel" : "hitem"}
              title={`${entry.command}\n\n${formatFullDate(entry.startedAt)}\n${entry.cwd ?? ""}\nsüre: ${
                formatDuration(entry.durationMs) || "bilinmiyor"
              }\nkaynak: ${entry.source}`}
              onClick={(e) => toggleSelect(entry.id, e.ctrlKey || e.metaKey || e.shiftKey)}
              onDoubleClick={() => insert(entry.command, false)}
              onContextMenu={(e) => menu.open(e, entriesFor(entry))}
            >
              <button
                className={isFav ? "hstar on" : "hstar"}
                title={isFav ? "Favoriden kaldır" : "Favorilere ekle"}
                onClick={(e) => {
                  e.stopPropagation();
                  void store().toggleFavorite(entry.command);
                }}
              >
                {isFav ? "★" : "☆"}
              </button>
              <div className="cmd">{entry.command}</div>
              <span className={`badge ${badge.cls}`}>{badge.text}</span>
              <div className="meta">
                <span>{formatWhen(entry.startedAt)}</span>
                {entry.cwd && <span className="path">{shortenPath(entry.cwd, 2)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel-foot">
        <span>
          {selected.size > 0 ? `${selected.size} seçili / ` : ""}
          {entries.length < total ? `${entries.length} / ${total}` : total} kayıt
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="outline"
          disabled={selected.size !== 1}
          title="Komutu istem satırına yaz (çalıştırmaz)"
          onClick={() => insert(selectedEntries[0].command, false)}
        >
          Yaz
        </button>
        <button
          className="primary"
          disabled={selected.size === 0}
          title="Seçili komutları çalıştır"
          onClick={runSelected}
        >
          Çalıştır
        </button>
        <button
          className="outline"
          title="Panoya kopyala"
          onClick={() =>
            void copy((selectedEntries.length > 0 ? selectedEntries : entries).map((e) => e.command))
          }
        >
          Kopyala
        </button>
        <button
          className="danger"
          disabled={selected.size === 0}
          title="Seçili kayıtları geçmişten sil"
          onClick={() => void deleteSelected()}
        >
          Sil
        </button>
        <button className="danger" title="Bu kapsamdaki geçmişi temizle" onClick={() => void clearScope()}>
          Temizle
        </button>
      </div>

      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </>
  );
}
