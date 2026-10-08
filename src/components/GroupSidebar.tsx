import { useEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { api } from "../lib/ipc";
import {
  groupLabel,
  hasCustomTitle,
  isClaudeCommand,
  resolveProfile,
  shellBadge,
  tabLabel,
  tabSubtitle,
  tabTooltip,
} from "../lib/labels";
import {
  canDeleteGroup,
  dropIndex,
  isLocked,
  lockedTabs,
  nextCollapsedAll,
  visibleGroups,
} from "../lib/tabs";
import { readableAccent } from "../lib/themes";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";
import {
  ChevronIcon,
  ClaudeIcon,
  CollapseAllIcon,
  ExpandAllIcon,
  PlusIcon,
  StarIcon,
} from "./Icons";

/**
 * Seçicideki HAZIR renkler — dört tane.
 *
 * Sekiz hazır renk vardı ve dar kenar çubuğunda ikinci satıra sarıyordu; seçici
 * bir renk kutusu tarlasına dönüşüyordu. Dört, birbirinden açıkça ayrılan bir
 * yelpaze veriyor (mavi / yeşil / amber / mor) ve tek satırda duruyor. Bunların
 * dışındaki her renk özel renk seçicisinden geliyor, yani kısıtlama değil
 * sadeleştirme.
 *
 * `useStore` içindeki AYNI ADLI liste bununla ilgisiz: o yeni grupların
 * rengini sırayla atıyor ve daha geniş olması iyi — iki grup aynı renge daha
 * geç düşüyor.
 */
const GROUP_COLORS = ["#58a6ff", "#3fb950", "#d29922", "#bc8cff"];

type Editing = { kind: "group" | "tab"; id: string } | null;
type DropTarget = { groupId: string; index: number } | null;

export function GroupSidebar() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  const exited = useStore((s) => s.exited);
  const profiles = useStore((s) => s.settings.profiles);
  const defaultProfileId = useStore((s) => s.settings.defaultProfileId);
  const showBadge = useStore((s) => s.settings.appearance.showShellBadge);
  const themeId = useStore((s) => s.settings.appearance.theme);
  const sidebarWidth = useStore((s) => s.settings.appearance.sidebarWidth);
  const onlyFavorites = useStore((s) => s.settings.behavior.showOnlyFavoriteGroups);
  const patchAppearance = useStore((s) => s.patchAppearance);
  const patchBehavior = useStore((s) => s.patchBehavior);
  const keybindings = useStore((s) => s.settings.keybindings);
  const key = (action: string) => prettyCombo(keybindings[action] ?? "");
  const store = useStore.getState;

  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropGroupAt, setDropGroupAt] = useState<number | null>(null);
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

  const shown = visibleGroups(groups, onlyFavorites);
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
    setDragGroupId(null);
    setDropGroupAt(null);
  };

  const applyDrop = () => {
    if (dragTabId && dropTarget) {
      store().moveTabTo(dragTabId, dropTarget.groupId, dropTarget.index);
    } else if (dragGroupId && dropGroupAt !== null) {
      store().moveGroupTo(dragGroupId, dropGroupAt);
    }
    endDrag();
  };

  /**
   * Grup üzerinde grup sürüklenirken: imleç üst yarıdaysa öncesine,
   * alt yarıdaysa sonrasına.
   *
   * Hedef indeks TÜM grup listesine göre hesaplanıyor, ekranda görünen
   * sıraya göre değil: favori süzgeci açıkken liste kısalıyor ve görünen
   * indeksle taşımak grupları yanlış yere koyar.
   */
  const overGroupRow = (event: React.DragEvent, group: Group) => {
    if (!dragGroupId || dragGroupId === group.id) return;
    event.preventDefault();
    event.stopPropagation();
    const index = groups.findIndex((g) => g.id === group.id);
    if (index === -1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropGroupAt(dropIndex(index, after));
  };

  const groupDropMark = (group: Group): "before" | "after" | undefined => {
    if (dropGroupAt === null || dragGroupId === group.id) return undefined;
    const index = groups.findIndex((g) => g.id === group.id);
    if (dropGroupAt === index) return "before";
    if (dropGroupAt === index + 1) return "after";
    return undefined;
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
    {
      kind: "item",
      label: t("common.rename"),
      hint: t("common.doubleClick"),
      run: () => startEditGroup(group),
    },
    {
      kind: "item",
      label: t(group.favorite ? "group.removeFavoriteMenu" : "group.addFavoriteMenu"),
      run: () => store().toggleGroupFavorite(group.id),
    },
    { kind: "item", label: t("group.changeColor"), run: () => setColorFor(group.id) },
    {
      kind: "item",
      label: t("group.settings"),
      run: () => store().setUi({ settingsOpen: true, editingGroupId: group.id }),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: t("group.newTabHere"),
      hint: key("newTab"),
      run: () => store().addTab({ groupId: group.id }),
    },
    {
      kind: "item",
      label: t(group.collapsed ? "group.expand" : "group.collapse"),
      run: () => store().updateGroup(group.id, { collapsed: !group.collapsed }),
    },
    {
      kind: "item",
      label: t(allCollapsed ? "group.expandAll" : "group.collapseAll"),
      run: () => store().toggleAllCollapsed(),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: t("common.moveUp"),
      disabled: index === 0,
      run: () => store().moveGroup(group.id, -1),
    },
    {
      kind: "item",
      label: t("common.moveDown"),
      disabled: index === groups.length - 1,
      run: () => store().moveGroup(group.id, 1),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: canDeleteGroup(group)
        ? t("group.delete")
        : t("group.deleteLockedCount", { n: lockedTabs(group.tabs).length }),
      danger: true,
      disabled: groups.length <= 1 || !canDeleteGroup(group),
      // Onay deponun icinde: her silme yolu ayni soruyu soruyor.
      run: () => void store().deleteGroup(group.id),
    },
  ];

  /**
   * Kenar çubuğunun BOŞ yerine sağ tık.
   *
   * Buraya kadar yeni bir sekme açmanın yolu bir grubun içindeki "+" idi:
   * önce bir grup seçmek, sonra onun satırını bulmak gerekiyordu. Oysa çoğu
   * zaman istenen tek şey "bir sekme daha" — hangi gruba gideceği sorusu
   * kullanıcının değil uygulamanın işi, o yüzden burası soruyu hiç sormuyor ve
   * ETKİN gruba açıyor.
   *
   * Grup ve sekme satırlarının kendi menüleri var; onlar `menu.open` içinde
   * olayı durdurduğu için buraya ulaşmıyor.
   */
  const sidebarMenu = (): MenuEntry[] => [
    {
      // Sekme GRUBA BAĞLI DEĞİL. Etkin gruba eklemek ilk hâliydi ve istenen bu
      // değildi: "her zaman bir grup seçili olduğu için sağ tıklayıp sekme
      // ekle dediğimde seçili gruba ekleniyor". Gruba eklemenin yolu duruyor
      // — grubun kendi "+" düğmesi ve satır menüsü.
      //
      // Etiket bunu ANLATMIYOR, yalnızca "Yeni sekme" diyor: menü kenar
      // çubuğunun boşluğuna ait, yani zaten bir grubun dışındasınız. Parantez
      // içinde açıklama eklemek, gruba ekleyen ötekiyle yan yana durmadığı
      // için karşılıksız bir uyarı olurdu.
      kind: "item",
      label: t("menu.newTab"),
      hint: key("newTab"),
      run: () => store().addLooseTab(),
    },
    {
      kind: "item",
      label: t("menu.newGroup"),
      hint: key("newGroup"),
      run: () => store().addGroup(),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: t(allCollapsed ? "group.expandAll" : "group.collapseAll"),
      disabled: groups.length === 0,
      run: () => store().toggleAllCollapsed(),
    },
    {
      kind: "check",
      label: t("group.favoritesOnly"),
      checked: onlyFavorites,
      run: () => void patchBehavior({ showOnlyFavoriteGroups: !onlyFavorites }),
    },
  ];

  const tabMenu = (group: Group, tab: TabState, index: number): MenuEntry[] => {
    const others = groups.filter((g) => g.id !== group.id);
    return [
      {
        kind: "item",
        label: t("menu.rename"),
        hint: t("common.doubleClick"),
        run: () => startEditTab(tab),
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
        label: t("common.moveUp"),
        disabled: index === 0,
        run: () => store().moveTab(tab.id, -1),
      },
      {
        kind: "item",
        label: t("common.moveDown"),
        disabled: index === group.tabs.length - 1,
        run: () => store().moveTab(tab.id, 1),
      },
      ...(others.length > 0
        ? [
            { kind: "separator" as const },
            {
              // Alt menu: on bes grubu olan kullanicida duz liste menuyu
              // uzatip "Sekmeyi kapat"i ekran disina itiyordu.
              kind: "submenu" as const,
              label: t("menu.moveToGroup"),
              entries: others.map((g) => ({
                kind: "item" as const,
                // Gruplanmamış kovanın kayıtlı adı yok; etiketi çeviriden
                // geliyor. Bu satır aynı zamanda bir sekmeyi gruptan
                // ÇIKARMANIN yolu.
                label: groupLabel(g),
                run: () => store().moveTabToGroup(tab.id, g.id),
              })),
            },
          ]
        : []),
      { kind: "separator" },
      {
        kind: "item",
        label: t(isLocked(tab) ? "menu.closeTabLocked" : "menu.closeTab"),
        danger: true,
        disabled: isLocked(tab),
        run: () => void store().closeTab(tab.id),
      },
    ];
  };

  // --------------------------------------------------------------------- render

  return (
    <aside
      className="sidebar"
      style={{ width: sidebarWidth }}
      onContextMenu={(e) => menu.open(e, sidebarMenu())}
    >
      <div className="sidebar-head">
        <span>{t("group.heading")}</span>
        <span className="sidebar-head-actions">
          <button
            className={onlyFavorites ? "icon-btn on" : "icon-btn"}
            title={
              onlyFavorites
                ? t("group.showAll", { n: groups.length })
                : t("group.showFavoritesOnly", { n: favoriteCount })
            }
            onClick={() => void patchBehavior({ showOnlyFavoriteGroups: !onlyFavorites })}
          >
            <StarIcon filled={onlyFavorites} size={14} />
          </button>
          <button
            className="icon-btn"
            title={t(allCollapsed ? "group.expandAll" : "group.collapseAll")}
            onClick={() => store().toggleAllCollapsed()}
          >
            {allCollapsed ? <ExpandAllIcon /> : <CollapseAllIcon />}
          </button>
          <button
            className="icon-btn"
            title={t("app.newGroupTitle", { keys: key("newGroup") })}
            onClick={() => store().addGroup()}
          >
            <PlusIcon />
          </button>
        </span>
      </div>

      <div className="sidebar-scroll" onDragEnd={endDrag}>
        {onlyFavorites && favoriteCount === 0 && (
          <div className="hint">
            {t("group.noFavorites")}
          </div>
        )}

        {shown.map((group) => {
          const groupIndex = groups.findIndex((g) => g.id === group.id);
          const isActiveGroup = group.id === activeGroupId;
          const groupRunning = group.tabs.some((t) => running[t.id]);
          const color = group.color ?? "#6e7681";
          const isDropGroup = dropTarget?.groupId === group.id;
          /*
           * Gruplanmamış kova: BAŞLIK YOK.
           *
           * Başlık bir grubun kimliği — adı, rengi, yıldızı, katlama oku,
           * sekme sayısı. Kova bir grup değil; "grubu olmayan sekmeler"
           * yazan bir başlık koymak onu yine bir gruba çevirirdi. Düz liste
           * en üstte duruyor, tıpkı bir dosya yöneticisinde köke bırakılmış
           * dosyalar gibi.
           *
           * Katlanamıyor da: katlanmış ve başlıksız bir bölüm ekranda
           * hiçbir iz bırakmaz, yani açmanın yolu kalmazdı.
           */
          const loose = group.ungrouped === true;

          return (
            <section
              className={`group${loose ? " loose" : ""}${isActiveGroup ? " active" : ""}${
                isDropGroup ? " droppable" : ""
              }${dragGroupId === group.id ? " dragging" : ""}`}
              key={group.id}
              style={{ ["--group-color" as string]: color }}
              data-group-drop={groupDropMark(group)}
              onDragOver={(e) => overGroupRow(e, group)}
              onDrop={(e) => {
                if (!dragGroupId) return;
                e.preventDefault();
                e.stopPropagation();
                applyDrop();
              }}
            >
              {!loose && (
              <header
                className="group-row"
                // Adlandırma sırasında sürükleme kapalı: metin seçmek isteyen
                // kullanıcı grubu taşımasın.
                draggable={!(editing?.kind === "group" && editing.id === group.id)}
                onClick={() => store().setActiveGroup(group.id)}
                onDoubleClick={() => startEditGroup(group)}
                onContextMenu={(e) => menu.open(e, groupMenu(group, groupIndex))}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", group.id);
                  setDragGroupId(group.id);
                }}
                onDragOver={(e) => {
                  // Iki sürükleme türü aynı hedefe geliyor: sekme sürükleniyorsa
                  // grubun sonuna ekle, grup sürükleniyorsa sırayı değiştir.
                  if (dragGroupId) overGroupRow(e, group);
                  else overGroup(e, group);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applyDrop();
                }}
              >
                <span className="group-rail" />
                <button
                  className="group-caret"
                  title={t(group.collapsed ? "group.expand" : "group.collapse")}
                  onClick={(e) => {
                    e.stopPropagation();
                    store().updateGroup(group.id, { collapsed: !group.collapsed });
                  }}
                >
                  <ChevronIcon open={!group.collapsed} size={12} />
                </button>

                {editing?.kind === "group" && editing.id === group.id ? (
                  renameInput(t("group.namePlaceholder"))
                ) : (
                  <>
                    {group.favorite && (
                      <span className="group-star" title={t("group.favoriteMark")}>
                        <StarIcon size={11} />
                      </span>
                    )}
                    <span className="group-name">{group.name}</span>
                    {groupRunning && (
                      <span className="tab-dot busy" title={t("group.busy")} />
                    )}
                    <span className="group-count">{group.tabs.length}</span>
                    <span className="group-actions">
                      <button
                        className="icon-btn"
                        title={t(group.favorite ? "group.removeFavorite" : "group.addFavorite")}
                        onClick={(e) => {
                          e.stopPropagation();
                          store().toggleGroupFavorite(group.id);
                        }}
                      >
                        <StarIcon filled={group.favorite} size={12} />
                      </button>
                      <button
                        className="icon-btn"
                        title={t("group.newTabHere")}
                        onClick={(e) => {
                          e.stopPropagation();
                          store().addTab({ groupId: group.id });
                        }}
                      >
                        <PlusIcon size={12} />
                      </button>
                      <button
                        className="icon-btn"
                        title={t("group.menuTitle")}
                        onClick={(e) => menu.open(e, groupMenu(group, groupIndex))}
                      >
                        ⋯
                      </button>
                    </span>
                  </>
                )}
              </header>
              )}

              {/* Renk seçici.
               *
               * ## Seçmek KAPATMIYOR
               *
               * BİLDİRİLEN HATA: bir renge basınca seçici hemen kapanıyordu.
               * Renk seçmek tek hamlelik bir iş değil — kullanıcı birkaç
               * rengi deneyip grubun listedeki hâline bakarak karar veriyor.
               * Kapanan seçici her deneme için menüyü yeniden açmayı
               * gerektiriyordu. Artık seçim ANINDA uygulanıyor (grup rengi
               * canlı değişiyor) ve seçici açık kalıyor; kapatma ayrı bir
               * eylem.
               *
               * ## Kapatma düğmesi kutuların DIŞINDA
               *
               * Kutular dar kenar çubuğunda alt satıra sarıyor. "×" onlarla
               * aynı sarma akışındayken en alta düşüyor ve arandığı yerde
               * bulunmuyordu. Şimdi seçici iki parça: saran kutu ızgarası ve
               * onun sağında, ilk satıra hizalı sabit bir kapatma düğmesi. */}
              {colorFor === group.id && (
                <div className="color-picker">
                  {/* Sıra: temizle → dört hazır renk → (boşluk) → özel renk.
                   *
                   * "Temizle" BAŞTA çünkü "rengi yok" bir renk seçeneği değil,
                   * listenin sıfır noktası — soldan sağa okuyan göz önce onu
                   * geçiyor. Özel renk ise SONDA ve araya nefes payı konuyor
                   * (`.swatch.custom` kenar boşluğu): hazır renkler bir küme,
                   * o ayrı bir kapı. */}
                  <div className="color-swatches">
                    {/* Rengi kaldırmak da bir seçim: burada da kapatmıyor,
                        kullanıcı temizleyip başka bir renk deneyebilir. */}
                    <button
                      className={group.color === null ? "swatch clear on" : "swatch clear"}
                      title={t("group.clearColor")}
                      aria-pressed={group.color === null}
                      onClick={() => store().updateGroup(group.id, { color: null })}
                    />
                    {GROUP_COLORS.map((option) => (
                      <button
                        key={option}
                        className={group.color === option ? "swatch on" : "swatch"}
                        style={{ background: option }}
                        title={option}
                        aria-pressed={group.color === option}
                        onClick={() => store().updateGroup(group.id, { color: option })}
                      />
                    ))}
                    <label className="swatch custom" title={t("group.customColor")}>
                      <input
                        type="color"
                        value={group.color ?? "#58a6ff"}
                        onChange={(e) => store().updateGroup(group.id, { color: e.target.value })}
                      />
                    </label>
                  </div>
                  <button
                    className="icon-btn color-close"
                    title={t("group.colorClose")}
                    onClick={() => setColorFor(null)}
                  >
                    ×
                  </button>
                </div>
              )}

              {(loose || !group.collapsed) && (
                <div className="group-tabs" title={loose ? t("group.looseHint") : undefined}>
                  {group.tabs.map((tab, tabIndex) => {
                    const session = sessions.get(tab.id);
                    const profile = resolveProfile(profiles, tab.profileId, defaultProfileId);
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
                        {/* Claude Code çalışırken rozet ayarı kapalı olsa da
                            çiziliyor: bu kabuğun türü değil, sekmede o an
                            ne çalıştığı. */}
                        {running[tab.id] && isClaudeCommand(tab.lastCommand) ? (
                          <span
                            className="tab-row-badge claude"
                            title={t("tab.claudeRunningTitle")}
                          >
                            <ClaudeIcon />
                          </span>
                        ) : (
                          showBadge && (
                            <span
                              className="tab-row-badge"
                              // Ham profil rengi DEĞİL: koyu bir profil rengi
                              // (Windows PowerShell: #0e4d92) koyu temada
                              // okunmuyordu — gerekçesi `readableAccent` içinde.
                              style={{ color: readableAccent(profile?.color, themeId) }}
                              title={profile?.name}
                            >
                              {shellBadge(profile)}
                            </span>
                          )
                        )}

                        {isEditing ? (
                          renameInput(t("tab.namePlaceholder"))
                        ) : (
                          <span className="tab-row-body">
                            <span className="tab-row-title">
                              {tabLabel(tab)}
                              {hasCustomTitle(tab) && (
                                <span className="tab-pin" title={t("tab.renamed")}>
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
                              title={t("tab.lockedTitle", { keys: key("toggleLock") })}
                            >
                              🔒
                            </span>
                          ) : (
                            <button
                              className="tab-row-close"
                              title={t("menu.closeTab")}
                              onClick={(e) => {
                                e.stopPropagation();
                                void store().closeTab(tab.id);
                              }}
                            >
                              ✕
                            </button>
                          ))}
                        {session?.pid == null && !exited[tab.id] && !running[tab.id] && (
                          <span className="tab-row-idle" title={t("tab.notStarted")} />
                        )}
                      </div>
                    );
                  })}

                  {/* Sekme satırlarıyla karıştırılmaması için bilinçli olarak
                      farklı: rozet kutusu yok, yarım yükseklikte, küçük ve soluk.

                      Sekme sürüklenirken listenin SONU da bu satır: son sekmenin
                      altına taşımak için son satırın alt yarısından başka bir
                      hedef gerekiyor. Eskiden sürükleme başlayınca her grubun
                      sonuna ayrı bir bırakma alanı ekleniyordu; üstteki grupları
                      uzatıp alttaki satırları farenin altından kaydırıyordu.
                      Tutulup yerinde bırakılan sekme başka bir yere düşüyordu ve
                      WebKit (macOS), sürüklenen öğe fare basılan noktadan
                      kaydığı için sürüklemeyi hiç başlatmıyordu. Bu satır hep
                      orada, yani sürükleme düzeni değiştirmiyor. Gösterge son
                      satırın altındaki çizgi ve grubun çerçevesi. */}
                  <button
                    className={group.tabs.length === 0 ? "add-tab prominent" : "add-tab"}
                    title={t("group.newTabHereTitle", { keys: key("newTab") })}
                    onClick={() => store().addTab({ groupId: group.id })}
                    onDragOver={(e) => {
                      if (!dragTabId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTarget({ groupId: group.id, index: group.tabs.length });
                    }}
                    onDrop={(e) => {
                      if (!dragTabId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      applyDrop();
                    }}
                  >
                    <span className="add-tab-plus">+</span>
                    <span>{t("group.addTab")}</span>
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
