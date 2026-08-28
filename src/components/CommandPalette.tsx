import { useEffect, useMemo, useRef, useState } from "react";

import { fuzzyScore } from "../lib/format";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
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

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const actions = useMemo<Action[]>(() => {
    const store = useStore.getState;
    const close = () => setUi({ paletteOpen: false });
    const list: Action[] = [
      {
        id: "newTab",
        label: "Yeni sekme",
        keybinding: keybindings.newTab,
        run: () => {
          close();
          store().addTab();
        },
      },
      {
        id: "newGroup",
        label: "Yeni grup",
        keybinding: keybindings.newGroup,
        run: () => {
          close();
          store().addGroup();
        },
      },
      {
        id: "closeTab",
        label: "Etkin sekmeyi kapat",
        keybinding: keybindings.closeTab,
        run: () => {
          close();
          const active = store().activeTab();
          if (active) void store().closeTab(active.tab.id);
        },
      },
      {
        id: "renameTab",
        label: "Sekmeyi yeniden adlandır",
        keybinding: keybindings.renameTab,
        run: () => {
          const active = store().activeTab();
          close();
          if (active) setUi({ renamingTabId: active.tab.id });
        },
      },
      {
        id: "restartTab",
        label: "Sekmedeki kabuğu yeniden başlat",
        run: () => {
          const active = store().activeTab();
          close();
          if (active) void store().restartTab(active.tab.id);
        },
      },
      {
        id: "clear",
        label: "Terminali temizle",
        keybinding: keybindings.clearTerminal,
        run: () => {
          close();
          store().activeSession()?.clear();
        },
      },
      {
        id: "history",
        label: "Komut geçmişi panelini aç/kapat",
        keybinding: keybindings.historyPanel,
        run: () => {
          close();
          setUi({ historyOpen: !store().ui.historyOpen });
        },
      },
      {
        id: "recall",
        label: "Geçmişte hızlı arama",
        keybinding: keybindings.historySearch,
        run: () => {
          close();
          setUi({ searchOpen: true });
        },
      },
      {
        id: "settings",
        label: "Ayarlar",
        keybinding: keybindings.settings,
        run: () => {
          close();
          setUi({ settingsOpen: true });
        },
      },
      {
        id: "favorites",
        label: "Favori komutlar panelini ac",
        keybinding: keybindings.favorites,
        run: () => {
          close();
          setUi({ historyOpen: true, panelMode: "favorites" });
        },
      },
      {
        id: "transfer",
        label: "Ayarları içe / dışa aktar",
        run: () => {
          close();
          setUi({ transferOpen: true });
        },
      },
      {
        id: "reveal",
        label: "Etkin sekmenin klasörünü Dosya Gezgini'nde aç",
        run: () => {
          close();
          const cwd = store().activeSession()?.cwd;
          if (cwd) void api.revealInExplorer(cwd).catch(() => {});
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
        label: `Yeni sekme: ${profile.name}`,
        hint: profile.unavailable ? "bu makinede yok" : profile.shell,
        run: () => {
          close();
          if (profile.unavailable) {
            store().toast(`${profile.name} bu makinede kullanılamıyor`, "err");
            return;
          }
          store().addTab({ profileId: profile.id });
        },
      });
    }

    for (const group of groups) {
      list.push({
        id: `group:${group.id}`,
        label: `Gruba geç: ${group.name}`,
        hint: `${group.tabs.length} sekme`,
        run: () => {
          close();
          store().setActiveGroup(group.id);
        },
      });
      for (const tab of group.tabs) {
        list.push({
          id: `tab:${tab.id}`,
          label: `Sekmeye geç: ${tab.customTitle ?? tab.title ?? tab.cwd ?? tab.id}`,
          hint: group.name,
          run: () => {
            close();
            store().setActiveTab(tab.id);
          },
        });
      }
    }

    return list;
  }, [groups, profiles, keybindings, favorites, setUi]);

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
          placeholder="eylem, grup, sekme veya profil ara…"
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
          {results.length === 0 && <div className="hint">Eşleşen eylem yok.</div>}
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
          <span>↑↓ gez</span>
          <span>Enter uygula</span>
          <span>Esc kapat</span>
        </div>
      </div>
    </div>
  );
}
