import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { shortenPath } from "../lib/format";
import { fitDropLevel, type FitPart } from "../lib/statusFit";
import { localeTag, tp, useLang, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
import { isMac } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import { ContextMenu, type MenuEntry, useContextMenu } from "./ContextMenu";

/** `data-drop` numaralarının en büyüğü. */
const MAX_DROP_LEVEL = 9;

export function StatusBar() {
  const t = useT();
  const lang = useLang();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const profiles = useStore((s) => s.settings.profiles);
  const running = useStore((s) => s.running);
  const paths = useStore((s) => s.paths);
  const restored = useStore((s) => s.restoredSession);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const keybindings = useStore((s) => s.settings.keybindings);
  // Oturum nesnesi React durumunda degil; bu sayac degisince yeniden ciziyoruz.
  useStore((s) => s.statusTick);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];
  const session = tab ? sessions.get(tab.id) : undefined;
  const profile = profiles.find((p) => p.id === tab?.profileId);

  const [historyCount, setHistoryCount] = useState<number | null>(null);

  const menu = useContextMenu();
  const barRef = useRef<HTMLDivElement | null>(null);

  /**
   * Sığdırma.
   *
   * Karar CSS'te değil burada, çünkü çubuğun içeriği duruma göre 200px'den
   * fazla değişiyor ve sabit bir eşik iki ucu birden doğru yapamıyor
   * (gerekçesi `statusFit.ts` içinde).
   *
   * Yöntem: gizlemeyi kaldır, genişlikleri oku, kararı ver, uygula. Üçü de tek
   * bir düzen geçişinde — `useLayoutEffect` boyamadan önce koştuğu için ara
   * durum ekrana yansımıyor.
   *
   * Gizleme `data-out` özniteliğiyle yapılıyor ve bu bilinçli: React bu
   * özniteliği RENDER ETMİYOR, dolayısıyla kendi güncellemelerinde silmiyor.
   * `className`e yazsaydık her yeniden çizim gizlemeyi sıfırlardı.
   */
  const relayout = () => {
    const el = barRef.current;
    if (!el) return;
    const more = el.querySelector<HTMLElement>(".status-more");
    if (!more) return;

    // 1) Ölçüm için hepsi görünür olmalı; gizli öğenin genişliği sıfırdır.
    for (const node of el.querySelectorAll<HTMLElement>("[data-drop]")) {
      delete node.dataset.out;
    }
    more.dataset.in = "";

    const style = window.getComputedStyle(el);
    const gap = Number.parseFloat(style.columnGap) || 0;
    const available =
      el.clientWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0);

    // Hiçbir öğe sıkışmıyor (hepsi `flex: none`), dolayısıyla ölçülen
    // genişlik gereken genişlik. Sıkışabilen tek bir öğe bile olsaydı bu
    // hesap iyimser çıkardı: "sığıyor" derken üç harfe inmiş bir yolu da
    // sığmış sayardı.
    const parts: FitPart[] = [];
    for (const node of Array.from(el.children) as HTMLElement[]) {
      if (node === more || node.classList.contains("spacer")) continue;
      parts.push({
        level: Number(node.dataset.drop ?? 0),
        width: node.getBoundingClientRect().width,
      });
    }

    const level = fitDropLevel({
      parts,
      moreWidth: more.getBoundingClientRect().width,
      gap,
      available,
      maxLevel: MAX_DROP_LEVEL,
    });

    // 2) Kararı uygula.
    for (const node of el.querySelectorAll<HTMLElement>("[data-drop]")) {
      const nodeLevel = Number(node.dataset.drop ?? 0);
      if (nodeLevel > 0 && nodeLevel <= level) node.dataset.out = "";
      else delete node.dataset.out;
    }
    if (level > 0) more.dataset.in = "";
    else delete more.dataset.in;
  };

  // İki ayrı tetikleyici var ve ikisi de gerekli: içerik değişince (yeni sekme,
  // değişen sayaç) her çizimden sonra, çubuğun ölçüsü değişince de gözlemciyle.
  useLayoutEffect(relayout);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // `relayout` her çizimde yeniden tanımlanıyor ama yalnızca ref okuyor,
    // yani ilkini yakalamak güvenli — gözlemciyi her çizimde kurup yıkmamak
    // için bağımlılık listesi kasıtlı olarak boş.
    const observer = new ResizeObserver(() => relayout());
    observer.observe(bar);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Eylemin kisayolu, ipucunda gostermek icin. */
  const key = (action: string) => prettyCombo(keybindings[action] ?? "");

  /**
   * Panel dugmeleri acik/kapali gecisi yapiyor.
   *
   * Ayni kip zaten aciksa kapatiyor; farkli bir kip aciksa ona geciyor.
   * Yalnizca acmak, ikinci tiklamayi ise yaramaz kilardi.
   */
  const togglePanel = (mode: "history" | "favorites") =>
    setUi(
      ui.historyOpen && ui.panelMode === mode
        ? { historyOpen: false }
        : { historyOpen: true, panelMode: mode },
    );

  // Geçmiş sayısı sık değişiyor ama saniyede birkaç kez okumaya değmez.
  useEffect(() => {
    let alive = true;
    const read = () => {
      void api
        .historyStats()
        .then((stats) => {
          if (alive) setHistoryCount(stats.total);
        })
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

  /**
   * "⋯" menüsü — çubuğa sığmayanları tam metinle gösteriyor.
   *
   * Neyin gizli olduğunu DOM'dan OKUYOR, ayrıca hesaplamıyor. Sebep: gizleme
   * kararını CSS veriyor (`@container` eşikleri). Aynı kararı burada bir kez
   * daha kurmak iki listenin zamanla ayrışması demek — eşiği değiştirip menüyü
   * unutmak sessiz bir hata olurdu, menü olmayan bir şeyi gösterirdi.
   *
   * Ölçüm gerekmiyor: `display: none` zaten hesaplanmış durum, tıklama anında
   * okumak yeterli. Bu yüzden ResizeObserver da yok.
   */
  const openMore = (event: React.MouseEvent<HTMLButtonElement>) => {
    const bar = barRef.current;
    if (!bar) return;

    const hidden = new Set<string>();
    for (const el of bar.querySelectorAll<HTMLElement>("[data-status]")) {
      if (window.getComputedStyle(el).display === "none" && el.dataset.status) {
        hidden.add(el.dataset.status);
      }
    }
    const has = (key: string) => hidden.has(key);

    // Sıra çubuktaki okuma sırasıyla aynı; kullanıcı aynı yerde arıyor.
    const entries: MenuEntry[] = [{ kind: "header", label: t("status.moreHeader") }];

    if (has("running")) entries.push({ kind: "info", label: t("status.running") });
    if (has("group") && group) {
      entries.push({ kind: "info", label: t("status.fieldGroup"), value: group.name });
    }
    if (has("profile") && profile) {
      entries.push({ kind: "info", label: t("status.fieldProfile"), value: profile.name });
    }
    if (has("integration") && session) {
      entries.push({
        kind: "info",
        label: t("status.fieldIntegration"),
        value: t(session.integration ? "status.valueIntegrationOn" : "status.valueIntegrationOff"),
      });
    }
    if (has("prediction") && session) {
      entries.push({
        kind: "info",
        label: t("status.fieldPrediction"),
        value: t(
          session.prediction === "unsupported"
            ? "status.valuePredictionUnsupported"
            : session.prediction === "off"
              ? "status.valuePredictionOff"
              : "status.valuePredictionOn",
        ),
      });
    }
    if (has("pid") && session?.pid != null) {
      entries.push({ kind: "info", label: t("status.fieldPid"), value: String(session.pid) });
    }
    if (has("commands") && historyCount !== null) {
      entries.push({
        kind: "info",
        label: t("status.fieldCommands"),
        value: historyCount.toLocaleString(localeTag(lang)),
      });
    }
    if (has("tabs")) {
      entries.push({ kind: "info", label: t("status.fieldTabs"), value: String(totalTabs) });
    }
    if (has("portable") && paths?.portable) {
      entries.push({ kind: "info", label: t("status.portable"), value: shortenPath(paths.root, 2) });
    }
    if (has("restored")) entries.push({ kind: "info", label: t("status.restored") });

    // Yol menüde de TIKLANABİLİR: çubuktaki davranışın aynısı, kaybolduğu için
    // erişilemez hâle gelmemeli. Kısaltma baştan yapılıyor (`…/Works/Şablon`);
    // tam yol menüyü kendi genişliğinin dışına taşırıyordu.
    if (has("cwd") && tab?.cwd) {
      entries.push({
        kind: "item",
        label: t("status.fieldCwd"),
        hint: shortenPath(tab.cwd, 2),
        run: () => void api.revealInExplorer(tab.cwd!).catch(() => {}),
      });
    }

    const rect = event.currentTarget.getBoundingClientRect();
    // Menü çubuğun ÜSTÜNE açılıyor; ContextMenu ekran dışına taşmayı zaten
    // kırpıyor, düğmenin üst kenarını vermek yeterli.
    menu.openAt(rect.left, rect.top - 4, entries);
  };

  /*
   * `data-drop` — çubuk daraldığında neyin önce gideceği.
   *
   * Durum çubuğu pencerenin genişliğini takip etmiyor; kendi genişliği kadar
   * yer var ve o da kenar çubuğu genişledikçe azalıyor. Sığmayan içerik iki
   * kötü sondan birine varıyordu: ya rozet metni iki satıra sarıp komşusunun
   * üstüne biniyordu, ya da `overflow: hidden` sağdaki DÜĞMELERİ kırpıyordu —
   * yani kaybedilen ilk şey çubuğun tek tıklanabilir kısmı oluyordu.
   *
   * Çözüm sırayı elle vermek. Küçük sayı önce gider; numarasız olan hiç
   * gitmez.
   *
   *   1  pid, "oturum geri yüklendi"   — teknik / tek seferlik
   *   2  kayıtlı komut sayısı
   *   3  sekme sayısı
   *   4  profil adı                     — sekmenin üstünde de yazıyor
   *   5  SAĞLIKLI durum rozetleri       — aşağıya bakın
   *   6  grup adı, "taşınabilir"        — grup adı kenar çubuğunda da var
   *   7  çalışma dizini                 — buraya gelmeden zaten kısalmış olur
   *
   * Numarasız kalanlar: "komut çalışıyor", UYARI durumundaki rozetler ve
   * Geçmiş / Favoriler düğmeleri (çubuktaki tek eylem — eski davranışta en
   * sağda oldukları için kırpılan İLK şey onlardı).
   *
   * 5. sıradaki ayrım kasıtlı: rozetin değeri durumuna bağlı. "Komut takibi
   * tam" kullanıcıdan bir şey istemiyor, dolayısıyla dar çubukta yolun yerini
   * almamalı; "sınırlı" ve "desteklenmiyor" ise bir eksiği haber veriyor ve
   * ipucunda çözümü yazıyor, o yüzden kalıyorlar.
   *
   * Kaça kadar gizleneceğini `statusFit.ts` hesaplıyor — sabit bir genişlik
   * eşiği yok, ölçüm var. Sebebi orada yazıyor: çubuğun içeriği duruma göre
   * 200px'den fazla değişiyor ve tek bir eşik iki ucu birden doğru yapamıyor.
   */
  return (
    <>
      <div className="statusbar" ref={barRef}>
        {group && (
          <span className="item" data-drop="6" data-status="group">
            <span className="dot" style={{ background: group.color ?? "#666", width: 7, height: 7, borderRadius: "50%" }} />
            {group.name}
          </span>
        )}

        {profile && (
          <span className="item" data-drop="4" data-status="profile">
            {profile.name}
          </span>
        )}

        {tab?.cwd && (
          <span
            className="item cwd"
            data-drop="7"
            data-status="cwd"
            title={`${tab.cwd}\n${t("status.revealHint")}`}
            style={{ cursor: "pointer" }}
            onClick={() => void api.revealInExplorer(tab.cwd!).catch(() => {})}
          >
            {shortenPath(tab.cwd, 3)}
          </span>
        )}

        <span className="spacer" />

        {tab && running[tab.id] && (
          <span className="pill" data-drop="9" data-status="running">
            {t("status.running")}
          </span>
        )}

        {session &&
          (session.integration ? (
            // Sağlıklı durum çekilebilir (5): kullanıcının yapması gereken bir
            // şey yok, dolayısıyla dar çubukta yolun yerini almamalı.
            <span className="pill ok" data-drop="5" data-status="integration" title={t("status.integrationOnTitle")}>
              {t("status.integrationOn")}
            </span>
          ) : (
            // Uyarı kalır: eksik olan bir şey var ve geçmişin güvenilirliğini
            // etkiliyor.
            <span
              className="pill warn"
              data-drop="8"
              data-status="integration"
              title={t("status.integrationOffTitle")}
            >
              {t("status.integrationOff")}
            </span>
          ))}

        {session && session.prediction !== "unknown" && (
          <span
            className={session.prediction === "unsupported" ? "pill warn" : "pill"}
            // Uyarı durumu en sona kalıyor (8), açık/kapalı bilgisi yolun
            // önüne geçmemeli diye erken gidiyor (5).
            data-drop={session.prediction === "unsupported" ? "8" : "5"}
            data-status="prediction"
            title={
              session.prediction === "unsupported"
                ? // Cozum yolu platforma gore farkli: Windows'ta PSReadLine
                  // guncellemesi, mac'te zsh-autosuggestions kurulumu. Yanlis
                  // platformun tavsiyesini gostermek kullaniciyi bos yere
                  // ugrastirir.
                  t(
                    isMac()
                      ? "status.predictionUnsupportedTitleMac"
                      : "status.predictionUnsupportedTitle",
                  )
                : session.prediction === "off"
                  ? t("status.predictionOffTitle")
                  : t("status.predictionOnTitle", { view: session.prediction })
            }
          >
            {session.prediction === "unsupported"
              ? t("status.predictionUnsupported")
              : session.prediction === "off"
                ? t("status.predictionOff")
                : t("status.predictionOn")}
          </span>
        )}

        {session?.pid != null && (
          <span className="item" data-drop="1" data-status="pid" title={t("status.pidTitle")}>
            pid {session.pid}
          </span>
        )}

        {historyCount !== null && (
          <span className="item" data-drop="2" data-status="commands" title={t("status.commandsTitle")}>
            {tp("status.commands", historyCount, {
              n: historyCount.toLocaleString(localeTag(lang)),
            })}
          </span>
        )}

        <span className="item" data-drop="3" data-status="tabs" title={t("status.tabsTitle")}>
          {tp("status.tabs", totalTabs)}
        </span>

        {paths?.portable && (
          <span className="pill" data-drop="6" data-status="portable" title={t("status.portableTitle", { path: paths.root })}>
            {t("status.portable")}
          </span>
        )}

        {restored && (
          <span className="pill" data-drop="1" data-status="restored" title={t("status.restoredTitle")}>
            {t("status.restored")}
          </span>
        )}

        {/* Sığmayanların kapısı. Yalnızca gerçekten bir şey gizlendiğinde
            görünüyor; kararı yukarıdaki `relayout` veriyor. */}
        <button
          className="status-btn status-more"
          title={t("status.moreTitle")}
          // Erişilebilir ad: düğmenin içeriği "⋯" ve ekran okuyucu onu
          // "yatay üç nokta" diye okuyor — ne işe yaradığı anlaşılmıyor.
          aria-label={t("status.moreTitle")}
          onClick={openMore}
        >
          {"⋯"}
        </button>

        {/* Gecmis ve Favoriler baslik cubugundan buraya indi: ikisi de bir PANEL
            aciyor, bir pencere eylemi degil. Durum cubugu zaten "su an ne var"
            seridi; panel anahtarlarinin yeri burasi. */}
        <button
          className={ui.historyOpen && ui.panelMode === "history" ? "status-btn on" : "status-btn"}
          title={t("app.historyTitle", { keys: key("historyPanel") })}
          aria-pressed={ui.historyOpen && ui.panelMode === "history"}
          onClick={() => togglePanel("history")}
        >
          {t("app.history")}
        </button>
        <button
          className={ui.historyOpen && ui.panelMode === "favorites" ? "status-btn on" : "status-btn"}
          title={t("app.favoritesTitle", { keys: key("favorites") })}
          aria-pressed={ui.historyOpen && ui.panelMode === "favorites"}
          onClick={() => togglePanel("favorites")}
        >
          {"★ "}
          {t("app.favorites")}
        </button>
      </div>

      {/*
        Menü çubuğun DIŞINDA duruyor ve bu zorunlu: sığdırma hesabı çubuğun
        DOĞRUDAN ÇOCUKLARINI ölçüyor. Menü içeride olsaydı o da bir "durum
        öğesi" sayılır, genişliği hesaba katılır ve çubuk kendini gereğinden
        dar sanardı — üstelik yalnızca menü açıkken, yani yakalaması zor bir
        biçimde.
      */}
      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </>
  );
}
