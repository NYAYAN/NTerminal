import { useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import { hasCustomTitle, shellBadge, tabLabel, tabTooltip } from "../lib/labels";
import { dropIndex, isLocked } from "../lib/tabs";
import { sessions, useStore } from "../store/useStore";
import type { TabState } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";

export function TabBar() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  const exited = useStore((s) => s.exited);
  const profiles = useStore((s) => s.settings.profiles);
  const renamingTabId = useStore((s) => s.ui.renamingTabId);
  const setUi = useStore((s) => s.setUi);
  const store = useStore.getState;

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
    { kind: "header", label: "Yeni sekme" },
    ...profiles.map((profile) => ({
      kind: "item" as const,
      label: profile.name,
      hint: profile.unavailable ? "yok" : undefined,
      run: () => {
        if (profile.unavailable) {
          store().toast(`${profile.name} bu makinede kullanilamiyor`, "err");
          return;
        }
        store().addTab({ profileId: profile.id });
      },
    })),
    { kind: "separator" },
    { kind: "item", label: "Profilleri duzenle...", run: () => setUi({ settingsOpen: true }) },
  ];

  const entriesFor = (tab: TabState, index: number): MenuEntry[] => {
    const otherGroups = groups.filter((g) => g.id !== group.id);
    return [
      {
        kind: "item",
        label: hasCustomTitle(tab) ? "Adı değiştir…" : "Ad ver…",
        hint: "çift tık",
        run: () => beginRename(tab),
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
        label: "Sola taşı",
        disabled: index === 0,
        run: () => store().moveTab(tab.id, -1),
      },
      {
        kind: "item",
        label: "Sağa taşı",
        disabled: index === group.tabs.length - 1,
        run: () => store().moveTab(tab.id, 1),
      },
      ...(otherGroups.length > 0
        ? [
            { kind: "separator" as const },
            { kind: "header" as const, label: "Gruba taşı" },
            ...otherGroups.map((g) => ({
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
        hint: "Ctrl+W",
        danger: true,
        disabled: isLocked(tab),
        run: () => void store().closeTab(tab.id),
      },
      {
        kind: "item",
        label: "Diğerlerini kapat",
        disabled: group.tabs.length < 2,
        danger: true,
        // Kilitli sekmeler atlanıyor; kaç tanesinin atlandığı bildiriliyor.
        run: () => void store().closeOtherTabs(tab.id),
      },
    ];
  };

  return (
    <div className="tabbar">
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
                  placeholder="sekme adı"
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
                    <span className="tab-pin" title="elle adlandırıldı">
                      ·
                    </span>
                  )}
                </span>
              )}

              {running[tab.id] && <span className="tab-dot busy" title="komut çalışıyor" />}
              {exited[tab.id] && !running[tab.id] && (
                <span className="tab-dot dead" title="kabuk kapandı" />
              )}
              {session?.integration === false && !exited[tab.id] && (
                <span className="tab-dot warn" title="kabuk entegrasyonu yok" />
              )}

              {/* Kilit gostergesi bilincli olarak TIKLANAMAZ.
                  Kapatma dugmesiyle ayni yerde duruyor; tiklanabilir olsa
                  kullanici carpi sanip basiyor, kilit kalkiyor ve ikinci
                  tikta sekme kapaniyordu - tam olarak onlemek istedigimiz
                  kaza. Kilit yalnizca sag tik > Kilit Kapat ya da
                  Ctrl+Shift+L ile kaldirilabilir. */}
              {isLocked(tab) ? (
                <span className="tab-lock" title="Kilitli - sag tik > Kilit Kapat (ya da Ctrl+Shift+L)">
                  🔒
                </span>
              ) : (
                <button
                  className="tab-close"
                  title="Kapat (Ctrl+W)"
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
        <button className="icon-btn" title="Yeni sekme (Ctrl+T)" onClick={() => store().addTab()}>
          +
        </button>
        <button
          className="icon-btn"
          title="Profil secerek yeni sekme"
          onClick={(e) => {
            // Menuyu dugmenin altina konumluyoruz; ContextMenu fixed oldugu
            // icin sekme cubugunun tasma kirpmasindan etkilenmiyor.
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            menu.openAt(rect.right - 8, rect.bottom + 4, profileMenu());
          }}
        >
          &#8964;
        </button>
      </div>

      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </div>
  );
}
