import { useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import { hasCustomTitle, shellBadge, tabLabel, tabTooltip } from "../lib/labels";
import { useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { dropIndex, isLocked } from "../lib/tabs";
import { sessions, useStore } from "../store/useStore";
import type { TabState } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";
import { ChevronIcon, PanesViewIcon, PlusIcon, TabsViewIcon } from "./Icons";

export function TabBar() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  const exited = useStore((s) => s.exited);
  const profiles = useStore((s) => s.settings.profiles);
  const renamingTabId = useStore((s) => s.ui.renamingTabId);
  const viewMode = useStore((s) => s.settings.appearance.viewMode);
  const keybindings = useStore((s) => s.settings.keybindings);
  const setUi = useStore((s) => s.setUi);
  const store = useStore.getState;

  const t = useT();
  const key = (action: string) => prettyCombo(keybindings[action] ?? "");
  const viewShortcut = key("toggleViewMode");

  const [draft, setDraft] = useState("");
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const menu = useContextMenu();
  const stripRef = useRef<HTMLDivElement | null>(null);

  const group = groups.find((g) => g.id === activeGroupId);

  // Etkin sekme görünür kalsın: klavyeyle sekme değiştirirken çubuk kaysın.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(".tab.active");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [group?.activeTabId]);

  if (!group) return <div className="tabbar" />;

  const beginRename = (tab: TabState) => {
    setDraft(tab.customTitle ?? tabLabel(tab));
    setUi({ renamingTabId: tab.id });
  };

  const commitRename = (tabId: string) => {
    const name = draft.trim();
    // Boş bırakmak "özel adı kaldır" anlamına geliyor: başlık yine kabuktan gelir.
    store().updateTab(tabId, { customTitle: name.length > 0 ? name : null });
    setUi({ renamingTabId: null });
  };

  // --------------------------------------------------------- surukle-birak

  const endDrag = () => {
    setDragTabId(null);
    setDropAt(null);
  };

  const applyDrop = () => {
    if (dragTabId && dropAt !== null) {
      store().moveTabTo(dragTabId, group.id, dropAt);
    }
    endDrag();
  };

  /** Yatay serit: imlec sekmenin sol yarisindaysa oncesine, sagindaysa sonrasina. */
  const overTab = (event: React.DragEvent, index: number) => {
    if (!dragTabId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    setDropAt(dropIndex(index, after));
  };

  const profileMenu = (): MenuEntry[] => [
    { kind: "header", label: t("menu.newTab") },
    ...profiles.map((profile) => ({
      kind: "item" as const,
      label: profile.name,
      hint: profile.unavailable ? t("common.missing") : undefined,
      run: () => {
        if (profile.unavailable) {
          store().toast(t("tab.profileUnavailable", { name: profile.name }), "err");
          return;
        }
        store().addTab({ profileId: profile.id });
      },
    })),
    { kind: "separator" },
    { kind: "item", label: t("menu.editProfiles"), run: () => setUi({ settingsOpen: true }) },
  ];

  const entriesFor = (tab: TabState, index: number): MenuEntry[] => {
    const otherGroups = groups.filter((g) => g.id !== group.id);
    return [
      {
        kind: "item",
        label: t(hasCustomTitle(tab) ? "menu.rename" : "menu.giveName"),
        hint: t("common.doubleClick"),
        run: () => beginRename(tab),
      },
      ...(hasCustomTitle(tab)
        ? [
            {
              kind: "item" as const,
              label: t("menu.resetName"),
              run: () => store().updateTab(tab.id, { customTitle: null }),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: t(isLocked(tab) ? "menu.unlock" : "menu.lock"),
        run: () => store().toggleTabLock(tab.id),
      },
      { kind: "separator" },
      { kind: "item", label: t("common.restartShell"), run: () => void store().restartTab(tab.id) },
      ...(tab.cwd
        ? [
            {
              kind: "item" as const,
              label: t("common.revealFolder"),
              run: () => void api.revealInExplorer(tab.cwd!).catch(() => {}),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: t("common.moveLeft"),
        disabled: index === 0,
        run: () => store().moveTab(tab.id, -1),
      },
      {
        kind: "item",
        label: t("common.moveRight"),
        disabled: index === group.tabs.length - 1,
        run: () => store().moveTab(tab.id, 1),
      },
      ...(otherGroups.length > 0
        ? [
            { kind: "separator" as const },
            {
              // Alt menu: on bes grubu olan kullanicida duz liste menuyu
              // uzatip "Sekmeyi kapat"i ekran disina itiyordu.
              kind: "submenu" as const,
              label: t("menu.moveToGroup"),
              entries: otherGroups.map((g) => ({
                kind: "item" as const,
                label: g.name,
                run: () => store().moveTabToGroup(tab.id, g.id),
              })),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: t(isLocked(tab) ? "menu.closeTabLocked" : "menu.closeTab"),
        hint: key("closeTab"),
        danger: true,
        disabled: isLocked(tab),
        run: () => void store().closeTab(tab.id),
      },
      {
        kind: "item",
        label: t("menu.closeOthers"),
        disabled: group.tabs.length < 2,
        danger: true,
        // Kilitli sekmeler atlanıyor; kaç tanesinin atlandığı bildiriliyor.
        run: () => void store().closeOtherTabs(tab.id),
      },
    ];
  };

  return (
    // Etkin grubun rengi sekme cubugunun altindaki cizgiye gidiyor: kenar
    // cubugu kapaliyken de hangi grupta oldugunuz gorunuyor.
    <div className="tabbar" style={{ ["--group-color" as string]: group.color ?? "#6e7681" }}>
      <div className="tabbar-strip" ref={stripRef} onDragEnd={endDrag}>
        {group.tabs.map((tab, index) => {
          const isActive = group.activeTabId === tab.id;
          const session = sessions.get(tab.id);
          const profile = profiles.find((p) => p.id === tab.profileId);
          const accent = profile?.color ?? group.color ?? "#6e7681";
          const isRenaming = renamingTabId === tab.id;

          return (
            <div
              key={tab.id}
              className={`tab${isActive ? " active" : ""}${isRenaming ? " renaming" : ""}${
                dragTabId === tab.id ? " dragging" : ""
              }`}
              style={{ ["--tab-accent" as string]: accent }}
              data-drop={
                dropAt === index ? "before" : dropAt === index + 1 ? "after" : undefined
              }
              title={isRenaming ? undefined : tabTooltip(tab, profile)}
              // Adlandirma sirasinda surukleme kapali: metin secmek isteyen
              // kullanici sekmeyi tasimasin.
              draggable={!isRenaming}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", tab.id);
                setDragTabId(tab.id);
              }}
              onDragOver={(e) => overTab(e, index)}
              onDrop={(e) => {
                e.preventDefault();
                applyDrop();
              }}
              onClick={() => store().setActiveTab(tab.id)}
              onDoubleClick={() => beginRename(tab)}
              onContextMenu={(e) => menu.open(e, entriesFor(tab, index))}
              onAuxClick={(e) => {
                // Orta tuş: sekmeyi kapat (tarayıcı alışkanlığı). Kilitli
                // sekmede hiç denemiyoruz - kilit sessizce korumalı.
                if (e.button === 1) {
                  e.preventDefault();
                  if (!isLocked(tab)) void store().closeTab(tab.id);
                }
              }}
            >
              <span className="tab-badge" title={profile?.name}>
                {shellBadge(profile)}
              </span>

              {isRenaming ? (
                <input
                  className="tab-rename"
                  autoFocus
                  value={draft}
                  placeholder={t("tab.namePlaceholder")}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(tab.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename(tab.id);
                    if (e.key === "Escape") setUi({ renamingTabId: null });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="tab-label">
                  {tabLabel(tab)}
                  {hasCustomTitle(tab) && (
                    <span className="tab-pin" title={t("tab.renamed")}>
                      ·
                    </span>
                  )}
                </span>
              )}

              {running[tab.id] && <span className="tab-dot busy" title={t("tab.running")} />}
              {exited[tab.id] && !running[tab.id] && (
                <span className="tab-dot dead" title={t("tab.exited")} />
              )}
              {session?.integration === false && !exited[tab.id] && (
                <span className="tab-dot warn" title={t("tab.noIntegration")} />
              )}

              {/* Kilit gostergesi bilincli olarak TIKLANAMAZ.
                  Kapatma dugmesiyle ayni yerde duruyor; tiklanabilir olsa
                  kullanici carpi sanip basiyor, kilit kalkiyor ve ikinci
                  tikta sekme kapaniyordu - tam olarak onlemek istedigimiz
                  kaza. Kilit yalnizca sag tik > Kilidi Ac ya da
                  Ctrl+Shift+L ile kaldirilabilir. */}
              {isLocked(tab) ? (
                <span className="tab-lock" title={t("tab.lockedTitle", { keys: key("toggleLock") })}>
                  🔒
                </span>
              ) : (
                <button
                  className="tab-close"
                  title={t("tab.closeTitle", { keys: key("closeTab") })}
                  onClick={(e) => {
                    e.stopPropagation();
                    void store().closeTab(tab.id);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="tabbar-actions">
        <button
          className="icon-btn"
          title={t("tab.newTabTitle", { keys: key("newTab") })}
          onClick={() => store().addTab()}
        >
          <PlusIcon size={13} />
        </button>
        <button
          className="icon-btn"
          title={t("tab.newWithProfile")}
          onClick={(e) => {
            // Menuyu dugmenin altina konumluyoruz; ContextMenu fixed oldugu
            // icin sekme cubugunun tasma kirpmasindan etkilenmiyor.
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            menu.openAt(rect.right - 8, rect.bottom + 4, profileMenu());
          }}
        >
          <ChevronIcon open size={13} />
        </button>

        <span className="tabbar-sep" />

        {/* Görünüm kipi. İki durumlu bir düğme yerine iki ayrı düğme:
            hangisinin etkin olduğu tıklamadan önce görünüyor. */}
        <div className="seg-mini" role="group" aria-label={t("view.label")}>
          <button
            className={viewMode === "tabs" ? "on" : ""}
            title={t("view.tabsTitle", { keys: viewShortcut })}
            aria-pressed={viewMode === "tabs"}
            onClick={() => void store().setViewMode("tabs")}
          >
            <TabsViewIcon size={13} />
          </button>
          <button
            className={viewMode === "panes" ? "on" : ""}
            title={t("view.panesTitle", { keys: viewShortcut })}
            aria-pressed={viewMode === "panes"}
            onClick={() => void store().setViewMode("panes")}
          >
            <PanesViewIcon size={13} />
          </button>
        </div>
      </div>

      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </div>
  );
}
