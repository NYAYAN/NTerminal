import { useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import { hasCustomTitle, shellBadge, tabLabel, tabSubtitle, tabTooltip } from "../lib/labels";
import {
  canDeleteGroup,
  dropIndex,
  isLocked,
  lockedTabs,
  nextCollapsedAll,
  visibleGroups,
} from "../lib/tabs";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";
import {
  ChevronIcon,
  CollapseAllIcon,
  ExpandAllIcon,
  PlusIcon,
  StarIcon,
} from "./Icons";

const GROUP_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#bc8cff",
  "#39c5cf",
  "#ff7b72",
  "#f778ba",
  "#a371f7",
];

type Editing = { kind: "group" | "tab"; id: string } | null;
type DropTarget = { groupId: string; index: number } | null;

export function GroupSidebar() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  const exited = useStore((s) => s.exited);
  const profiles = useStore((s) => s.settings.profiles);
  const sidebarWidth = useStore((s) => s.settings.appearance.sidebarWidth);
  const onlyFavorites = useStore((s) => s.settings.behavior.showOnlyFavoriteGroups);
  const patchAppearance = useStore((s) => s.patchAppearance);
  const patchBehavior = useStore((s) => s.patchBehavior);
  const store = useStore.getState;

  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const menu = useContextMenu();
  const dragWidth = useRef<{ startX: number; startWidth: number } | null>(null);

  // Kenar çubuğu genişliği sürükleyerek ayarlanıyor; bırakıldığında ayara yazılıyor.
  useEffect(() => {
    const move = (event: MouseEvent) => {
      const drag = dragWidth.current;
      if (!drag) return;
      const next = Math.min(480, Math.max(170, drag.startWidth + (event.clientX - drag.startX)));
      const el = document.querySelector<HTMLElement>(".sidebar");
      if (el) el.style.width = `${next}px`;
    };
    const up = () => {
      const drag = dragWidth.current;
      if (!drag) return;
      dragWidth.current = null;
      const el = document.querySelector<HTMLElement>(".sidebar");
      const final = el ? parseInt(el.style.width || `${sidebarWidth}`, 10) : sidebarWidth;
      if (Number.isFinite(final) && final !== sidebarWidth) {
        void patchAppearance({ sidebarWidth: final });
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [sidebarWidth, patchAppearance]);

  const shown = visibleGroups(groups, onlyFavorites, activeGroupId);
  const favoriteCount = groups.filter((g) => g.favorite).length;
  const allCollapsed = groups.length > 0 && !nextCollapsedAll(groups);

  // -------------------------------------------------------------- adlandırma

  const startEditGroup = (group: Group) => {
    setDraft(group.name);
    setEditing({ kind: "group", id: group.id });
  };

  const startEditTab = (tab: TabState) => {
    setDraft(tab.customTitle ?? tabLabel(tab));
    setEditing({ kind: "tab", id: tab.id });
  };

  const commit = () => {
    if (!editing) return;
    const name = draft.trim();
    if (editing.kind === "group") {
      if (name) store().updateGroup(editing.id, { name });
    } else {
      // Boş = özel adı kaldır; başlık yine kabuktan gelir.
      store().updateTab(editing.id, { customTitle: name || null });
    }
    setEditing(null);
  };

  const renameInput = (placeholder: string) => (
    <input
      className="rename-input"
      autoFocus
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(null);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );

  // ----------------------------------------------------------- sürükle-bırak

  const endDrag = () => {
    setDragTabId(null);
    setDropTarget(null);
  };

  const applyDrop = () => {
    if (dragTabId && dropTarget) {
      store().moveTabTo(dragTabId, dropTarget.groupId, dropTarget.index);
    }
    endDrag();
  };

  /** Sekme satırı üzerinde: imleç üst yarıdaysa öncesine, alt yarıdaysa sonrasına. */
  const overTabRow = (event: React.DragEvent, groupId: string, index: number) => {
    if (!dragTabId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropTarget({ groupId, index: dropIndex(index, after) });
  };

  /** Grup başlığı üzerinde: sekmeyi o grubun sonuna ekle. */
  const overGroup = (event: React.DragEvent, group: Group) => {
    if (!dragTabId) return;
    event.preventDefault();
    setDropTarget({ groupId: group.id, index: group.tabs.length });
  };

  const dropMark = (groupId: string, index: number): "before" | "after" | undefined => {
    if (!dropTarget || dropTarget.groupId !== groupId) return undefined;
    if (dropTarget.index === index) return "before";
    if (dropTarget.index === index + 1) return "after";
    return undefined;
  };

  // ------------------------------------------------------------------ menüler

  const groupMenu = (group: Group, index: number): MenuEntry[] => [
    { kind: "item", label: "Adı değiştir…", hint: "çift tık", run: () => startEditGroup(group) },
    {
      kind: "item",
      label: group.favorite ? "Favori Gruptan Çıkar" : "Favori Gruba Ekle",
      run: () => store().toggleGroupFavorite(group.id),
    },
    { kind: "item", label: "Rengi değiştir", run: () => setColorFor(group.id) },
    {
      kind: "item",
      label: "Grup ayarları…",
      run: () => store().setUi({ settingsOpen: true, editingGroupId: group.id }),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: "Bu gruba yeni sekme",
      hint: "Ctrl+T",
      run: () => store().addTab({ groupId: group.id }),
    },
    {
      kind: "item",
      label: group.collapsed ? "Grubu Aç" : "Grubu Kapat",
      run: () => store().updateGroup(group.id, { collapsed: !group.collapsed }),
    },
    {
      kind: "item",
      label: allCollapsed ? "Tümünü Aç" : "Tümünü Kapat",
      run: () => store().toggleAllCollapsed(),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: "Yukarı taşı",
      disabled: index === 0,
      run: () => store().moveGroup(group.id, -1),
    },
    {
      kind: "item",
      label: "Aşağı taşı",
      disabled: index === groups.length - 1,
      run: () => store().moveGroup(group.id, 1),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: canDeleteGroup(group)
        ? "Grubu sil"
        : `Grubu sil (${lockedTabs(group.tabs).length} kilitli sekme)`,
      danger: true,
      disabled: groups.length <= 1 || !canDeleteGroup(group),
      run: () => {
        if (
          group.tabs.length === 0 ||
          window.confirm(
            `"${group.name}" grubunu ve ${group.tabs.length} sekmesini kapatmak istiyor musunuz?`,
          )
        ) {
          void store().deleteGroup(group.id);
        }
      },
    },
  ];

  const tabMenu = (group: Group, tab: TabState, index: number): MenuEntry[] => {
    const others = groups.filter((g) => g.id !== group.id);
    return [
      {
        kind: "item",
        label: hasCustomTitle(tab) ? "Adı değiştir…" : "Ad ver…",
        hint: "çift tık",
        run: () => startEditTab(tab),
      },
      ...(hasCustomTitle(tab)
        ? [
            {
              kind: "item" as const,
              label: "Adı sıfırla",
              run: () => store().updateTab(tab.id, { customTitle: null }),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: isLocked(tab) ? "Kilit Kapat" : "Kilit Aç",
        run: () => store().toggleTabLock(tab.id),
      },
      { kind: "separator" },
      { kind: "item", label: "Kabuğu yeniden başlat", run: () => void store().restartTab(tab.id) },
      ...(tab.cwd
        ? [
            {
              kind: "item" as const,
              label: "Klasörü Gezgin'de aç",
              run: () => void api.revealInExplorer(tab.cwd!).catch(() => {}),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: "Yukarı taşı",
        disabled: index === 0,
        run: () => store().moveTab(tab.id, -1),
      },
      {
        kind: "item",
        label: "Aşağı taşı",
        disabled: index === group.tabs.length - 1,
        run: () => store().moveTab(tab.id, 1),
      },
      ...(others.length > 0
        ? [
            { kind: "separator" as const },
            { kind: "header" as const, label: "Gruba taşı" },
            ...others.map((g) => ({
              kind: "item" as const,
              label: g.name,
              run: () => store().moveTabToGroup(tab.id, g.id),
            })),
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: isLocked(tab) ? "Sekmeyi kapat (kilitli)" : "Sekmeyi kapat",
        danger: true,
        disabled: isLocked(tab),
        run: () => void store().closeTab(tab.id),
      },
    ];
  };

  // --------------------------------------------------------------------- render

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-head">
        <span>Gruplar</span>
        <span className="sidebar-head-actions">
          <button
            className={onlyFavorites ? "icon-btn on" : "icon-btn"}
            title={
              onlyFavorites
                ? `Tüm grupları göster (${groups.length})`
                : `Yalnızca favori grupları göster (${favoriteCount})`
            }
            onClick={() => void patchBehavior({ showOnlyFavoriteGroups: !onlyFavorites })}
          >
            <StarIcon filled={onlyFavorites} size={14} />
          </button>
          <button
            className="icon-btn"
            title={allCollapsed ? "Tümünü Aç" : "Tümünü Kapat"}
            onClick={() => store().toggleAllCollapsed()}
          >
            {allCollapsed ? <ExpandAllIcon /> : <CollapseAllIcon />}
          </button>
          <button
            className="icon-btn"
            title="Yeni grup (Ctrl+Shift+N)"
            onClick={() => store().addGroup()}
          >
            <PlusIcon />
          </button>
        </span>
      </div>

      <div className="sidebar-scroll" onDragEnd={endDrag}>
        {onlyFavorites && favoriteCount === 0 && (
          <div className="hint">
            {"Favori grup yok.\nBir grubun üzerinde sağ tık → Favori Gruba Ekle."}
          </div>
        )}

        {shown.map((group) => {
          const groupIndex = groups.findIndex((g) => g.id === group.id);
          const isActiveGroup = group.id === activeGroupId;
          const groupRunning = group.tabs.some((t) => running[t.id]);
          const color = group.color ?? "#6e7681";
          const isDropGroup = dropTarget?.groupId === group.id;

          return (
            <section
              className={`group${isActiveGroup ? " active" : ""}${isDropGroup ? " droppable" : ""}`}
              key={group.id}
              style={{ ["--group-color" as string]: color }}
            >
              <header
                className="group-row"
                onClick={() => store().setActiveGroup(group.id)}
                onDoubleClick={() => startEditGroup(group)}
                onContextMenu={(e) => menu.open(e, groupMenu(group, groupIndex))}
                onDragOver={(e) => overGroup(e, group)}
                onDrop={(e) => {
                  e.preventDefault();
                  applyDrop();
                }}
              >
                <span className="group-rail" />
                <button
                  className="group-caret"
                  title={group.collapsed ? "Grubu Aç" : "Grubu Kapat"}
                  onClick={(e) => {
                    e.stopPropagation();
                    store().updateGroup(group.id, { collapsed: !group.collapsed });
                  }}
                >
                  <ChevronIcon open={!group.collapsed} size={12} />
                </button>

                {editing?.kind === "group" && editing.id === group.id ? (
                  renameInput("grup adı")
                ) : (
                  <>
                    {group.favorite && (
                      <span className="group-star" title="favori grup">
                        <StarIcon size={11} />
                      </span>
                    )}
                    <span className="group-name">{group.name}</span>
                    {groupRunning && (
                      <span className="tab-dot busy" title="bu grupta komut çalışıyor" />
                    )}
                    <span className="group-count">{group.tabs.length}</span>
                    <span className="group-actions">
                      <button
                        className="icon-btn"
                        title={group.favorite ? "Favori gruptan çıkar" : "Favori gruba ekle"}
                        onClick={(e) => {
                          e.stopPropagation();
                          store().toggleGroupFavorite(group.id);
                        }}
                      >
                        <StarIcon filled={group.favorite} size={12} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Bu gruba yeni sekme"
                        onClick={(e) => {
                          e.stopPropagation();
                          store().addTab({ groupId: group.id });
                        }}
                      >
                        <PlusIcon size={12} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Grup menüsü"
                        onClick={(e) => menu.open(e, groupMenu(group, groupIndex))}
                      >
                        ⋯
                      </button>
                    </span>
                  </>
                )}
              </header>

              {colorFor === group.id && (
                <div className="color-picker">
                  {GROUP_COLORS.map((option) => (
                    <button
                      key={option}
                      className={group.color === option ? "swatch on" : "swatch"}
                      style={{ background: option }}
                      title={option}
                      onClick={() => {
                        store().updateGroup(group.id, { color: option });
                        setColorFor(null);
                      }}
                    />
                  ))}
                  <button className="icon-btn" title="Kapat" onClick={() => setColorFor(null)}>
                    ×
                  </button>
                </div>
              )}

              {!group.collapsed && (
                <div className="group-tabs">
                  {group.tabs.map((tab, tabIndex) => {
                    const session = sessions.get(tab.id);
                    const profile = profiles.find((p) => p.id === tab.profileId);
                    const isActiveTab = isActiveGroup && group.activeTabId === tab.id;
                    const isEditing = editing?.kind === "tab" && editing.id === tab.id;
                    const subtitle = tabSubtitle(tab);

                    return (
                      <div
                        className={`tab-row${isActiveTab ? " active" : ""}${
                          dragTabId === tab.id ? " dragging" : ""
                        }`}
                        key={tab.id}
                        data-drop={dropMark(group.id, tabIndex)}
                        title={isEditing ? undefined : tabTooltip(tab, profile)}
                        // Adlandırma sırasında sürükleme kapalı: metin seçmek
                        // isteyen kullanıcı sekmeyi taşımasın.
                        draggable={!isEditing}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", tab.id);
                          setDragTabId(tab.id);
                        }}
                        onDragOver={(e) => overTabRow(e, group.id, tabIndex)}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          applyDrop();
                        }}
                        onClick={() => store().setActiveTab(tab.id)}
                        onDoubleClick={() => startEditTab(tab)}
                        onContextMenu={(e) => menu.open(e, tabMenu(group, tab, tabIndex))}
                        onAuxClick={(e) => {
                          if (e.button === 1) {
                            e.preventDefault();
                            if (!isLocked(tab)) void store().closeTab(tab.id);
                          }
                        }}
                      >
                        <span
                          className="tab-row-badge"
                          style={{ color: profile?.color ?? undefined }}
                          title={profile?.name}
                        >
                          {shellBadge(profile)}
                        </span>

                        {isEditing ? (
                          renameInput("sekme adı")
                        ) : (
                          <span className="tab-row-body">
                            <span className="tab-row-title">
                              {tabLabel(tab)}
                              {hasCustomTitle(tab) && (
                                <span className="tab-pin" title="elle adlandırıldı">
                                  ·
                                </span>
                              )}
                            </span>
                            {subtitle && <span className="tab-row-sub">{subtitle}</span>}
                          </span>
                        )}

                        {running[tab.id] && <span className="tab-dot busy" />}
                        {exited[tab.id] && !running[tab.id] && <span className="tab-dot dead" />}
                        {/* Tıklanamaz gösterge - bkz. TabBar'daki açıklama. */}
                        {!isEditing &&
                          (isLocked(tab) ? (
                            <span
                              className="tab-row-lock"
                              title="Kilitli - sag tik > Kilit Kapat (ya da Ctrl+Shift+L)"
                            >
                              🔒
                            </span>
                          ) : (
                            <button
                              className="tab-row-close"
                              title="Sekmeyi kapat"
                              onClick={(e) => {
                                e.stopPropagation();
                                void store().closeTab(tab.id);
                              }}
                            >
                              ✕
                            </button>
                          ))}
                        {session?.pid == null && !exited[tab.id] && !running[tab.id] && (
                          <span className="tab-row-idle" title="henüz açılmadı" />
                        )}
                      </div>
                    );
                  })}

                  {/* Listenin sonuna bırakma hedefi: son sekmenin ALTINA taşımak
                      için ayrı bir alan gerekiyor, yoksa son satırın alt yarısı
                      dışında hedef kalmıyor. */}
                  {dragTabId && (
                    <div
                      className={`drop-tail${
                        dropTarget?.groupId === group.id && dropTarget.index >= group.tabs.length
                          ? " on"
                          : ""
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDropTarget({ groupId: group.id, index: group.tabs.length });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        applyDrop();
                      }}
                    />
                  )}

                  {/* Sekme satırlarıyla karıştırılmaması için bilinçli olarak
                      farklı: rozet kutusu yok, yarım yükseklikte, küçük ve soluk. */}
                  <button
                    className={group.tabs.length === 0 ? "add-tab prominent" : "add-tab"}
                    title="Bu gruba yeni sekme (Ctrl+T)"
                    onClick={() => store().addTab({ groupId: group.id })}
                  >
                    <span className="add-tab-plus">+</span>
                    <span>sekme ekle</span>
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div
        className="sidebar-resize"
        onMouseDown={(e) => {
          dragWidth.current = { startX: e.clientX, startWidth: sidebarWidth };
          e.preventDefault();
        }}
      />

      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </aside>
  );
}
