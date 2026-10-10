import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { groupInitials } from "../lib/labels";
import { readableAccent } from "../lib/themes";
import { useStore } from "../store/useStore";
import type { Group } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";
import { GroupColorPicker } from "./GroupColorPicker";
import { groupMenu } from "./groupMenu";
import { ArrowIcon, BranchIcon, ClockIcon, GearIcon, LayersIcon, PlusIcon, StarIcon } from "./Icons";

/** Karonun yanında açık olan kutu: grubun adı ya da rengi. */
type RailEdit = { kind: "rename" | "color"; groupId: string; anchor: HTMLElement } | null;

/** Rayın kendi ipucu: metni ve dayanağın sağ-orta noktası. */
type RailTip = { text: string; left: number; top: number } | null;

/**
 * Kokpit yerleşiminin grup rayı: her grup bir düğme, baş harfleri ve rengiyle.
 *
 * Kokpit'te kenar çubuğu (`GroupSidebar`) yalnızca ETKİN grubun sekmelerini
 * gösteriyor; gruplar arası geçiş buradan. Bu yüzden ray bütün grupları
 * gösteriyor — favori süzgeci kenar çubuğunun aracı, burada bir grubu gizlemek
 * ona ulaşmanın tek yolunu kapatırdı.
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
 */
export function GroupRail() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  const themeId = useStore((s) => s.settings.appearance.theme);
  const expanded = useStore((s) => s.settings.appearance.railExpanded);
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
  const [tip, setTip] = useState<RailTip>(null);
  const groupsRef = useRef<HTMLDivElement | null>(null);

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
          rename: () => setEdit({ kind: "rename", groupId: group.id, anchor: tile }),
          changeColor: () => setEdit({ kind: "color", groupId: group.id, anchor: tile }),
          doubleClickRenames: false,
        });

  // ----------------------------------------------------------- sürükle-bırak

  const endDrag = () => {
    setDragGroupId(null);
    setDropAt(null);
  };

  /** İmlecin bıraktığı yerin sırası: ortası imlecin altında kalan ilk karo. */
  const dropIndexAt = (clientY: number): number => {
    const tiles = [...(groupsRef.current?.querySelectorAll<HTMLElement>(".grail-item") ?? [])];
    const below = tiles.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    const index = below === -1 ? tiles.length : below;
    // Kovanın önüne bırakılan grup onun arkasına düşüyor; çizgi de orada.
    return groups[0]?.ungrouped && index === 0 ? 1 : index;
  };

  // Bırakınca hiçbir şey değişmeyecekse çizgi yok: grubun kendi yerinin iki yanı.
  const from = dragGroupId ? groups.findIndex((g) => g.id === dragGroupId) : -1;
  const dropShown =
    dropAt !== null && from !== -1 && dropAt !== from && dropAt !== from + 1 ? dropAt : null;

  const editGroup = edit ? groups.find((g) => g.id === edit.groupId) : undefined;

  const newGroupLabel = t("app.newGroupTitle", { keys: key("newGroup") });
  const historyLabel = t("app.historyTitle", { keys: key("historyPanel") });
  const favoritesLabel = t("app.favoritesTitle", { keys: key("favorites") });
  const settingsLabel = t("app.settingsTitle", { keys: key("settings") });
  const toggleLabel = t(expanded ? "rail.hideNames" : "rail.showNames");

  return (
    <nav className={expanded ? "grail expanded" : "grail"} aria-label={t("group.heading")}>
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
          if (dropAt !== null) store().moveGroupTo(dragGroupId, dropAt);
          endDrag();
        }}
        onDragEnd={endDrag}
      >
        {groups.map((group, index) => {
          const active = group.id === activeGroupId;
          const busy = group.tabs.some((tab) => running[tab.id]);
          const name = group.ungrouped ? t("group.ungrouped") : group.name;
          // Baş harfler grup renginde; koyu bir grup rengi koyu temada metin
          // olarak okunmuyordu (gerekçe `readableAccent` içinde).
          const ink = readableAccent(group.color, themeId);
          // Çizgi bir öğe değil, özniteliğe bağlı sözde öğe: sürüklerken
          // eklenen öğe karoları kaydırırdı (bkz. `GroupSidebar` testi).
          const drop =
            dropShown === index
              ? "before"
              : dropShown === groups.length && index === groups.length - 1
                ? "after"
                : undefined;
          return (
            <button
              key={group.id}
              type="button"
              className={`grail-item${active ? " on" : ""}${
                dragGroupId === group.id ? " dragging" : ""
              }${edit?.groupId === group.id ? " editing" : ""}`}
              aria-current={active ? "true" : undefined}
              aria-label={name}
              style={{
                ["--group-color" as string]: group.color ?? "var(--accent)",
                ["--group-ink" as string]: ink ?? "var(--accent)",
              }}
              data-drop={drop}
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
            >
              <span className="grail-initials">
                {group.ungrouped ? <LayersIcon size={15} /> : groupInitials(group)}
              </span>
              {expanded && <span className="grail-name">{name}</span>}
              {busy && <span className="grail-busy" title={t("group.busy")} />}
            </button>
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
        <RailRename group={editGroup} anchor={edit.anchor} onDone={closeEdit} />
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

/** Grubun adı, karonun yanındaki kutuda. Enter ve odak kaybı kaydediyor, Esc vazgeçiyor. */
function RailRename({
  group,
  anchor,
  onDone,
}: {
  group: Group;
  anchor: HTMLElement;
  onDone: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(group.name);
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

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const name = draft.trim();
    // Boş ad yok sayılıyor, kenar çubuğundaki gibi: grup adsız kalmıyor.
    if (save && name && name !== group.name) useStore.getState().updateGroup(group.id, { name });
    onDone();
  };

  return (
    <RailPopover anchor={anchor} label={t("common.rename")}>
      <input
        ref={input}
        className="rename-input"
        value={draft}
        placeholder={t("group.namePlaceholder")}
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
