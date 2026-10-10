import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { railTree } from "../lib/design";
import { useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { groupInitials, isClaudeCommand, resolveProfile, tabLabel, tabTooltip } from "../lib/labels";
import { portLabel } from "../lib/serverLinks";
import { isLocked, visibleGroups } from "../lib/tabs";
import { readableAccent } from "../lib/themes";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";
import { GroupColorPicker } from "./GroupColorPicker";
import { groupMenu } from "./groupMenu";
import {
  ArrowIcon,
  BranchIcon,
  ChevronIcon,
  ClaudeIcon,
  ClockIcon,
  CloseIcon,
  GearIcon,
  LayersIcon,
  PlusIcon,
  StarIcon,
  TreeIcon,
} from "./Icons";
import { tabMenu } from "./tabMenu";

/**
 * Rayın yanında açık olan kutu: grubun adı ya da rengi, ağaçtaki sekmenin
 * adı. `id` grubun ya da sekmenin kimliği.
 */
type RailEdit = { kind: "rename" | "color" | "renameTab"; id: string; anchor: HTMLElement } | null;

/** Rayın kendi ipucu: metni ve dayanağın sağ-orta noktası. */
type RailTip = { text: string; left: number; top: number } | null;

/** Ağaçta sürüklenen sekmenin bırakılacağı yer: grup ve o gruptaki sıra. */
type TabDrop = { groupId: string; index: number } | null;

/**
 * Kokpit yerleşiminin grup rayı: her grup bir düğme, baş harfleri ve rengiyle.
 *
 * Kokpit'te kenar çubuğu (`GroupSidebar`) yalnızca ETKİN grubun sekmelerini
 * gösteriyor; gruplar arası geçiş buradan.
 *
 * Favori süzgeci (`showOnlyFavoriteGroups`, Premium ve Klasik'teki ayarın
 * aynısı) rayın kendi düğmesiyle: geniş rayın başlığında, ağaç düğmesinin
 * SOLUNDA bir yıldız. İSTEK: "Favoriye ekli grupları listelemek istediğimde
 * listeleme yapamıyorum." Süzgeç dar rayda da geçerli; orada açıkken
 * başlığın yerinde yalnızca basılı yıldız duruyor — grupların neden eksik
 * olduğu görünsün ve tek tıkla geri gelsin. Geniş rayda favori grupların
 * adının yanında yıldız var: süzgecin neyi bırakacağı önceden görünüyor.
 *
 * Alt kısımda yan panelin üç kipi (geçmiş, favoriler, değişiklikler) ve Ayarlar:
 * Kokpit'te panel terminalin yanında sabit bir sütun ve bu düğmeler onu açıp
 * kapatıyor. Davranış durum çubuğundaki düğmelerle aynı: aynı kip açıksa
 * kapatıyor, başka kip açıksa ona geçiyor.
 *
 * ## Sağ tık
 *
 * İSTEK: "solda gruplar yer alıyor, sağ tıklama ile işlemler yapabilmeliyim".
 * Karoda kenar çubuğundaki grup satırının menüsü açılıyor (liste ortak, bkz.
 * `groupMenu`). Ad ve renk karonun YANINDAKİ küçük kutuda değişiyor: grup
 * değişmiyor ve sekme sütunu kapalıyken de çalışıyor. Gruplanmamış kovanın
 * menüsünde yalnızca "Yeni sekme" var — kova bir grup değil, adı ve rengi yok.
 *
 * Çift tık BİR ŞEY YAPMIYOR. İSTEK: "çift tık yaptığımda grubun adını
 * değiştirme geliyor, gelmesin." Karo bir geçiş düğmesi; hızlı iki tık grubu
 * değiştirmekten başka bir şey yapmamalı. Ad değiştirmenin yolu menü.
 *
 * ## Sürükle-bırak
 *
 * İSTEK: "kokpit yapısında projeleri sürükle bırak ile yer değiştirmek
 * önemli". Karolar sürüklenerek sıralanıyor. Bırakma yeri imlecin karoların
 * ORTALARINA göre yerinden çıkıyor; karonun üstü de aradaki boşluk da aynı
 * yeri veriyor — çizgi boşluğa çiziliyor, bırakmak da orada olabilmeli.
 * Gruplanmamış kova sürüklenmiyor ve hep en üstte kalıyor (bkz.
 * `moveGroupTo`).
 *
 * ## İpucu ve geniş ray
 *
 * İSTEK: "grubun adı tooltip olarak geliyor ama geç görünüyor, hemen görünmesi
 * iyi olacaktır." Tarayıcının `title` ipucu ancak bir saniye kadar sonra
 * çıkıyor ve gecikmesi değiştirilemiyor; karolar yalnızca baş harf gösterdiği
 * için ad bilgisinin TEK kaynağı oydu. Ray kendi ipucunu üzerine gelir gelmez
 * çiziyor; yerel `title` bu yüzden yok (ikisi üst üste çıkardı), adı ekran
 * okuyucuya `aria-label` söylüyor.
 *
 * İSTEK: "bu grubu genişlet daralt da yapabilir miyiz? (bu sayede grup
 * isimlerini tam görme de olmuş olur)". Rayın dibindeki düğme rayı genişletip
 * adları karonun yanına yazıyor; durum ayarda (`railExpanded`), yeniden
 * açılışta da öyle. Genişken ipucu yok: ad zaten yazılı.
 *
 * ## Sekme ağacı
 *
 * İSTEK: "genişlet dersem o zaman bir buton çıksın, bu buton ile sekmeleri
 * grupta göster diyeyim" ve "kişi başka grupları açık yaptıysa açık
 * kalmalı". Geniş rayın başlığında "Gruplar" ve yanında YALNIZCA SİMGE olan
 * bir düğme (İSTEK: "yazı çok yer kaplıyor, tooltip olarak gösterirsin");
 * basınca sekmeler grupların altına diziliyor ve kart sütunu çizilmiyor —
 * aynı sekmeleri iki kez göstermezdi (`railTree`, ayarı `railTabs`).
 *
 * Her grup kendi okuyla açılıp kapanıyor; durum grubun kendisinde
 * (`collapsed`). Etkin grup değişince hiçbir grup kendiliğinden kapanmıyor,
 * yeniden açılışta da aynı. Premium ve Klasik'in kenar çubuğu aynı alanı
 * kullanıyor: orada daraltılan grup burada da kapalı.
 *
 * Sekme satırı kartın işini görüyor: tıklamak sekmeye geçiyor, sağ tık kartın
 * menüsü (`tabMenu`), orta tık kapatıyor, sürükleyince sıra ya da grup
 * değişiyor — bir grubun karosuna ya da "Sekme ekle" satırına bırakılan sekme
 * o grubun sonuna gidiyor. Çift tık karodaki gerekçeyle bir şey yapmıyor; ad
 * sağ tıktan, satırın yanındaki kutuda. Satırın ipucu tarayıcınınki: ad
 * satırda yazılı, ipucu yalnızca ek bilgi (profil, klasör, son komut) ve
 * listede gezinirken anında açılan kutular göz yorardı.
 */
export function GroupRail() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  const exited = useStore((s) => s.exited);
  const profiles = useStore((s) => s.settings.profiles);
  const defaultProfileId = useStore((s) => s.settings.defaultProfileId);
  const themeId = useStore((s) => s.settings.appearance.theme);
  const expanded = useStore((s) => s.settings.appearance.railExpanded);
  const tree = useStore((s) => railTree(s.settings.appearance));
  const onlyFavorites = useStore((s) => s.settings.behavior.showOnlyFavoriteGroups);
  const keybindings = useStore((s) => s.settings.keybindings);
  const historyOpen = useStore((s) => s.ui.historyOpen);
  const panelMode = useStore((s) => s.ui.panelMode);
  const setUi = useStore((s) => s.setUi);
  const store = useStore.getState;
  const key = (action: string) => prettyCombo(keybindings[action] ?? "");

  const menu = useContextMenu();
  const [edit, setEdit] = useState<RailEdit>(null);
  const closeEdit = useCallback(() => setEdit(null), []);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [tabDrop, setTabDrop] = useState<TabDrop>(null);
  const [tip, setTip] = useState<RailTip>(null);
  const groupsRef = useRef<HTMLDivElement | null>(null);

  // Rayda görünen gruplar. Sıralama göstergeleri bu listenin sırasında;
  // depoya giden yer `fullIndex` ile bütün listeye çevriliyor.
  const shown = visibleGroups(groups, onlyFavorites);
  const favoriteCount = groups.filter((g) => g.favorite).length;

  const togglePanel = (mode: "history" | "favorites" | "git") =>
    setUi(
      historyOpen && panelMode === mode
        ? { historyOpen: false }
        : { historyOpen: true, panelMode: mode },
    );
  const panelOn = (mode: string) => historyOpen && panelMode === mode;

  // ------------------------------------------------------------------ ipucu

  /** İpucunu dayanağın sağına, ortasına hizalı açar — beklemeden. */
  const showTip = (anchor: HTMLElement, text: string) => {
    const rect = anchor.getBoundingClientRect();
    setTip({ text, left: rect.right + 10, top: rect.top + rect.height / 2 });
  };
  const hideTip = () => setTip(null);

  /**
   * Bir düğmeye ipucu bağlar: fareyle de klavyeyle de (odak) açılıyor.
   * `when` false ise hiç açılmıyor — geniş rayda ad zaten yazılı.
   */
  const tipProps = (text: string, when = true) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (when) showTip(e.currentTarget, text);
    },
    onMouseLeave: hideTip,
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (when) showTip(e.currentTarget, text);
    },
    onBlur: hideTip,
  });

  const tileMenu = (group: Group, tile: HTMLElement): MenuEntry[] =>
    group.ungrouped
      ? [
          {
            kind: "item",
            label: t("menu.newTab"),
            hint: key("newTab"),
            run: () => void store().addLooseTab(),
          },
        ]
      : groupMenu(group, {
          groups,
          newTabHint: key("newTab"),
          rename: () => setEdit({ kind: "rename", id: group.id, anchor: tile }),
          changeColor: () => setEdit({ kind: "color", id: group.id, anchor: tile }),
          doubleClickRenames: false,
        });

  // ----------------------------------------------------------- sürükle-bırak

  const endDrag = () => {
    setDragGroupId(null);
    setDropAt(null);
    setDragTabId(null);
    setTabDrop(null);
  };

  /**
   * İmlecin bıraktığı yerin sırası: ortası imlecin altında kalan ilk grup.
   * Ağaçta grup karosuyla ve sekmeleriyle TEK parça: ortası bütününün ortası.
   */
  const dropIndexAt = (clientY: number): number => {
    const items = [
      ...(groupsRef.current?.querySelectorAll<HTMLElement>(tree ? ".grail-node" : ".grail-item") ?? []),
    ];
    const below = items.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    const index = below === -1 ? items.length : below;
    // Kovanın önüne bırakılan grup onun arkasına düşüyor; çizgi de orada.
    return shown[0]?.ungrouped && index === 0 ? 1 : index;
  };

  /**
   * Görünen sıradaki yeri BÜTÜN listedeki yere çevirir. Süzgeç açıkken liste
   * kısa; görünen sırayla taşımak grubu gizli grupların arasında yanlış yere
   * koyardı (kenar çubuğundaki aynı gerekçe, `GroupSidebar`).
   */
  const fullIndex = (at: number): number =>
    at < shown.length
      ? groups.indexOf(shown[at])
      : groups.indexOf(shown[shown.length - 1]) + 1;

  // Bırakınca hiçbir şey değişmeyecekse çizgi yok: grubun kendi yerinin iki yanı.
  const from = dragGroupId ? shown.findIndex((g) => g.id === dragGroupId) : -1;
  const dropShown =
    dropAt !== null && from !== -1 && dropAt !== from && dropAt !== from + 1 ? dropAt : null;

  /** Sekmenin hedefini yazar; aynı yerse yeniden çizdirmiyor. */
  const aimTab = (groupId: string, index: number) =>
    setTabDrop((prev) =>
      prev && prev.groupId === groupId && prev.index === index ? prev : { groupId, index },
    );

  /** Sekme satırının üstünde: imleç üst yarıdaysa öncesine, alt yarıdaysa sonrasına. */
  const overTab = (e: React.DragEvent<HTMLElement>, groupId: string, index: number) => {
    if (!dragTabId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    aimTab(groupId, e.clientY > rect.top + rect.height / 2 ? index + 1 : index);
  };

  /** Grubun karosu ya da "Sekme ekle" satırı: sekme o grubun sonuna. */
  const overGroupEnd = (e: React.DragEvent<HTMLElement>, group: Group) => {
    if (!dragTabId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    aimTab(group.id, group.tabs.length);
  };

  // Sekme için de aynısı: kendi yerinin iki yanı hiçbir şey değiştirmiyor.
  const tabFrom = dragTabId
    ? groups
        .map((g) => ({ groupId: g.id, index: g.tabs.findIndex((x) => x.id === dragTabId) }))
        .find((at) => at.index !== -1)
    : undefined;
  const tabDropShown =
    tabDrop &&
    tabFrom &&
    !(
      tabDrop.groupId === tabFrom.groupId &&
      (tabDrop.index === tabFrom.index || tabDrop.index === tabFrom.index + 1)
    )
      ? tabDrop
      : null;

  const dropTab = (e: React.DragEvent) => {
    if (!dragTabId) return;
    e.preventDefault();
    e.stopPropagation();
    if (tabDropShown) store().moveTabTo(dragTabId, tabDropShown.groupId, tabDropShown.index);
    endDrag();
  };

  /** Satırdaki çizgi: hedefin önündeki satırın üstünde, sondaysa son satırın altında. */
  const tabMark = (group: Group, index: number): "before" | "after" | undefined => {
    if (tabDropShown?.groupId !== group.id) return undefined;
    if (tabDropShown.index === index) return "before";
    return tabDropShown.index === group.tabs.length && index === group.tabs.length - 1
      ? "after"
      : undefined;
  };

  const editGroup =
    edit && edit.kind !== "renameTab" ? groups.find((g) => g.id === edit.id) : undefined;
  const editTab =
    edit?.kind === "renameTab"
      ? groups.flatMap((g) => g.tabs).find((x) => x.id === edit.id)
      : undefined;
  const editingTab = (tab: TabState) => edit?.kind === "renameTab" && edit.id === tab.id;

  const newGroupLabel = t("app.newGroupTitle", { keys: key("newGroup") });
  const historyLabel = t("app.historyTitle", { keys: key("historyPanel") });
  const favoritesLabel = t("app.favoritesTitle", { keys: key("favorites") });
  const settingsLabel = t("app.settingsTitle", { keys: key("settings") });
  const toggleLabel = t(expanded ? "rail.hideNames" : "rail.showNames");
  const treeLabel = t(tree ? "rail.hideTabs" : "rail.showTabs");
  const favoriteGroupsLabel = onlyFavorites
    ? t("group.showAll", { n: groups.length })
    : t("group.showFavoritesOnly", { n: favoriteCount });

  /** Favori süzgecinin düğmesi: geniş rayın başlığında, dar rayda süzgeç açıkken. */
  const favoritesButton = (
    <button
      type="button"
      className={onlyFavorites ? "grail-tool grail-favorites on" : "grail-tool grail-favorites"}
      aria-pressed={onlyFavorites}
      aria-label={favoriteGroupsLabel}
      {...tipProps(favoriteGroupsLabel)}
      onClick={() => {
        hideTip();
        void store().patchBehavior({ showOnlyFavoriteGroups: !onlyFavorites });
      }}
    >
      <StarIcon filled={onlyFavorites} size={14} />
    </button>
  );

  /** Ağaçta bir grubun sekmeleri ve dipte "Sekme ekle". */
  const tabList = (group: Group) => (
    <div className="grail-tabs">
      {group.tabs.map((tab, tabIndex) => {
        const active = group.id === activeGroupId && group.activeTabId === tab.id;
        const profile = resolveProfile(profiles, tab.profileId, defaultProfileId);
        return (
          <div
            key={tab.id}
            className={`grail-tab${active ? " on" : ""}${dragTabId === tab.id ? " dragging" : ""}${
              editingTab(tab) ? " editing" : ""
            }`}
            aria-current={active ? "true" : undefined}
            title={tabTooltip(tab, profile, false)}
            data-drop={tabMark(group, tabIndex)}
            draggable={!editingTab(tab)}
            onClick={() => store().setActiveTab(tab.id)}
            onContextMenu={(e) => {
              hideTip();
              const row = e.currentTarget;
              menu.open(
                e,
                tabMenu(group, tab, tabIndex, {
                  groups,
                  rename: () => setEdit({ kind: "renameTab", id: tab.id, anchor: row }),
                  doubleClickRenames: false,
                }),
              );
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              if (!isLocked(tab)) void store().closeTab(tab.id);
            }}
            onDragStart={(e) => {
              hideTip();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", tab.id);
              setDragTabId(tab.id);
            }}
            onDragOver={(e) => overTab(e, group.id, tabIndex)}
            onDrop={dropTab}
          >
            <RailTabState tab={tab} running={!!running[tab.id]} exited={!!exited[tab.id]} />
            <span className="grail-tab-name">{tabLabel(tab)}</span>
            {running[tab.id] && <RailTabPort tab={tab} />}
            {isLocked(tab) ? (
              <span className="grail-tab-lock" title={t("tab.lockedTitle", { keys: key("toggleLock") })}>
                🔒
              </span>
            ) : (
              <button
                type="button"
                className="grail-tab-close"
                aria-label={t("menu.closeTab")}
                onClick={(e) => {
                  e.stopPropagation();
                  void store().closeTab(tab.id);
                }}
              >
                <CloseIcon size={11} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="grail-tab-add"
        onClick={() => {
          if (group.ungrouped) store().addLooseTab();
          else store().addTab({ groupId: group.id });
        }}
        onDragOver={(e) => overGroupEnd(e, group)}
        onDrop={dropTab}
      >
        <PlusIcon size={11} />
        <span>{t("group.addTab")}</span>
      </button>
    </div>
  );

  return (
    <nav className={expanded ? "grail expanded" : "grail"} aria-label={t("group.heading")}>
      {expanded && (
        <div className="grail-head">
          <span className="grail-caption">{t("group.heading")}</span>
          <span className="grail-head-actions">
            {favoritesButton}
            <button
              type="button"
              className={tree ? "grail-tool on" : "grail-tool"}
              aria-pressed={tree}
              aria-label={treeLabel}
              {...tipProps(treeLabel)}
              onClick={() => {
                hideTip();
                // Başlık çubuğunda sekme listesi kapatılmışsa (bkz. `railTree`)
                // düğme onu da açıyor: basınca sekmeler görünmeli.
                void store().patchAppearance(
                  tree ? { railTabs: false } : { railTabs: true, sidebarCollapsed: false },
                );
              }}
            >
              <TreeIcon size={15} />
            </button>
          </span>
        </div>
      )}
      {!expanded && onlyFavorites && <div className="grail-head">{favoritesButton}</div>}
      {expanded && onlyFavorites && favoriteCount === 0 && (
        <p className="grail-empty">{t("group.noFavorites")}</p>
      )}

      <div
        className="grail-groups"
        ref={groupsRef}
        // Liste kayınca ipucu yerinde kalırdı; karosuyla birlikte gitmeli.
        onScroll={hideTip}
        onDragOver={(e) => {
          if (!dragGroupId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const at = dropIndexAt(e.clientY);
          setDropAt((prev) => (prev === at ? prev : at));
        }}
        onDrop={(e) => {
          if (!dragGroupId) return;
          e.preventDefault();
          if (dropShown !== null) store().moveGroupTo(dragGroupId, fullIndex(dropShown));
          endDrag();
        }}
        onDragEnd={endDrag}
      >
        {shown.map((group, index) => {
          const active = group.id === activeGroupId;
          const busy = group.tabs.some((tab) => running[tab.id]);
          const name = group.ungrouped ? t("group.ungrouped") : group.name;
          // Baş harfler grup renginde; koyu bir grup rengi koyu temada metin
          // olarak okunmuyordu (gerekçe `readableAccent` içinde).
          const ink = readableAccent(group.color, themeId);
          // Çizgi bir öğe değil, özniteliğe bağlı sözde öğe: sürüklerken
          // eklenen öğe karoları kaydırırdı (bkz. `GroupSidebar` testi).
          // Ağaçta karonun değil grubun bütününün (karo + sekmeler) üstünde.
          const drop =
            dropShown === index
              ? "before"
              : dropShown === shown.length && index === shown.length - 1
                ? "after"
                : undefined;
          // Sekme bu grubun sonuna gidecek ve sekmeleri görünmüyor: karo halkalı.
          const into =
            tabDropShown?.groupId === group.id && (group.collapsed || group.tabs.length === 0);
          const tile = (
            <button
              key={group.id}
              type="button"
              className={`grail-item${active ? " on" : ""}${
                !tree && dragGroupId === group.id ? " dragging" : ""
              }${editGroup?.id === group.id ? " editing" : ""}`}
              aria-current={active ? "true" : undefined}
              aria-label={name}
              style={{
                ["--group-color" as string]: group.color ?? "var(--accent)",
                ["--group-ink" as string]: ink ?? "var(--accent)",
              }}
              data-drop={tree ? undefined : drop}
              data-into={tree && into ? "" : undefined}
              draggable={!group.ungrouped}
              {...tipProps(name, !expanded)}
              onClick={() => store().setActiveGroup(group.id)}
              onContextMenu={(e) => {
                hideTip();
                menu.open(e, tileMenu(group, e.currentTarget));
              }}
              onDragStart={(e) => {
                hideTip();
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", group.id);
                setDragGroupId(group.id);
              }}
              onDragOver={(e) => overGroupEnd(e, group)}
              onDrop={dropTab}
            >
              <span className="grail-initials">
                {group.ungrouped ? <LayersIcon size={15} /> : groupInitials(group)}
              </span>
              {expanded && <span className="grail-name">{name}</span>}
              {expanded && group.favorite && (
                <span className="grail-fav" title={t("group.favoriteMark")}>
                  <StarIcon size={11} />
                </span>
              )}
              {tree && group.collapsed && <span className="grail-count">{group.tabs.length}</span>}
              {busy && <span className="grail-busy" title={t("group.busy")} />}
            </button>
          );
          if (!tree) return tile;
          return (
            <div
              key={group.id}
              className={dragGroupId === group.id ? "grail-node dragging" : "grail-node"}
              data-drop={drop}
            >
              {tile}
              {/* Karonun kardeşi, içinde değil: düğme içinde düğme olmuyor. */}
              <button
                type="button"
                className="grail-caret"
                aria-expanded={!group.collapsed}
                aria-label={t(group.collapsed ? "group.expand" : "group.collapse")}
                onClick={() => store().updateGroup(group.id, { collapsed: !group.collapsed })}
              >
                <ChevronIcon open={!group.collapsed} size={12} />
              </button>
              {!group.collapsed && tabList(group)}
            </div>
          );
        })}
        <button
          type="button"
          className="grail-add"
          aria-label={newGroupLabel}
          {...tipProps(newGroupLabel, !expanded)}
          onClick={() => store().addGroup()}
        >
          <PlusIcon size={14} />
          {expanded && <span className="grail-name">{t("menu.newGroup")}</span>}
        </button>
      </div>

      <div className="grail-tools">
        <button
          type="button"
          className={panelOn("history") ? "grail-tool on" : "grail-tool"}
          aria-pressed={panelOn("history")}
          aria-label={historyLabel}
          {...tipProps(historyLabel)}
          onClick={() => togglePanel("history")}
        >
          <ClockIcon size={15} />
        </button>
        <button
          type="button"
          className={panelOn("favorites") ? "grail-tool on" : "grail-tool"}
          aria-pressed={panelOn("favorites")}
          aria-label={favoritesLabel}
          {...tipProps(favoritesLabel)}
          onClick={() => togglePanel("favorites")}
        >
          <StarIcon filled={false} size={15} />
        </button>
        <button
          type="button"
          className={panelOn("git") ? "grail-tool on" : "grail-tool"}
          aria-pressed={panelOn("git")}
          aria-label={t("app.changes")}
          {...tipProps(t("app.changes"))}
          onClick={() => togglePanel("git")}
        >
          <BranchIcon size={15} />
        </button>
        <button
          type="button"
          className="grail-tool"
          aria-label={settingsLabel}
          {...tipProps(settingsLabel)}
          onClick={() => setUi({ settingsOpen: true })}
        >
          <GearIcon size={15} />
        </button>
        <button
          type="button"
          className="grail-tool grail-toggle"
          aria-pressed={expanded}
          aria-label={toggleLabel}
          {...tipProps(toggleLabel)}
          onClick={() => {
            hideTip();
            void store().patchAppearance({ railExpanded: !expanded });
          }}
        >
          <ArrowIcon dir="right" size={15} />
        </button>
      </div>

      {tip && (
        <div className="grail-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>
          {tip.text}
        </div>
      )}
      {edit && editGroup && edit.kind === "rename" && (
        <RailRename
          anchor={edit.anchor}
          initial={editGroup.name}
          placeholder={t("group.namePlaceholder")}
          // Boş ad yok sayılıyor, kenar çubuğundaki gibi: grup adsız kalmıyor.
          save={(name) => {
            if (name) store().updateGroup(editGroup.id, { name });
          }}
          onDone={closeEdit}
        />
      )}
      {edit && editTab && (
        <RailRename
          anchor={edit.anchor}
          initial={editTab.customTitle ?? tabLabel(editTab)}
          placeholder={t("tab.namePlaceholder")}
          // Boş = özel adı kaldır; ad yine kabuktan ya da klasörden gelir.
          save={(name) => store().updateTab(editTab.id, { customTitle: name || null })}
          onDone={closeEdit}
        />
      )}
      {edit && editGroup && edit.kind === "color" && (
        <RailPopover anchor={edit.anchor} label={t("group.changeColor")} onDismiss={closeEdit}>
          <GroupColorPicker group={editGroup} onClose={closeEdit} />
        </RailPopover>
      )}
      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </nav>
  );
}

/**
 * Ağaçtaki sekmenin durumu, satırın başında: Claude Code, çalışan komut,
 * kapanmış kabuk ya da henüz açılmamış sekme — kartın göstergeleriyle aynı.
 */
function RailTabState({ tab, running, exited }: { tab: TabState; running: boolean; exited: boolean }) {
  const t = useT();
  if (running && isClaudeCommand(tab.lastCommand)) {
    return (
      <span className="grail-tab-claude" title={t("tab.claudeRunningTitle")}>
        <ClaudeIcon size={12} />
      </span>
    );
  }
  if (running) return <span className="tab-dot busy" />;
  if (exited) return <span className="tab-dot dead" />;
  if (sessions.get(tab.id)?.pid == null) {
    return <span className="tab-row-idle" title={t("tab.notStarted")} />;
  }
  return <span className="tab-dot grail-tab-dot" />;
}

/**
 * Çalışan komutun sunucu portu. Kartla aynı kaynak — OTURUMDAN okunuyor, komut
 * bitince gösterilmiyor (gerekçeler `KokpitLines` ve `RunningLinks` içinde).
 */
function RailTabPort({ tab }: { tab: TabState }) {
  // Yeniden çizim tetikleyicisi; değer oturumdan okunuyor (bkz. RunningLinks).
  useStore((s) => s.runLinks[tab.id]);
  const url = sessions.get(tab.id)?.runUrls()[0];
  if (!url) return null;
  return (
    <span className="grail-tab-port" title={url}>
      {portLabel(url)}
    </span>
  );
}

/**
 * Karonun yanında açılan küçük kutu.
 *
 * Ray 60px; ad kutusu da renk seçici de oraya sığmıyor. Kutu karonun SAĞINDA,
 * ortası karonun ortasına hizalı açılıyor, ekranın altına taşarsa yukarı
 * çekiliyor. Konum `fixed`: grup listesi kendi içinde kayıyor, karonun içine
 * konan bir kutu kaydırma kabında kırpılırdı.
 *
 * `onDismiss` verilirse dışarı tıklamak ve Esc kutuyu kapatıyor (renk seçici).
 * Adlandırmada bunu kutunun kendi odak kaybı ve Esc'si yapıyor.
 */
function RailPopover({
  anchor,
  label,
  onDismiss,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 0;
    const margin = 8;
    setPos({
      left: a.right + 12,
      top: Math.max(
        margin,
        Math.min(a.top + a.height / 2 - height / 2, window.innerHeight - height - margin),
      ),
    });
  }, [anchor]);

  // İçerik büyüyünce (renk kutusunda özel renk seçicisi açılınca) kutu
  // ekranın altına taşmasın: yalnızca gerektiği kadar yukarı kayıyor.
  // Yeniden ortalamak, tıklanan düğmeyi imlecin altından kaydırırdı.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const margin = 8;
      const height = el.offsetHeight;
      setPos((pos) => {
        const top = Math.max(margin, Math.min(pos.top, window.innerHeight - height - margin));
        return top === pos.top ? pos : { ...pos, top };
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!onDismiss) return;
    const down = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", keydown, true);
    };
  }, [onDismiss]);

  return (
    // Esc kutunun: uygulamanın genel Esc'si arkadaki örtüleri kapatmasın.
    <div
      ref={ref}
      className="grail-pop"
      role="dialog"
      aria-label={label}
      data-owns-escape=""
      style={{ left: pos.left, top: pos.top }}
    >
      {children}
    </div>
  );
}

/**
 * Ad kutusu, karonun ya da ağaçtaki sekme satırının yanında. Enter ve odak
 * kaybı kaydediyor, Esc vazgeçiyor. Değişmeyen ad kaydedilmiyor: adı
 * klasörden gelen bir sekmede o ad özel ada dönüşüp sabitlenirdi.
 */
function RailRename({
  anchor,
  initial,
  placeholder,
  save,
  onDone,
}: {
  anchor: HTMLElement;
  initial: string;
  placeholder: string;
  /** Kırpılmış ve `initial`dan FARKLI ad; boş da olabilir. */
  save: (name: string) => void;
  onDone: () => void;
}) {
  const t = useT();
  // Kutu açılırkenki ad: sekmenin klasörden gelen adı kutu açıkken
  // değişse de yazılan metin ve karşılaştırma ilk hâle göre.
  const [start] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement | null>(null);
  // Kutu bir kez kapanıyor: Esc'den ya da Enter'dan sonra sökülen kutunun
  // odak kaybı ikinci kez kaydetmesin (Esc vazgeçmeyi kaydetmeye çevirirdi).
  const finished = useRef(false);

  /*
   * Odak ETKİDE veriliyor, `autoFocus` ile değil: kutu sağ tık menüsünden
   * açılıyor ve menü kapanırken odağı açıldığı yere — karoya — geri veriyor
   * (bkz. `ContextMenu`). `autoFocus` kutuyu bundan ÖNCE odaklıyordu; odak
   * karoya dönünce kutu "odak kaçtı" sayılıp hemen kapanıyordu. React aynı
   * işlemedeki etkilerde önce sökülenleri temizliyor, sonra yenileri kuruyor:
   * bu odak menününkinden SONRA geliyor.
   */
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = (ok: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const name = draft.trim();
    if (ok && name !== start) save(name);
    onDone();
  };

  return (
    <RailPopover anchor={anchor} label={t("common.rename")}>
      <input
        ref={input}
        className="rename-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
      />
    </RailPopover>
  );
}
