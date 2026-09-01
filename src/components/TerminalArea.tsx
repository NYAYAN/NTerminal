import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../lib/ipc";
import { tSplit, useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { resolveProfile, shellBadge, tabLabel } from "../lib/labels";
import { normalizeViewMode, paneGrid, visibleTabIds } from "../lib/panes";
import { canCloseTab, isLocked } from "../lib/tabs";
import { sessions, useStore } from "../store/useStore";
import { TerminalBlocks } from "./TerminalBlocks";
import type { TerminalSession } from "../terminal/TerminalSession";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";
import { ArrowIcon } from "./Icons";
import { TerminalFind } from "./TerminalFind";

/**
 * Tek bir sekmenin terminal barındırıcısı.
 *
 * xterm bir örnek için `open()` yalnızca bir kez çağrılabildiği için, DOM
 * düğümü sekme yaşadığı sürece yerinde kalıyor. Görünmeyen sekmeler
 * `visibility: hidden` ile saklanıyor ama düzenden çıkarılmıyor: `display:none`
 * yapsak xterm'in ölçüm hesabı sıfırlanır ve sekmeye dönüldüğünde satırlar kayar.
 */
function TerminalHost({
  tabId,
  epoch,
  visible,
  focused,
}: {
  tabId: string;
  epoch: number;
  visible: boolean;
  focused: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const booted = useRef(false);
  const promptAtBottom = useStore((s) => s.settings.behavior.promptAtBottom);
  // Uygulama komut satiri aciksa ayirici cizgiyi KUTU tasiyor (kendi ust
  // kenarligi). Ikisini birden cizmek birbirine yakin iki cizgi demek.
  const appInput = useStore((s) => s.settings.behavior.appInput);

  useEffect(() => {
    booted.current = false;
  }, [epoch]);

  useEffect(() => {
    if (booted.current) return;
    const host = ref.current;
    if (!host) return;
    booted.current = true;

    let cancelled = false;
    void (async () => {
      const store = useStore.getState();
      const session = await store.ensureSession(tabId);
      if (!session || cancelled) return;

      session.attach(host);

      // Önceki oturumun ekran çıktısı: kabuk başlamadan önce yazılıyor ki
      // kullanıcı "kaldığı yeri" doğrudan görsün.
      let restore: string | null = null;
      const tab = store.groups.flatMap((g) => g.tabs).find((t) => t.id === tabId);
      if (tab?.hasScrollback && store.settings.behavior.restoreScrollback) {
        restore = await api.scrollbackLoad(tabId).catch(() => null);
      }
      if (cancelled) return;

      await session.start(restore);
      if (!cancelled) session.setDisplay(visible, focused);
    })();

    return () => {
      cancelled = true;
    };
    // visible/focused bilerek bağımlılık değil: ilk kurulumda kullanılıyor,
    // sonrası aşağıdaki setDisplay efektinden yönetiliyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, epoch]);

  // `data-prompt-bottom`: komut satirinin USTUNDEKI ayirici cizgi yalnizca
  // istem dipte sabitken dogru yerde durur (bkz. global.css .term-host::after).
  // Ayar kapaliyken istem her yerde olabilir; cizgi orada yaniltici olurdu.
  /*
   * Blok katmanı `.term-host`un KARDEŞİ, çocuğu değil.
   *
   * `.term-host` içine xterm kendi DOM'unu koyuyor; oraya bir React çocuğu
   * eklemek iki sahibin aynı düğümü düzenlemesi demek. Saran bir kap ikisini
   * de ayrı tutuyor ve katman kabın koordinatlarına göre konumlanıyor.
   */
  return (
    <div className="term-wrap">
      <div
        className="term-host"
        data-tab-id={tabId}
        data-prompt-bottom={promptAtBottom && !appInput ? "1" : undefined}
        ref={ref}
      />
      <TerminalBlocks tabId={tabId} />
    </div>
  );
}

export function TerminalArea() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const exited = useStore((s) => s.exited);
  const running = useStore((s) => s.running);
  const profiles = useStore((s) => s.settings.profiles);
  const defaultProfileId = useStore((s) => s.settings.defaultProfileId);
  const showBadge = useStore((s) => s.settings.appearance.showShellBadge);
  const scrollAtBottom = useStore((s) => s.scrollAtBottom);
  const findOpen = useStore((s) => s.ui.findOpen);
  const sessionEpoch = useStore((s) => s.sessionEpoch);
  const rightClickAction = useStore((s) => s.settings.behavior.rightClickAction);
  const keys = useStore((s) => s.settings.keybindings);
  const viewMode = normalizeViewMode(useStore((s) => s.settings.appearance.viewMode));

  const t = useT();
  const [mounted, setMounted] = useState<string[]>([]);
  const menu = useContextMenu();

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const activeTabId = activeGroup?.activeTabId ?? activeGroup?.tabs[0]?.id ?? null;

  const liveTabIds = useMemo(
    () => new Set(groups.flatMap((g) => g.tabs.map((t) => t.id))),
    [groups],
  );

  // Bu kipte görünmesi gereken sekmeler. Sekme kipinde bir tane, bölme
  // kipinde grubun tamamı.
  const visibleIds = useMemo(
    () => visibleTabIds(activeGroup, viewMode),
    [activeGroup, viewMode],
  );
  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  // Görünmesi gereken sekmeleri listeye ekle, kapatılanları çıkar. Bir kez
  // bağlanan sekme bağlı kalıyor: geri dönüldüğünde tampon ve kaydırma konumu
  // korunsun.
  useEffect(() => {
    setMounted((prev) => {
      const next = prev.filter((id) => liveTabIds.has(id));
      for (const id of visibleIds) if (!next.includes(id)) next.push(id);
      const same = next.length === prev.length && next.every((id, i) => id === prev[i]);
      return same ? prev : next;
    });
  }, [visibleIds, liveTabIds]);

  /**
   * Çizim sırası.
   *
   * Izgarada hücreler DOM sırasına göre doluyor, `mounted` ise bağlanma
   * sırasında — yani kullanıcının sekmeleri hangi sırada ziyaret ettiğine göre.
   * Bölmeleri o sırayla çizmek onları sekme çubuğundaki sıradan bağımsız,
   * rastgele görünen bir düzene sokuyordu. Etkin grubun sekmeleri kendi
   * sırasında öne, geri kalan (gizli) barındırıcılar arkaya.
   */
  const ordered = useMemo(() => {
    const groupIds = activeGroup ? activeGroup.tabs.map((t) => t.id) : [];
    const inGroup = groupIds.filter((id) => mounted.includes(id));
    const rest = mounted.filter((id) => !groupIds.includes(id));
    return [...inGroup, ...rest];
  }, [mounted, activeGroup]);

  // WebGL bağlamını ve odağı dağıt: görünür olan çizilir, odaklı olan yazılır.
  useEffect(() => {
    for (const [id, session] of sessions) {
      session.setDisplay(visibleSet.has(id), id === activeTabId);
    }
  }, [visibleSet, activeTabId, mounted]);

  const grid = paneGrid(visibleIds.length);
  // Tek sekmede de bolme kipini gosteriyoruz: aksi halde kipi degistiren
  // kullanici hicbir sey olmamis gibi gorup anahtarin bozuk oldugunu sanar.
  const panes = viewMode === "panes" && visibleIds.length > 0;
  const lastVisibleId = visibleIds[visibleIds.length - 1] ?? null;

  /** Sağ tıklanan terminali bul: tıklama hangi barındırıcının içindeyse o. */
  const sessionAt = (target: HTMLElement | null): { id: string; session: TerminalSession } | null => {
    const host = target?.closest<HTMLElement>(".term-host");
    const id = host?.dataset.tabId ?? activeTabId;
    if (!id) return null;
    const session = sessions.get(id);
    return session ? { id, session } : null;
  };

  const copy = (session: TerminalSession) => {
    void session.copySelection().then((ok) => {
      if (ok) session.clearSelection();
      else useStore.getState().toast(t("common.clipboardFailed"), "err");
    });
  };

  const terminalEntries = (id: string, session: TerminalSession): MenuEntry[] => {
    const store = useStore.getState();
    const tab = store.groups.flatMap((g) => g.tabs).find((t) => t.id === id);
    return [
      {
        kind: "item",
        label: t("term.copy"),
        hint: prettyCombo(keys.copy ?? ""),
        disabled: !session.hasSelection(),
        run: () => copy(session),
      },
      {
        kind: "item",
        label: t("term.paste"),
        hint: prettyCombo(keys.paste ?? ""),
        run: () => void session.paste(),
      },
      { kind: "separator" },
      { kind: "item", label: t("term.selectAll"), run: () => session.selectAll() },
      {
        kind: "item",
        label: t("term.clear"),
        hint: prettyCombo(keys.clearTerminal ?? ""),
        run: () => session.clear(),
      },
      {
        kind: "item",
        label: t("term.find"),
        hint: prettyCombo(keys.findInTerminal ?? ""),
        run: () => store.setUi({ findOpen: true }),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: t(viewMode === "panes" ? "term.toTabs" : "term.toPanes"),
        hint: prettyCombo(keys.toggleViewMode ?? ""),
        run: () => void store.toggleViewMode(),
      },
      { kind: "item", label: t("common.restartShell"), run: () => void store.restartTab(id) },
      ...(tab?.cwd
        ? [
            {
              kind: "item" as const,
              label: t("common.revealFolder"),
              run: () => void api.revealInExplorer(tab.cwd!).catch(() => {}),
            },
          ]
        : []),
    ];
  };

  /**
   * Terminalde sağ tık.
   *
   * Eskiden koşulsuz yapıştırıyordu: kullanıcı metin seçip sağ tıkladığında
   * panonun içeriği istem satırına dökülüyordu — kopyalamak isteyen için tam
   * ters sonuç. Artık varsayılan menü; yapıştırmayı isteyen ayardan seçebilir.
   */
  const handleContextMenu = (event: React.MouseEvent) => {
    const found = sessionAt(event.target as HTMLElement | null);
    if (!found) return;
    const { id, session } = found;

    if (rightClickAction === "paste") {
      event.preventDefault();
      void session.paste();
      return;
    }
    if (rightClickAction === "copyPaste") {
      event.preventDefault();
      if (session.hasSelection()) copy(session);
      else void session.paste();
      return;
    }
    menu.open(event, terminalEntries(id, session));
  };

  /*
   * "Hiç sekme yok" kutusu ALANIN İÇİNDE çiziliyor, alanın YERİNE değil.
   *
   * ÖLÇÜLEN HATA: ilk grupta `ng serve` çalışırken yeni bir grup açmak, ilk
   * grubun terminalini boşaltıyordu. Sebep bu daldı: yeni grup bir çizim
   * boyunca sekmesiz kalıyor (sekmeyi `App` bir etkide ekliyor), o çizimde
   * burası erken dönüyor ve `.terminal-area` ağaçtan tümüyle çıkıyordu —
   * yalnızca yeni grubun değil, BAĞLI HER SEKMENİN barındırıcısı yok
   * ediliyordu. Geri geldiklerinde xterm ikinci `open()` çağrısını yok
   * sayıyor ve terminal boş bir kapta duruyordu (gerekçesi
   * `TerminalSession.attach` içinde).
   *
   * Erken dönüş bu yüzden kalktı: kutu bir katman, alan hep yerinde. Bağlı
   * barındırıcılar da yerinde kalıyor — hiçbiri görünür değil (etkin grubun
   * sekmesi yok), yani kutunun altında bir şey görünmüyor.
   */
  const noTabs = !activeGroup || activeGroup.tabs.length === 0;
  // Kısayolun kendisi çeviriden değil ayarlardan geliyor; kullanıcı yeniden
  // atadıysa ipucu da onu göstersin.
  const [hintBefore, hintAfter] = tSplit("term.openHint", "keys");

  return (
    <div
      className="terminal-area"
      data-view={panes ? "panes" : "tabs"}
      style={
        panes
          ? {
              // minmax(0, 1fr): 1fr tek başına içeriğin altına inmiyor, terminal
              // de içerik olarak geniş — bölmeler taşardı.
              gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
            }
          : undefined
      }
      onContextMenu={handleContextMenu}
    >
      {ordered.map((tabId) => {
        const tab = activeGroup?.tabs.find((t) => t.id === tabId);
        const visible = visibleSet.has(tabId);
        const focused = tabId === activeTabId;
        const last = visible && tabId === lastVisibleId;

        return (
          <div
            key={`${tabId}:${sessionEpoch[tabId] ?? 0}`}
            className="pane"
            data-visible={visible}
            data-focused={focused}
            style={panes && last && grid.lastSpan > 1 ? { gridColumn: `span ${grid.lastSpan}` } : undefined}
            onMouseDown={() => {
              // Odak tıklamayı izliyor: bölme kipinde yazdığınız yer etkin
              // sekme olmalı, yoksa durum çubuğu ve geçmiş paneli başka bir
              // sekmeyi gösterir.
              if (tabId !== activeTabId) useStore.getState().setActiveTab(tabId);
            }}
          >
            {tab && (
              <div className="pane-head">
                {showBadge && (
                  <span className="pane-badge">
                    {shellBadge(resolveProfile(profiles, tab.profileId, defaultProfileId))}
                  </span>
                )}
                <span className="pane-title">{tabLabel(tab)}</span>
                {running[tabId] && <span className="tab-dot busy" title={t("pane.running")} />}
                {exited[tabId] && <span className="tab-dot dead" title={t("pane.exited")} />}
                {isLocked(tab) ? (
                  <span className="pane-lock" title={t("pane.locked")}>
                    🔒
                  </span>
                ) : (
                  <button
                    className="pane-close"
                    title={t("term.closeTab")}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canCloseTab(tab)) void useStore.getState().closeTab(tabId);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            <TerminalHost
              tabId={tabId}
              epoch={sessionEpoch[tabId] ?? 0}
              visible={visible}
              focused={focused}
            />

            {/* "En alta in" düğmesi.
             *
             * Geçmişe kaydırıldığında canlı çıktıya dönmenin görünür bir yolu
             * yoktu: `End` tuşunu bilmek ya da elle en dibe kaydırmak
             * gerekiyordu; uzun çıktıda ikincisi gerçek bir iş.
             *
             * Yalnızca GEREKTİĞİNDE çiziliyor. En alttayken düğme hiçbir şey
             * yapmaz ve terminalin üstünde duran kalıcı bir öğe çıktıdan yer
             * çalar. Yokluğu (`undefined`) "en altta" sayılıyor: yeni açılan
             * sekme canlı çıktıya bakıyor. */}
            {visible && scrollAtBottom[tabId] === false && (
              <button
                type="button"
                className="scroll-bottom"
                title={t("term.scrollToBottom")}
                aria-label={t("term.scrollToBottom")}
                onClick={(e) => {
                  e.stopPropagation();
                  sessions.get(tabId)?.scrollToBottom();
                }}
              >
                <ArrowIcon dir="down" size={13} />
              </button>
            )}
          </div>
        );
      })}

      {noTabs && (
        <div className="empty-state">
          <p>{t("term.noTabs")}</p>
          <p>
            {hintBefore}
            <kbd>{prettyCombo(keys.newTab ?? "Ctrl+T")}</kbd>
            {hintAfter}
          </p>
          <button className="primary" onClick={() => useStore.getState().addTab()}>
            {t("term.newTab")}
          </button>
        </div>
      )}

      {findOpen && <TerminalFind />}

      {/* "Kabuk kapandı" kutusu: metin ÜSTTE, düğmeler ALTTA.
       *
       * Üçü yan yanayken kutu dar kalıyor ve cümle kelime kelime alt alta
       * kırılıyordu ("Bu / sekmedeki / kabuk / kapandı."). */}
      {activeTabId && exited[activeTabId] && (
        <div className="term-exited">
          <span className="dim">{t("term.exited")}</span>
          {/* Ne yapılacağını söyleyen satır: kutu artık yalnızca kabuk
              AÇILAMADIĞINDA çıkıyor ve o durumda "yeniden başlat" çoğu zaman
              aynı sonucu verir — asıl çözüm profilde. */}
          <span className="dim">{t("term.exitedHint")}</span>
          <div className="term-exited-actions">
            <button
              className="primary"
              onClick={() => void useStore.getState().restartTab(activeTabId)}
            >
              {t("term.restart")}
            </button>
            <button
              className="outline"
              onClick={() => void useStore.getState().closeTab(activeTabId)}
            >
              {t("term.closeTab")}
            </button>
          </div>
        </div>
      )}

      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </div>
  );
}
