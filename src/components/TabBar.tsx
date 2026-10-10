import { useEffect, useRef, useState } from "react";

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
import { useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { hiddenCount } from "../lib/tabOverflow";
import { dropIndex, isLocked } from "../lib/tabs";
import { readableAccent } from "../lib/themes";
import { sessions, useStore } from "../store/useStore";
import type { TabState } from "../types";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";
import {
  ArrowIcon,
  ChevronIcon,
  ClaudeIcon,
  PanesViewIcon,
  PlusIcon,
  TabsViewIcon,
} from "./Icons";

export function TabBar() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  const exited = useStore((s) => s.exited);
  const profiles = useStore((s) => s.settings.profiles);
  const defaultProfileId = useStore((s) => s.settings.defaultProfileId);
  const showBadge = useStore((s) => s.settings.appearance.showShellBadge);
  const themeId = useStore((s) => s.settings.appearance.theme);
  const renamingTabId = useStore((s) => s.ui.renamingTabId);
  const viewMode = useStore((s) => s.settings.appearance.viewMode);
  /*
   * Kokpit yerleşiminde sekmeler soldaki sütunda kart olarak duruyor; şerit
   * aynı listeyi ikinci kez çizerdi. Yerine "grup › sekme" yolu geliyor.
   * Sütun kapatılmışsa (başlık çubuğundaki kenar çubuğu düğmesi) sekmelere
   * başka yoldan ulaşılamaz — o zaman şerit geri geliyor.
   */
  const crumb = useStore(
    (s) => s.settings.appearance.design === "kokpit" && !s.settings.appearance.sidebarCollapsed,
  );
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

  /*
   * Adlandırma kutusu sekmenin o anki adıyla açılıyor — adlandırma hangi
   * yoldan başlarsa başlasın.
   *
   * ÖLÇÜLEN HATA: taslağı yalnızca çift tıklama ve sağ tık menüsü
   * dolduruyordu. Kısayol (`App`) ve paletteki karşılığı yalnızca
   * `renamingTabId` yazıyor; kutu bir önceki adlandırmadan kalan metinle
   * açılıyor, odak kaçınca da o metin bu sekmeye yazılıyordu (ilk açılışta
   * metin boş: özel ad siliniyordu). Bkz. `tabRename.test.tsx`.
   *
   * Etkiyle değil çizim sırasında: etki kutuyu önce eski metinle çizip sonra
   * düzeltirdi; burada React bileşeni yeni taslakla hemen yeniden çiziyor,
   * eski metin ekrana hiç çıkmıyor. Yalnızca kimlik DEĞİŞİNCE doluyor:
   * kutu açıkken sekmenin adı (klasörü) değişse de yazılan metin kalıyor.
   */
  const [draftFor, setDraftFor] = useState<string | null>(null);
  if (draftFor !== renamingTabId) {
    setDraftFor(renamingTabId);
    const renamed = group?.tabs.find((tab) => tab.id === renamingTabId);
    if (renamed) setDraft(renamed.customTitle ?? tabLabel(renamed));
  }

  // Etkin sekme görünür kalsın: klavyeyle sekme değiştirirken çubuk kaysın.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(".tab.active");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [group?.activeTabId]);

  /*
   * Şeritte kaç sekme GİZLİ kaldı.
   *
   * BİLDİRİLEN HATA: "çok fazla sekme ekleyince sığmayınca bir ok işaretiyle
   * görünmeyen sekmeleri görüntüleyebilmeliyim."
   *
   * Şerit `overflow-x: auto` ama kaydırma çubuğu bilinçli olarak gizli
   * (global.css `.tabbar-strip`) — dolayısıyla taşan sekmelere yalnızca fare
   * tekerleğiyle ulaşılıyordu ve daha sekme olduğuna dair EKRANDA HİÇBİR
   * İŞARET yoktu. Kullanıcı için o sekmeler yok demekti.
   *
   * Sayı hesapla değil ÖLÇÜMLE bulunuyor: sekme genişliği başlığın uzunluğuna,
   * rozete, kilit simgesine ve yeniden adlandırma kutusuna göre değişiyor;
   * "kaç sekme sığar" formülü ilk uzun başlıkta yanlış cevap verir.
   */
  const [gizliSekme, setGizliSekme] = useState(0);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const olc = () => {
      const kutu = strip.getBoundingClientRect();
      const sekmeler = [...strip.querySelectorAll<HTMLElement>(".tab")].map((el) =>
        el.getBoundingClientRect(),
      );
      // Kural (ve "yarı" eşiğinin gerekçesi) `lib/tabOverflow.ts` içinde.
      const gizli = hiddenCount(kutu, sekmeler);
      setGizliSekme((onceki) => (onceki === gizli ? onceki : gizli));
    };

    olc();
    // Üç ayrı yol da sayıyı değiştiriyor: kaydırma, pencere/şerit ölçüsü,
    // sekme ekleme-çıkarma (aşağıdaki bağımlılık).
    strip.addEventListener("scroll", olc, { passive: true });
    const gozlemci = new ResizeObserver(olc);
    gozlemci.observe(strip);
    for (const el of strip.querySelectorAll<HTMLElement>(".tab")) gozlemci.observe(el);
    return () => {
      strip.removeEventListener("scroll", olc);
      gozlemci.disconnect();
    };
  }, [group?.tabs, group?.activeTabId, renamingTabId, crumb]);

  if (!group) return <div className="tabbar" />;

  // Kutunun metnini yukarıdaki blok dolduruyor (kısayol ve paletle aynı yol).
  const beginRename = (tab: TabState) => setUi({ renamingTabId: tab.id });

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

  /**
   * Şeride sığmayan sekmelere ulaşmanın yolu.
   *
   * Listede GRUBUN TÜMÜ var, yalnızca gizli olanlar değil: "hangileri gizli"
   * kaydırma konumuna bağlı ve kullanıcı menüyü açtığında aradığı sekmenin o
   * an ekranın hangi kenarında olduğunu bilmiyor. Tam liste tek ve
   * öngörülebilir bir cevap veriyor; etkin olan işaretli.
   *
   * Seçim sekmeyi etkinleştiriyor, kaydırma da yukarıdaki etkiyle
   * kendiliğinden geliyor (etkin sekme görünüme çekiliyor).
   */
  const tabListMenu = (): MenuEntry[] => [
    { kind: "header", label: t("tab.allTabs") },
    ...group.tabs.map((tab) => ({
      kind: "check" as const,
      label: tabLabel(tab),
      // Ayırt edici satır ŞART: kabuk başlığı kullanıcı adı olduğu için sekiz
      // sekme de "nurullah.yayan" görünebiliyor. `tabSubtitle` çalışan komutu
      // ya da klasörü veriyor — kenar çubuğunun ikinci satırıyla aynı bilgi.
      hint: tabSubtitle(tab) || undefined,
      checked: tab.id === group.activeTabId,
      run: () => store().setActiveTab(tab.id),
    })),
  ];

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
    {
      kind: "item",
      label: t("menu.editProfiles"),
      // Bölüm ADLANDIRILIYOR: yalnızca `settingsOpen` açmak pencereyi "Genel"de
      // bırakıyordu, oysa öğenin sözü profilleri düzenlemek. Kullanıcı açılan
      // pencerede aradığını bulamayıp kenar çubuğunda arıyordu.
      run: () => setUi({ settingsOpen: true, settingsSection: "profiles" }),
    },
  ];

  const entriesFor = (tab: TabState, index: number): MenuEntry[] => {
    const otherGroups = groups.filter((g) => g.id !== group.id);
    return [
      {
        kind: "item",
        label: t("menu.rename"),
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
      {crumb ? (
        <TabCrumb
          groupName={groupLabel(group)}
          tab={group.tabs.find((tab) => tab.id === group.activeTabId) ?? group.tabs[0]}
          renaming={renamingTabId}
          draft={draft}
          setDraft={setDraft}
          onRename={beginRename}
          onCommit={commitRename}
          onCancel={() => setUi({ renamingTabId: null })}
        />
      ) : (
      <div className="tabbar-strip" ref={stripRef} onDragEnd={endDrag}>
        {group.tabs.map((tab, index) => {
          const isActive = group.activeTabId === tab.id;
          const session = sessions.get(tab.id);
          const profile = resolveProfile(profiles, tab.profileId, defaultProfileId);
          // Rozetin metni ve etkin sekmenin vurgu şeridi bu renkten geliyor;
          // ikisi de okunabilirlik istiyor (bkz. `readableAccent`).
          const accent = readableAccent(profile?.color ?? group.color, themeId) ?? "#6e7681";
          const isRenaming = renamingTabId === tab.id;
          const drop = dropAt === index ? "before" : dropAt === index + 1 ? "after" : undefined;

          return (
            <div
              key={tab.id}
              className={`tab${isActive ? " active" : ""}${isRenaming ? " renaming" : ""}${
                dragTabId === tab.id ? " dragging" : ""
              }`}
              style={{ ["--tab-accent" as string]: accent }}
              data-drop={drop}
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
              {/* Bırakma çizgisi ayrı bir öğe, sözde öğe değil: etkin sekme
                  ::before ve ::after'ı kendisi kullanıyor (gerekçe global.css'te). */}
              {drop && <span className="tab-drop-line" aria-hidden="true" />}
              {/* Rozet ayarından bağımsız; gerekçe GroupSidebar'da. */}
              {running[tab.id] && isClaudeCommand(tab.lastCommand) ? (
                <span className="tab-badge claude" title={t("tab.claudeRunningTitle")}>
                  <ClaudeIcon />
                </span>
              ) : (
                showBadge && (
                  <span className="tab-badge" title={profile?.name}>
                    {shellBadge(profile)}
                  </span>
                )
              )}

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
      )}

      <div className="tabbar-actions">
        {/* Taşma göstergesi.
         *
         * YALNIZCA gerektiğinde çiziliyor: sekmeler sığarken burada kalıcı bir
         * düğme durması, hiçbir şey yapmayan bir denetim demek olurdu.
         *
         * Sayı düğmenin üstünde: "iki sekme daha var" bilgisi düğmeye
         * basmadan önce görünmeli, yoksa kullanıcı menüyü açıp kapatarak
         * öğrenmek zorunda kalıyor. */}
        {!crumb && gizliSekme > 0 && (
          <button
            className="icon-btn tab-overflow"
            title={t("tab.hiddenTabs", { n: String(gizliSekme) })}
            aria-label={t("tab.hiddenTabs", { n: String(gizliSekme) })}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              menu.openAt(rect.right - 8, rect.bottom + 4, tabListMenu());
            }}
          >
            {/* Ok AŞAĞI, sağa değil: gizli sekmeler şeridin İKİ yanında da
                olabiliyor (kaydırma ortadaysa hem solda hem sağda kırpılmış
                sekme var). Sağa bakan bir ok yanlış yön iddia ediyordu; aşağı
                ok "liste aç" demek ve yanındaki sayı kaçının gizli olduğunu
                söylüyor. */}
            <ArrowIcon dir="down" size={12} />
            <span className="tab-overflow-count">{gizliSekme}</span>
          </button>
        )}
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

/**
 * Kokpit'te şeridin yerindeki yol: grubun adı › etkin sekmenin adı.
 *
 * Sekmeyi yeniden adlandırma kısayolu (ve paletteki karşılığı) yalnızca bu
 * çubuktaki kutuyu açıyor; şerit yokken kutu burada, sekmenin adının yerinde
 * açılıyor. Çift tıklama da şeritteki gibi adlandırmayı başlatıyor.
 */
function TabCrumb({
  groupName,
  tab,
  renaming,
  draft,
  setDraft,
  onRename,
  onCommit,
  onCancel,
}: {
  groupName: string;
  tab: TabState | undefined;
  renaming: string | null;
  draft: string;
  setDraft: (value: string) => void;
  onRename: (tab: TabState) => void;
  onCommit: (tabId: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="tabbar-crumb">
      <span className="crumb-dot" aria-hidden="true" />
      <span className="crumb-group">{groupName}</span>
      {tab && (
        <>
          <ChevronIcon open={false} size={11} className="crumb-sep" />
          {renaming === tab.id ? (
            <input
              className="tab-rename"
              autoFocus
              value={draft}
              placeholder={t("tab.namePlaceholder")}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => onCommit(tab.id)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") onCommit(tab.id);
                if (e.key === "Escape") onCancel();
              }}
            />
          ) : (
            <span className="crumb-tab" onDoubleClick={() => onRename(tab)}>
              {tabLabel(tab)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
