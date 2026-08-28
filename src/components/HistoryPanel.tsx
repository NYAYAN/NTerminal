import { useCallback, useEffect, useMemo, useState } from "react";

import { formatDuration, formatFullDate, formatWhen, shortenPath } from "../lib/format";
import { localeTag, tp, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import type { MsgKey } from "../lib/messages";
import { sessions, useStore, type HistoryScope } from "../store/useStore";
import type { HistoryEntry, HistoryFilter } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";

type Outcome = "all" | "ok" | "err";

const SCOPE_KEYS: Record<HistoryScope, MsgKey> = {
  tab: "history.scopeTab",
  group: "history.scopeGroup",
  all: "history.scopeAll",
};

/**
 * Komut geçmişi listesi. Panelin kabuğu (başlık, genişlik) SidePanel'e ait;
 * burada yalnızca denetimler, liste ve alt eylem çubuğu var.
 */
export function HistoryPanel() {
  const t = useT();
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
      store().toast(t("history.noActiveTerminal"), "err");
      return;
    }
    session.insertCommand(command, execute);
  };

  const copy = async (commands: string[]) => {
    const text = commands.join("\r\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      store().toast(tp("history.copied", commands.length), "ok");
    } catch {
      store().toast(t("history.clipboardFailed"), "err");
    }
  };

  const runSelected = async () => {
    if (selectedEntries.length === 0) return;
    if (selectedEntries.length === 1) {
      insert(selectedEntries[0].command, true);
      return;
    }
    const ok = await store().askConfirm({
      title: t("confirm.runManyTitle"),
      message: tp("confirm.runMany", selectedEntries.length),
      confirmLabel: t("confirm.run"),
    });
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
    store().toast(tp("history.deleted", removed), "ok");
  };

  const clearScope = async () => {
    const label = t(SCOPE_KEYS[scope]).toLocaleLowerCase(localeTag());
    const ok = await store().askConfirm({
      title: t("confirm.clearHistoryTitle"),
      message: t("confirm.clearHistoryMessage", { scope: label }),
      detail: t("confirm.clearHistoryDetail"),
      confirmLabel: t("confirm.clear"),
      danger: true,
    });
    if (!ok) return;
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
    store().toast(tp("history.deleted", removed), "ok");
  };

  const entriesFor = (entry: HistoryEntry): MenuEntry[] => {
    const isFav = favoriteCommands.has(entry.command);
    return [
      { kind: "item", label: t("common.run"), run: () => insert(entry.command, true) },
      {
        kind: "item",
        label: t("menu.insertAtPrompt"),
        hint: t("common.doubleClick"),
        run: () => insert(entry.command, false),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: t(isFav ? "menu.removeFavorite" : "menu.addFavorite"),
        run: () => void store().toggleFavorite(entry.command),
      },
      {
        kind: "item",
        label: t("menu.showInFavorites"),
        run: () => setUi({ panelMode: "favorites" }),
      },
      { kind: "separator" },
      { kind: "item", label: t("common.copyCommand"), run: () => void copy([entry.command]) },
      ...(entry.cwd
        ? [
            {
              kind: "item" as const,
              label: t("common.revealFolder"),
              run: () => void api.revealInExplorer(entry.cwd!).catch(() => {}),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: t("menu.deleteFromHistory"),
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
          {(Object.keys(SCOPE_KEYS) as HistoryScope[]).map((key) => (
            <button
              key={key}
              className={scope === key ? "on" : ""}
              onClick={() => {
                setUi({ historyScope: key });
                setSelected(new Set());
              }}
            >
              {t(SCOPE_KEYS[key])}
            </button>
          ))}
        </div>

        <input
          placeholder={t("history.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />

        <div className="row">
          <div className="seg">
            <button className={outcome === "all" ? "on" : ""} onClick={() => setOutcome("all")}>
              {t("history.outcomeAll")}
            </button>
            <button className={outcome === "ok" ? "on" : ""} onClick={() => setOutcome("ok")}>
              {t("history.outcomeOk")}
            </button>
            <button className={outcome === "err" ? "on" : ""} onClick={() => setOutcome("err")}>
              {t("history.outcomeErr")}
            </button>
          </div>
          <label className="check-row" style={{ marginLeft: "auto", padding: 0 }}>
            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
            <span className="dim">{t("history.hideDupes")}</span>
          </label>
        </div>
      </div>

      <div className="panel-list">
        {entries.length === 0 && (
          <div className="hint">
            {query.trim()
              ? t("history.noSearchMatch")
              : t(scope === "tab" ? "history.emptyTab" : "history.empty")}
          </div>
        )}

        {entries.map((entry) => {
          const isSelected = selected.has(entry.id);
          const isFav = favoriteCommands.has(entry.command);
          const badge =
            entry.exitCode === null
              ? { cls: "run", text: entry.durationMs === null ? t("history.running") : "?" }
              : entry.exitCode === 0
                ? { cls: "ok", text: formatDuration(entry.durationMs) || "0" }
                : { cls: "err", text: t("history.exitCode", { code: entry.exitCode }) };

          return (
            <div
              key={entry.id}
              className={isSelected ? "hitem sel" : "hitem"}
              title={[
                entry.command,
                "",
                formatFullDate(entry.startedAt),
                entry.cwd ?? "",
                t("history.duration", {
                  value: formatDuration(entry.durationMs) || t("history.unknown"),
                }),
                t("history.source", { source: entry.source }),
              ].join("\n")}
              onClick={(e) => toggleSelect(entry.id, e.ctrlKey || e.metaKey || e.shiftKey)}
              onDoubleClick={() => insert(entry.command, false)}
              onContextMenu={(e) => menu.open(e, entriesFor(entry))}
            >
              <button
                className={isFav ? "hstar on" : "hstar"}
                title={t(isFav ? "menu.removeFavorite" : "menu.addFavorite")}
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
          {selected.size > 0 ? t("history.selectedPrefix", { n: selected.size }) : ""}
          {tp("history.records", total, {
            value: entries.length < total ? `${entries.length} / ${total}` : total,
          })}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="outline"
          disabled={selected.size !== 1}
          title={t("history.insertTitle")}
          onClick={() => insert(selectedEntries[0].command, false)}
        >
          {t("history.btnInsert")}
        </button>
        <button
          className="primary"
          disabled={selected.size === 0}
          title={t("history.runTitle")}
          onClick={() => void runSelected()}
        >
          {t("history.btnRun")}
        </button>
        <button
          className="outline"
          title={t("history.copyTitle")}
          onClick={() =>
            void copy((selectedEntries.length > 0 ? selectedEntries : entries).map((e) => e.command))
          }
        >
          {t("history.btnCopy")}
        </button>
        <button
          className="danger"
          disabled={selected.size === 0}
          title={t("history.deleteTitle")}
          onClick={() => void deleteSelected()}
        >
          {t("history.btnDelete")}
        </button>
        <button
          className="danger"
          title={t("history.clearScopeTitle")}
          onClick={() => void clearScope()}
        >
          {t("history.btnClear")}
        </button>
      </div>

      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </>
  );
}
