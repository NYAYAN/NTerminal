import { useEffect, useMemo, useRef, useState } from "react";

import { fuzzyScore } from "../lib/format";
import { tp, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
import { groupLabel } from "../lib/labels";
import { useStore } from "../store/useStore";

interface Action {
  id: string;
  label: string;
  hint?: string;
  keybinding?: string;
  run: () => void;
}

/** Ctrl+Shift+P: eylemleri ve grup/sekme/profil geçişlerini tek yerden bulma. */
export function CommandPalette() {
  const setUi = useStore((s) => s.setUi);
  const groups = useStore((s) => s.groups);
  const profiles = useStore((s) => s.settings.profiles);
  const keybindings = useStore((s) => s.settings.keybindings);
  const favorites = useStore((s) => s.favorites);
  const t = useT();

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const actions = useMemo<Action[]>(() => {
    const store = useStore.getState;
    const close = () => setUi({ paletteOpen: false });
    const list: Action[] = [
      {
        id: "newTab",
        label: t("term.newTab"),
        keybinding: keybindings.newTab,
        run: () => {
          close();
          store().addTab();
        },
      },
      {
        id: "newGroup",
        label: t("action.newGroup"),
        keybinding: keybindings.newGroup,
        run: () => {
          close();
          store().addGroup();
        },
      },
      {
        id: "closeTab",
        label: t("palette.closeActiveTab"),
        keybinding: keybindings.closeTab,
        run: () => {
          close();
          const active = store().activeTab();
          if (active) void store().closeTab(active.tab.id);
        },
      },
      {
        id: "renameTab",
        label: t("palette.renameTab"),
        keybinding: keybindings.renameTab,
        run: () => {
          const active = store().activeTab();
          close();
          if (active) setUi({ renamingTabId: active.tab.id });
        },
      },
      {
        id: "restartTab",
        label: t("palette.restartShell"),
        run: () => {
          const active = store().activeTab();
          close();
          if (active) void store().restartTab(active.tab.id);
        },
      },
      {
        id: "clear",
        label: t("term.clear"),
        keybinding: keybindings.clearTerminal,
        run: () => {
          close();
          store().activeSession()?.clear();
        },
      },
      {
        id: "history",
        label: t("palette.toggleHistory"),
        keybinding: keybindings.historyPanel,
        run: () => {
          close();
          setUi({ historyOpen: !store().ui.historyOpen });
        },
      },
      {
        id: "recall",
        label: t("palette.historySearch"),
        keybinding: keybindings.historySearch,
        run: () => {
          close();
          setUi({ searchOpen: true });
        },
      },
      // Dosya araması paletten de bulunabilsin: "her şeyi buradan bul"
      // refleksi. İkisi aynı dosya paletini farklı sekmede açıyor.
      {
        id: "filePalette",
        label: t("action.filePalette"),
        keybinding: keybindings.filePalette,
        run: () => {
          close();
          setUi({ filePaletteOpen: true, paletteMode: "files" });
        },
      },
      {
        id: "textSearch",
        label: t("action.textSearch"),
        keybinding: keybindings.textSearch,
        run: () => {
          close();
          setUi({ filePaletteOpen: true, paletteMode: "text" });
        },
      },
      {
        id: "settings",
        label: t("app.settings"),
        keybinding: keybindings.settings,
        run: () => {
          close();
          setUi({ settingsOpen: true });
        },
      },
      {
        id: "favorites",
        label: t("palette.favorites"),
        keybinding: keybindings.favorites,
        run: () => {
          close();
          setUi({ historyOpen: true, panelMode: "favorites" });
        },
      },
      {
        id: "transfer",
        label: t("palette.transfer"),
        run: () => {
          close();
          setUi({ transferOpen: true });
        },
      },
      {
        id: "reveal",
        label: t("palette.reveal"),
        run: () => {
          close();
          const cwd = store().activeSession()?.cwd;
          if (cwd) void api.revealInExplorer(cwd).catch(() => {});
        },
      },
      {
        id: "toggleViewMode",
        label: t("palette.toggleView"),
        keybinding: keybindings.toggleViewMode,
        run: () => {
          close();
          void store().toggleViewMode();
        },
      },
    ];

    // Favoriler dogrudan calistirilabilir girdi olarak listede: palet
    // kullanicinin "her seyi buradan bul" refleksine cevap vermeli.
    for (const favorite of favorites) {
      list.push({
        id: `fav:${favorite.id}`,
        label: `\u2605 ${favorite.label || favorite.command}`,
        hint: favorite.label ? favorite.command : (favorite.note ?? undefined),
        run: () => {
          close();
          void store().runFavorite(favorite.id, true);
        },
      });
    }

    for (const profile of profiles) {
      list.push({
        id: `profile:${profile.id}`,
        label: t("palette.newTabProfile", { name: profile.name }),
        hint: profile.unavailable ? t("palette.profileMissing") : profile.shell,
        run: () => {
          close();
          if (profile.unavailable) {
            store().toast(t("tab.profileUnavailable", { name: profile.name }), "err");
            return;
          }
          store().addTab({ profileId: profile.id });
        },
      });
    }

    for (const group of groups) {
      list.push({
        id: `group:${group.id}`,
        label: t("palette.switchGroup", { name: groupLabel(group) }),
        hint: tp("status.tabs", group.tabs.length),
        run: () => {
          close();
          store().setActiveGroup(group.id);
        },
      });
      for (const tab of group.tabs) {
        list.push({
          id: `tab:${tab.id}`,
          label: t("palette.switchTab", {
            name: tab.customTitle ?? tab.title ?? tab.cwd ?? tab.id,
          }),
          hint: groupLabel(group),
          run: () => {
            close();
            store().setActiveTab(tab.id);
          },
        });
      }
    }

    return list;
  }, [groups, profiles, keybindings, favorites, setUi, t]);

  const results = useMemo(() => {
    const needle = query.trim();
    if (!needle) return actions;
    return actions
      .map((action) => ({
        action,
        score: fuzzyScore(`${action.label} ${action.hint ?? ""}`, needle),
      }))
      .filter((r): r is { action: Action; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.action);
  }, [actions, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [index]);

  return (
    <div className="overlay" onMouseDown={() => setUi({ paletteOpen: false })}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={t("palette.placeholder")}
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
            } else if (e.key === "Enter") {
              e.preventDefault();
              results[index]?.run();
            } else if (e.key === "Escape") {
              setUi({ paletteOpen: false });
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="hint">{t("palette.noMatch")}</div>}
          {results.map((action, i) => (
            <div
              key={action.id}
              data-i={i}
              className={i === index ? "palette-row on" : "palette-row"}
              onMouseEnter={() => setIndex(i)}
              onClick={() => action.run()}
            >
              <span className="txt">{action.label}</span>
              {action.hint && <span className="kbd">{action.hint}</span>}
              {action.keybinding && <span className="kbd">{prettyCombo(action.keybinding)}</span>}
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span>{t("palette.arrows")}</span>
          <span>{t("palette.enter")}</span>
          <span>{t("common.escClose")}</span>
        </div>
      </div>
    </div>
  );
}
