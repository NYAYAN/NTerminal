import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { shortenPath } from "../lib/format";
import { fitDropLevel, type FitPart } from "../lib/statusFit";
import { localeTag, tp, useLang, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
import { groupLabel, resolveProfile } from "../lib/labels";
import { isMac } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import { ContextMenu, type MenuEntry, useContextMenu } from "./ContextMenu";

/** `data-drop` numaralarının en büyüğü. */
const MAX_DROP_LEVEL = 3;

/**
 * Durum çubuğu.
 *
 * ## Çubukta ne var, menüde ne var
 *
 * Çubuk yalnızca KİMLİK taşıyor: hangi grup, hangi profil, hangi klasör.
 * Okumalar — komut çalışıyor mu, komut takibi tam mı, geçmişten tamamlama
 * açık mı, pid, kayıtlı komut ve sekme sayısı — "⋯" menüsünde.
 *
 * Ayrım önceden YER darlığına göreydi: hepsi çubuktaydı, sığmayan menüye
 * düşüyordu. Sonuç, pencerenin genişliğine göre değişen bir şeritti; her
 * açılışta aynı yerde aynı şeyi bulmak mümkün değildi ve çubuğun yarısı hiç
 * değişmeyen üç rozetle doluydu ("Komut takibi tam" bir kez okunacak bir şey,
 * sürekli değil).
 *
 * Bugün ayrım İŞLEVE göre: kimlik görünür, okuma bir tık uzakta. Hiçbir bilgi
 * kaybolmadı ve rozetlerin ipuçları da menüye taşındı (bkz. `ContextMenu`
 * içindeki `info` girdisinin `title` alanı) — "Sınırlı" tek başına ne
 * yapılacağını söylemiyor, ipucu sebebi ve çözümü yazıyor.
 *
 * Kimlik alanı yine de sığmayabiliyor (grup adını kullanıcı koyuyor, yol uzun
 * olabiliyor); sığmayanlar aynı menünün altına, ayrı bir bölüme düşüyor.
 */
export function StatusBar() {
  const t = useT();
  const lang = useLang();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const profiles = useStore((s) => s.settings.profiles);
  const defaultProfileId = useStore((s) => s.settings.defaultProfileId);
  const running = useStore((s) => s.running);
  const paths = useStore((s) => s.paths);
  const restored = useStore((s) => s.restoredSession);
  /*
   * `ui`nin tamamina degil iki alana abone oluyoruz.
   *
   * Durum cubugu `ui`den yalnizca bunlari okuyor. Tamamina abone olmak, her
   * `setUi` yeni bir nesne urettigi icin cubugu her arayuz durumu
   * degisiminde — yazarken her tus vurusunda guncellenen `ui.suggest` dahil —
   * yeniden cizdiriyordu. Cubuk ayrica sigdirma hesabi kosuyor
   * (`ResizeObserver` + `statusFit`), yani bos cizim burada iki kat pahali.
   */
  const historyOpen = useStore((s) => s.ui.historyOpen);
  const panelMode = useStore((s) => s.ui.panelMode);
  const setUi = useStore((s) => s.setUi);
  const keybindings = useStore((s) => s.settings.keybindings);
  const update = useStore((s) => s.update);
  // Oturum nesnesi React durumunda degil; bu sayac degisince yeniden ciziyoruz.
  useStore((s) => s.statusTick);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];
  const session = tab ? sessions.get(tab.id) : undefined;
  const profile = resolveProfile(profiles, tab?.profileId, defaultProfileId);

  const [historyCount, setHistoryCount] = useState<number | null>(null);

  const menu = useContextMenu();
  const barRef = useRef<HTMLDivElement | null>(null);

  /**
   * Sığdırma.
   *
   * Karar CSS'te değil burada, çünkü çubukta kalan üç öğenin ikisini KULLANICI
   * adlandırıyor (grup adı, profil adı) ve üçüncüsü bulunulan dizin; sabit bir
   * genişlik eşiği bu üçlüyü iki uçta birden doğru yapamıyor (gerekçesi
   * `statusFit.ts` içinde).
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
      historyOpen && panelMode === mode
        ? { historyOpen: false }
        : { historyOpen: true, panelMode: mode },
    );

  // Geçmiş sayısı sık değişiyor ama saniyede birkaç kez okumaya değmez.
  useEffect(() => {
    let alive = true;
    const read = () => {
      // Pencere gizliyken (kucultulmus, baska masaustu) sayaci kimse gormuyor;
      // her bes saniyede bir IPC + JSON uretmenin karsiligi yok. Geri
      // donuldugunde `visibilitychange` hemen okuyor.
      if (document.hidden) return;
      void api
        .historyStats()
        .then((stats) => {
          if (alive) setHistoryCount(stats.total);
        })
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, 5000);
    document.addEventListener("visibilitychange", read);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

  /**
   * "⋯" menüsü — bütün durum okumaları.
   *
   * İki bölüm var. ÜSTTE her zaman duranlar: çubuktan bilinçli olarak
   * çıkarılmış okumalar, yani menü onların tek yeri. ALTTA yalnızca çubuğa
   * sığmadığı için düşenler — orada olup olmadıkları DOM'dan OKUNUYOR,
   * ayrıca hesaplanmıyor: gizleme kararını `relayout` veriyor ve aynı kararı
   * burada ikinci kez kurmak iki listenin zamanla ayrışması demek olurdu.
   */
  const openMore = (event: React.MouseEvent<HTMLButtonElement>) => {
    const bar = barRef.current;

    const hidden = new Set<string>();
    for (const el of bar?.querySelectorAll<HTMLElement>("[data-status]") ?? []) {
      if (window.getComputedStyle(el).display === "none" && el.dataset.status) {
        hidden.add(el.dataset.status);
      }
    }

    const entries: MenuEntry[] = [{ kind: "header", label: t("status.moreHeader") }];

    // Sıra kullanıcının okuma sırası: önce "şu an ne oluyor", sonra sabitler.
    if (tab && running[tab.id]) entries.push({ kind: "info", label: t("status.running") });

    if (session) {
      entries.push({
        kind: "info",
        label: t("status.fieldIntegration"),
        value: t(session.integration ? "status.valueIntegrationOn" : "status.valueIntegrationOff"),
        title: t(session.integration ? "status.integrationOnTitle" : "status.integrationOffTitle"),
      });
    }

    if (session && session.prediction !== "unknown") {
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
        title:
          session.prediction === "unsupported"
            ? // Cozum yolu platforma gore farkli: Windows'ta PSReadLine
              // guncellemesi, mac'te eklentinin yuklenememesi. Yanlis
              // platformun tavsiyesini gostermek kullaniciyi bos yere
              // ugrastirir.
              t(
                isMac()
                  ? "status.predictionUnsupportedTitleMac"
                  : "status.predictionUnsupportedTitle",
              )
            : session.prediction === "off"
              ? t("status.predictionOffTitle")
              : t("status.predictionOnTitle", { view: session.prediction }),
      });
    }

    if (session?.pid != null) {
      entries.push({ kind: "info", label: t("status.fieldPid"), value: String(session.pid) });
    }
    // Bu ikisi TEK SATIR: "Kayıtlı komut | 8" aynı şeyi iki sütuna bölüyordu.
    if (historyCount !== null) {
      entries.push({
        kind: "info",
        label: tp("status.commands", historyCount, {
          n: historyCount.toLocaleString(localeTag(lang)),
        }),
      });
    }
    entries.push({ kind: "info", label: tp("status.tabs", totalTabs) });

    if (paths?.portable) {
      entries.push({
        kind: "info",
        label: t("status.portable"),
        value: shortenPath(paths.root, 2),
        title: t("status.portableTitle", { path: paths.root }),
      });
    }
    if (restored) {
      entries.push({
        kind: "info",
        label: t("status.restored"),
        title: t("status.restoredTitle"),
      });
    }

    // Çubuktan sığmadığı için düşenler — ayrı bir bölümde, çünkü burada
    // olmaları pencerenin genişliğine bağlı.
    const overflow: MenuEntry[] = [];
    if (hidden.has("group") && group) {
      overflow.push({ kind: "info", label: t("status.fieldGroup"), value: groupLabel(group) });
    }
    if (hidden.has("profile") && profile) {
      overflow.push({ kind: "info", label: t("status.fieldProfile"), value: profile.name });
    }
    // Yol menüde de TIKLANABİLİR: çubuktaki davranışın aynısı, kaybolduğu için
    // erişilemez hâle gelmemeli. Kısaltma baştan yapılıyor (`…/Works/Şablon`);
    // tam yol menüyü kendi genişliğinin dışına taşırıyordu.
    if (hidden.has("cwd") && tab?.cwd) {
      overflow.push({
        kind: "item",
        label: t("status.fieldCwd"),
        hint: shortenPath(tab.cwd, 2),
        run: () => void api.revealInExplorer(tab.cwd!).catch(() => {}),
      });
    }
    if (overflow.length > 0) entries.push({ kind: "separator" }, ...overflow);

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
   * kötü sondan birine varıyordu: ya metin iki satıra sarıp komşusunun üstüne
   * biniyordu, ya da `overflow: hidden` sağdaki DÜĞMELERİ kırpıyordu — yani
   * kaybedilen ilk şey çubuğun tek tıklanabilir kısmı oluyordu.
   *
   * Çözüm sırayı elle vermek. Küçük sayı önce gider; numarasız olan hiç
   * gitmez.
   *
   *   1  profil adı        — sekmenin üstünde de yazıyor
   *   2  grup adı          — kenar çubuğunda da yazıyor
   *   3  çalışma dizini    — buraya gelmeden zaten kısalmış olur
   *
   * Numarasız kalanlar üç düğme: "⋯", Geçmiş ve Favoriler. Çubuktaki tek
   * eylemler onlar; eski davranışta en sağda oldukları için kırpılan İLK şey
   * oluyorlardı.
   *
   * Kaça kadar gizleneceğini `statusFit.ts` hesaplıyor — sabit bir genişlik
   * eşiği yok, ölçüm var.
   */
  return (
    <>
      <div className="statusbar" ref={barRef}>
        {group && (
          <span className="item" data-drop="2" data-status="group">
            <span className="dot" style={{ background: group.color ?? "#666", width: 7, height: 7, borderRadius: "50%" }} />
            {groupLabel(group)}
          </span>
        )}

        {profile && (
          <span className="item" data-drop="1" data-status="profile">
            {profile.name}
          </span>
        )}

        {tab?.cwd && (
          <span
            className="item cwd"
            data-drop="3"
            data-status="cwd"
            title={`${tab.cwd}\n${t("status.revealHint")}`}
            style={{ cursor: "pointer" }}
            onClick={() => void api.revealInExplorer(tab.cwd!).catch(() => {})}
          >
            {shortenPath(tab.cwd, 3)}
          </span>
        )}

        <span className="spacer" />

        {/*
          Yeni sürüm bildirimi.

          Çubuğun geri kalanı okuma, bu bir EYLEM ve yalnızca yapılacak bir şey
          varken çiziliyor — durum çubuğunun sadeleştirilmesiyle çelişmiyor:
          kalıcı bir rozet değil, geçici bir haber. Görüldüğü an tıklanıp
          kapatılabilir olması bu yüzden önemli.

          Tıklamak tarayıcıyı DEĞİL Ayarlar › Hakkında'yı açıyor: dış bağlantı
          açmak kullanıcının kararı olmalı, küçük bir rozete kazara tıklamanın
          sonucu değil. Sürüm notları da orada.
        */}
        {update && (
          <button
            className="status-btn update"
            title={t("update.availableTitle")}
            onClick={() => setUi({ settingsOpen: true, settingsSection: "about" })}
          >
            {"⬆ "}
            {t("update.available", { v: update.version })}
          </button>
        )}

        {/* Durum okumalarının kapısı. Her zaman çubukta: içindekiler artık
            "sığmadığı için" değil, BİLİNÇLİ olarak orada. */}
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
          className={historyOpen && panelMode === "history" ? "status-btn on" : "status-btn"}
          title={t("app.historyTitle", { keys: key("historyPanel") })}
          aria-pressed={historyOpen && panelMode === "history"}
          onClick={() => togglePanel("history")}
        >
          {t("app.history")}
        </button>
        <button
          className={historyOpen && panelMode === "favorites" ? "status-btn on" : "status-btn"}
          title={t("app.favoritesTitle", { keys: key("favorites") })}
          aria-pressed={historyOpen && panelMode === "favorites"}
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
