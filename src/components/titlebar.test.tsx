// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import { TabBar } from "./TabBar";
import { WindowControls } from "./WindowControls";

/**
 * Tek başlık çubuğu.
 *
 * Üstte iki şerit vardı: işletim sisteminin kendi çubuğu (Windows 11'de 32px,
 * yalnızca uygulama adı ve üç düğme) ve hemen altında uygulamanın kendi
 * `.titlebar`ı — marka, "yeni sekme", geçmiş, ayarlar. İkincisi zaten
 * `data-tauri-drag-region` taşıyordu, yani özel başlık çubuğu için yazılmıştı;
 * eksik olan tek şey yerel çerçeveyi kapatmaktı.
 *
 * `decorations: false` ile yerel çubuk kalktı ve pencere düğmeleri `.titlebar`a
 * girdi. Sekme çubuğu bu işin dışında: o bir sekme çubuğu, başlık çubuğu değil
 * — ayrıca kenar çubuğunun sağında başladığı için pencere genişliğini de
 * kaplamıyor.
 *
 * Buradaki testler sessizce bozulabilecek üç yanı bağlıyor: sürükleme
 * bölgesinin kapsamı, macOS ayrımı ve pencere yapılandırması.
 */

const PROFILE = {
  id: "p1",
  name: "PowerShell 7",
  kind: "pwsh" as const,
  shell: "pwsh.exe",
  args: [],
  cwd: null,
  env: {},
  shellIntegration: true,
  color: "#58a6ff",
  icon: null,
  unavailable: false,
};

const TAB = {
  id: "t1",
  title: "pwsh",
  customTitle: null,
  profileId: "p1",
  cwd: null,
  createdAt: 0,
  lastActiveAt: 0,
  hasScrollback: false,
  lastCommand: null,
  locked: false,
};

const APP = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
const CSS = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  const state = useStore.getState();
  useStore.setState({
    settings: { ...state.settings, profiles: [PROFILE], defaultProfileId: "p1" },
    groups: [
      {
        id: "g1",
        name: "Yayın",
        color: "#58a6ff",
        icon: null,
        collapsed: false,
        favorite: false,
        ungrouped: false,
        defaultProfileId: null,
        defaultCwd: null,
        env: {},
        activeTabId: "t1",
        tabs: [TAB],
      },
    ],
    activeGroupId: "g1",
  });
});

afterEach(() => {
  cleanup();
  setPlatform("windows");
});

describe("sürükleme bölgesi", () => {
  it("başlık çubuğu ve esneyen boşluğu sürüklenebilir", () => {
    // Yerel çubuk kalktığı için pencereyi taşımanın TEK yolu bu. Çubuğun
    // ortasındaki `.drag` öğesi `flex: 1` ile boşluğu kaplıyor; düğmelerin
    // arasında kalan yerden de tutulabilmeli.
    expect(APP, "başlık çubuğu sürüklenemiyor").toMatch(
      /className="titlebar"\s+data-tauri-drag-region/,
    );
    expect(APP, "esneyen boşluk sürüklenemiyor").toMatch(
      /className="drag"\s+data-tauri-drag-region/,
    );
  });

  it("işaret ÇIPLAK — 'deep' değil", () => {
    // Tauri'nin betiği çıplak işareti "yalnızca doğrudan bu öğeye tıklanırsa"
    // diye yorumluyor (`el === composedPath[0]`); "deep" tüm alt ağacı
    // sürükleme bölgesi yapardı ve başlık çubuğundaki DÜĞMELERE basmak
    // pencereyi taşırdı.
    expect(APP, 'başlık çubuğunda "deep" işaret var').not.toMatch(/data-tauri-drag-region="deep"/);
  });

  it("sekme çubuğu sürükleme bölgesi DEĞİL", () => {
    // Sekmelerin kendi HTML5 sürükle-bırakı var (sıralama) ve başlık çubuğu
    // zaten tam genişlikte bir sürükleme yüzeyi veriyor. Sekme çubuğuna da
    // işaret koymak kazancı olmayan bir çakışma riski olurdu.
    const { container } = render(<TabBar />);
    const tab = container.querySelector(".tab");
    expect(tab, "sekme çizilmedi").not.toBe(null);
    expect(tab!.hasAttribute("data-tauri-drag-region"), "sekme sürükleme bölgesi olmuş").toBe(
      false,
    );
    expect(tab!.getAttribute("draggable"), "sekme sürüklenebilir olmalı").toBe("true");
    expect(
      container.querySelector(".tabbar")!.hasAttribute("data-tauri-drag-region"),
      "sekme çubuğuna işaret konmuş",
    ).toBe(false);
  });

  it("pencere düğmeleri başlık çubuğunun içinde", () => {
    // Sekme çubuğunda DEĞİL: o kenar çubuğunun sağında başlıyor, yani pencere
    // genişliğini kaplamıyor ve düğmeler sağ üst köşeye dayanamazdı.
    const at = APP.indexOf("<WindowControls />");
    const sidebar = APP.indexOf("<GroupSidebar />");
    expect(at, "WindowControls çizilmiyor").toBeGreaterThan(-1);
    expect(at, "WindowControls başlık çubuğunun dışında").toBeLessThan(sidebar);
  });
});

describe("pencere düğmeleri", () => {
  it("Windows'ta üç düğme çiziliyor", () => {
    setPlatform("windows");
    const { container } = render(<WindowControls />);
    const labels = [...container.querySelectorAll(".win-btn")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Küçült", "Büyüt", "Kapat"]);
  });

  it("macOS'ta HİÇ çizilmiyor", () => {
    // Orada yerel trafik ışıkları duruyor (titleBarStyle: Overlay). Sağ üste
    // Windows tarzı üç düğme çizmek mac kullanıcısına doğrudan yanlış görünür
    // ve pencerede toplam altı düğme olurdu.
    setPlatform("macos");
    const { container } = render(<WindowControls />);
    expect(container.querySelectorAll(".win-btn")).toHaveLength(0);
    expect(container.querySelector(".win-controls")).toBe(null);
  });

  it("Tauri yokken de çiziliyor", () => {
    // `getCurrentWindow()` Tauri iç değişkenleri olmadan fırlatıyor. Çizim
    // yolunda çağrılırsa başlık çubuğunu çizen HER test düşer — bir kez oldu.
    expect(() => render(<WindowControls />)).not.toThrow();
  });

  it("düğmelerin erişilebilir adı var", () => {
    const { container } = render(<WindowControls />);
    for (const b of container.querySelectorAll(".win-btn")) {
      expect(b.getAttribute("aria-label"), "aria-label yok").toBeTruthy();
      expect(b.getAttribute("title"), "ipucu yok").toBeTruthy();
    }
  });

  it("kapatma isteği gönderiyor, pencereyi yok etmiyor", () => {
    // `close()` App.tsx'in `onCloseRequested` kancasına düşüyor; orada oturum
    // kaydediliyor ve kabuklar düzgün kapatılıyor. `destroy()` bunu atlar ve
    // kaydedilmemiş düzen kaybolurdu.
    const source = readFileSync(join(process.cwd(), "src/components/WindowControls.tsx"), "utf8");
    expect(source, "close() çağrılmıyor").toContain(".close()");
    expect(source, "destroy() kullanılmış — oturum kaydı atlanır").not.toContain(".destroy()");
  });
});

describe("pencere yapılandırması", () => {
  const conf = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  ) as { app: { windows: { label: string; decorations?: boolean }[] } };
  const mac = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri/tauri.macos.conf.json"), "utf8"),
  ) as {
    app: {
      windows: { decorations?: boolean; titleBarStyle?: string; hiddenTitle?: boolean }[];
    };
  };
  const caps = JSON.parse(
    readFileSync(join(process.cwd(), "src-tauri/capabilities/default.json"), "utf8"),
  ) as { permissions: string[] };

  it("temel yapılandırmada yerel çerçeve kapalı", () => {
    // Açık kalırsa yerel başlık çubuğu uygulamanınkinin üstünde görünür —
    // düzeltilen kusurun ta kendisi.
    expect(conf.app.windows[0].decorations).toBe(false);
  });

  it("macOS yerel trafik ışıklarını koruyor", () => {
    // macOS'ta `decorations: false` trafik ışıklarını da götürüyor. Doğrusu
    // süslemeleri açık bırakıp çubuğu saydamlaştırmak: ışıklar yerel kalıyor,
    // içerik altından akıyor.
    const w = mac.app.windows[0];
    expect(w.decorations, "mac'te süslemeler açık kalmalı").toBe(true);
    expect(w.titleBarStyle, "Overlay olmadan çubuk saydamlaşmaz").toBe("Overlay");
    expect(w.hiddenTitle, "başlık metni gizlenmeli").toBe(true);
  });

  it("pencere denetimi izinleri verilmiş", () => {
    // İzin eksikse düğme sessizce hiçbir şey yapmıyor: hata konsola düşüyor,
    // kullanıcı yalnızca "tıklıyorum olmuyor" görüyor.
    for (const izin of [
      "core:window:allow-start-dragging",
      "core:window:allow-internal-toggle-maximize",
      "core:window:allow-minimize",
      "core:window:allow-toggle-maximize",
      "core:window:allow-close",
      "core:window:allow-is-maximized",
    ]) {
      expect(caps.permissions, `${izin} verilmemiş`).toContain(izin);
    }
  });
});

describe("çubuk düzeni", () => {
  it("düğmeler sağ kenara dayanıyor", () => {
    // Windows'ta en sağ üst piksel "kapat"tır; fareyi köşeye çarpıp tıklamak
    // yerleşik bir alışkanlık. Başlık çubuğunun 8px yatay dolgusu araya
    // girerse o hareket ıskalıyor, o yüzden düğmeler negatif kenar boşluğuyla
    // dolgunun dışına taşıyor. Ölçüldü: sağ boşluk 0, üst boşluk 0.
    const at = CSS.indexOf(".win-controls {");
    expect(at, ".win-controls kuralı yok").toBeGreaterThan(-1);
    const body = CSS.slice(at, CSS.indexOf("}", at));
    expect(body, "sağ kenar boşluğu dolguyu geçersiz kılmıyor").toMatch(/margin-right:\s*-8px/);
  });

  it("macOS'ta sol boşluk trafik ışıklarını açıyor", () => {
    // Bırakılmazsa marka ve düğmeler ışıkların altında kalıyor, tıklanamıyor.
    const at = CSS.indexOf('html[data-platform="macos"] .titlebar {');
    expect(at, "mac kuralı yok").toBeGreaterThan(-1);
    const body = CSS.slice(at, CSS.indexOf("}", at));
    const left = /padding-left:\s*(\d+)px/.exec(body)?.[1];
    expect(left, "sol dolgu tanımsız").toBeTruthy();
    expect(Number(left)).toBeGreaterThanOrEqual(70);
  });
});

/**
 * Başlık çubuğunun içeriği.
 *
 * Çubuk bir EYLEM çubuğu değil, başlık çubuğu. İçindeki her düğme, pencereyi
 * sürüklemek için kalan yüzeyi de daraltıyor. Buradan çıkanların hepsinin
 * başka bir yolu var; test o yolların kapanmadığını da bağlıyor.
 */
describe("başlık çubuğu içeriği", () => {
  const sidebar = readFileSync(join(process.cwd(), "src/components/GroupSidebar.tsx"), "utf8");
  const tabbar = readFileSync(join(process.cwd(), "src/components/TabBar.tsx"), "utf8");
  const statusbar = readFileSync(join(process.cwd(), "src/components/StatusBar.tsx"), "utf8");
  const settings = readFileSync(join(process.cwd(), "src/components/SettingsDialog.tsx"), "utf8");

  /** Başlık çubuğu bloğu: `.titlebar` açılışından `<GroupSidebar` satırına kadar. */
  const titlebar = APP.slice(APP.indexOf('className="titlebar"'), APP.indexOf("<GroupSidebar"));

  it("iki eylem düğmesi: dosya ağacı ve Ayarlar", () => {
    // Çubuk bir EYLEM ÇUBUĞU değil; buraya ancak başka yolu olmayan şeyler
    // giriyor. Ağaç bir görünüm ve başka hiçbir yerden açılamıyor, Ayarlar da
    // öyle. Üçüncüsü eklenmek istenirse önce "bunun başka yolu var mı"
    // sorusunun yanıtlanması gerekiyor.
    const buttons = [...titlebar.matchAll(/className="icon-btn[^"]*"/g)];
    expect(buttons, "başlık çubuğunda beklenenden fazla düğme var").toHaveLength(2);
    expect(titlebar, "Ayarlar düğmesi yok").toContain("app.settings");
    expect(titlebar, "dosya ağacı düğmesi yok").toContain("app.filesTitle");
  });

  it("Ayarlar yazı değil simge; uygulamanın adı onun sağında", () => {
    // İSTEK: "Ayarlar yazıyor, bunu ayarlar ikonu yapalım; N-Terminal yazısını
    // sağına alalım." Adı ipucunda ve erişilebilir adında kalıyor.
    const at = titlebar.indexOf("app.settingsTitle");
    const button = titlebar.slice(at, titlebar.indexOf("</button>", at));
    expect(button, "simge yok").toContain("<GearIcon");
    expect(button, "erişilebilir adı yok").toContain('aria-label={t("app.settings")}');
    expect(button, "yazı hâlâ düğmenin içinde").not.toMatch(/>\s*\{t\("app\.settings"\)\}\s*$/);
    expect(titlebar.indexOf('className="brand"'), "ad Ayarlar'ın solunda").toBeGreaterThan(at);
  });

  it("kaldırılan eylemler çubukta değil", () => {
    for (const key of ["app.newTab", "app.newGroup", "app.transfer", "app.history"]) {
      expect(titlebar, `${key} hâlâ başlık çubuğunda`).not.toContain(key);
    }
  });

  it("kaldırılan eylemlerin başka yolu var", () => {
    // Bir eylemi çubuktan çıkarmak onu erişilemez kılmamalı.
    expect(tabbar, "yeni sekme için düğme kalmadı").toContain("addTab(");
    expect(sidebar, "yeni grup için düğme kalmadı").toContain("addGroup()");
    expect(settings, "aktarım Ayarlar'dan açılmıyor").toContain("transferOpen: true");
    expect(statusbar, "geçmiş paneli açılamıyor").toContain("app.historyTitle");
    expect(statusbar, "favoriler paneli açılamıyor").toContain("app.favoritesTitle");
  });

  it("sürüklenecek yüzey düğmelerden SONRA geliyor", () => {
    // `.drag` esneyen boşluk; düğmelerin arkasında kalırsa sürüklenecek alan
    // sıfırlanır ve pencere yalnızca dar bir şeritten taşınabilir.
    const drag = titlebar.indexOf('className="drag"');
    const settingsBtn = titlebar.indexOf("app.settings");
    const controls = titlebar.indexOf("<WindowControls />");
    expect(drag, "esneyen boşluk yok").toBeGreaterThan(-1);
    expect(settingsBtn, "Ayarlar boşluktan sonra").toBeLessThan(drag);
    expect(drag, "boşluk pencere düğmelerinden sonra").toBeLessThan(controls);
  });
});

describe("durum çubuğu panel düğmeleri", () => {
  const statusbar = readFileSync(join(process.cwd(), "src/components/StatusBar.tsx"), "utf8");

  it("iki panel anahtarı da durum çubuğunda", () => {
    expect(statusbar).toContain("app.history");
    expect(statusbar).toContain("app.favorites");
  });

  it("açık panele ikinci tık onu kapatıyor", () => {
    // Yalnızca açan bir düğme, ikinci tıklamada hiçbir şey yapmıyormuş gibi
    // görünür. Aynı kip zaten açıksa kapanmalı.
    expect(statusbar, "geçiş mantığı yok").toMatch(/historyOpen && panelMode === mode/);
    expect(statusbar, "kapatma dalı yok").toContain("historyOpen: false");
  });

  it("basılı durum erişilebilirliğe bildiriliyor", () => {
    // Görsel olarak zemin değişiyor; ekran okuyucu için `aria-pressed` şart.
    const count = [...statusbar.matchAll(/aria-pressed=/g)].length;
    expect(count, "aria-pressed eksik").toBeGreaterThanOrEqual(2);
  });

  it("düğmeler daralmıyor", () => {
    // Durum çubuğu `overflow: hidden`; düğmeler esnerse uzun bir klasör yolu
    // onları dışarı iter ve tıklanamaz hâle gelirler. Ölçüldü: 760px'e kadar
    // kırpılma sıfır, uzun yolda `cwd` daralıyor ve düğmeler duruyor.
    const at = CSS.indexOf(".statusbar .status-btn {");
    expect(at, "status-btn kuralı yok").toBeGreaterThan(-1);
    const body = CSS.slice(at, CSS.indexOf("}", at));
    expect(body, "flex: none yok — düğmeler daralabilir").toMatch(/flex:\s*none/);
  });
});

/**
 * Başlık çubuğunun sol köşesindeki iki görünüm düğmesi.
 *
 * İkisi de AÇIP KAPATIYOR. Tek yönlü hâllerinde aynı kusur vardı: düğme
 * açtığı şeyi kapatamıyordu, ikinci tıklama hiçbir şey yapmıyormuş gibi
 * görünüyordu. Dosya ağacını kapatmak için panelin kendi "×" düğmesini bulmak
 * gerekiyordu; grup listesini kapatmanın ise hiçbir yolu yoktu.
 *
 * Sıraları düzenin sırasıyla aynı: en soldaki düğme en soldaki paneli açıyor.
 */
describe("görünüm düğmeleri", () => {
  it("kenar çubuğu düğmesi ağacın solunda", () => {
    const sidebar = APP.indexOf("app.sidebarShow");
    const tree = APP.indexOf("app.filesTitle");
    expect(sidebar, "kenar çubuğu düğmesi yok").toBeGreaterThan(-1);
    expect(sidebar, "düğme sırası düzenin sırasını izlemiyor").toBeLessThan(tree);
  });

  it("kenar çubuğu daraltılmışken çizilmiyor", () => {
    // `display: none` DEĞİL: ızgaranın `auto` sütununun sıfıra inmesi ve
    // terminalin o alanı alması gerekiyor.
    expect(APP, "kenar çubuğu koşulsuz çiziliyor").toMatch(
      /\{!sidebarCollapsed && <GroupSidebar \/>\}/,
    );
  });

  it("kenar çubuğunun durumu ayarda tutuluyor", () => {
    // Geçici arayüz durumu olsaydı uygulama her açılışta çubuğu geri
    // getirirdi; kullanıcı onu kapattığını hatırlıyor, uygulama da hatırlamalı.
    expect(APP).toMatch(/patchAppearance\(\{ sidebarCollapsed: !sidebarCollapsed \}\)/);
  });

  it("dosya sütunu düğmesi ikinci tıkta kapatıyor", () => {
    // Durum sağ panelin kipinden AYRI: sütun grupların sağında, sağ panelin
    // bir sekmesi değil. Tek bayrak olduğu için açma ve kapama aynı ifade.
    expect(APP, "geçiş mantığı yok").toMatch(
      /const treeOpen = useStore\(\(s\) => s\.ui\.treeOpen\)/,
    );
    expect(APP, "açma/kapama dalı yok").toMatch(/setUi\(\{ treeOpen: !treeOpen \}\)/);
  });

  it("dosya paneli terminalin ÜSTÜNDE açılıyor, ızgarada sütun değil", () => {
    /*
     * İSTEK: "klasörleri göster'e basınca açılıyor ve terminali sıkıştırıyor;
     * üstüne açılacak şekilde yapalım." Önceki hâli ızgarada kendi sütunuydu
     * ("sidebar files main"): açılınca terminal daralıyor, xterm yeniden
     * ölçülüyor ve kabuk ekranı yeni sütun sayısıyla yeniden çiziyordu.
     *
     * Şimdi panel `.main` içinde, terminal hücresinde (aynı ızgara alanı) ve
     * içeriği mutlak konumlu — yani hücrenin ölçüsüne hiç katkısı yok. Grupların
     * sağında, terminalin sol kenarında durması değişmedi.
     */
    const sidebar = APP.indexOf("<GroupSidebar />");
    const files = APP.indexOf("<FilePanel />");
    const main = APP.indexOf('className="main"');
    const terminal = APP.indexOf("<TerminalArea />");
    expect(files, "dosya paneli çizilmiyor").toBeGreaterThan(-1);
    expect(sidebar, "panel grupların solunda").toBeLessThan(files);
    expect(main, "panel `.main`in dışında — terminali yine daraltır").toBeLessThan(files);
    expect(terminal, "panel terminalden önce çiziliyor").toBeLessThan(files);

    expect(CSS, "ızgarada hâlâ `files` sütunu var").not.toMatch(/"sidebar files main"/);
    expect(CSS, "ızgara iki sütunlu değil").toMatch(/"sidebar main"/);

    const rule = (sel: string) => {
      const at = CSS.indexOf(`${sel} {`);
      expect(at, `${sel} kuralı yok`).toBeGreaterThan(-1);
      return CSS.slice(at, CSS.indexOf("}", at));
    };
    const layer = rule(".files-layer");
    expect(layer, "katman terminal hücresinde değil").toMatch(/grid-area:\s*terminal/);
    // Katmanın kendisi tıklamaları geçiriyor: ağaç açıkken sağda kalan terminal
    // tıklanabilir kalmalı.
    expect(layer, "katman terminale gelen tıklamaları yutuyor").toMatch(/pointer-events:\s*none/);
    // İçerik mutlak konumlu: hücrenin ölçüsünü büyütemez.
    expect(rule(".files-overlay"), "panel içeriği akışta — ızgarayı büyütür").toMatch(/position:\s*absolute/);
  });

  it("kısayollar paleti doğru sekmede açıyor", () => {
    // Ctrl+P adla, içerik kısayolu içerikle; başlık çubuğundaki alan ("Dosya
    // ara") adla. Sekme depoda (`ui.paletteMode`) çünkü açan yer paletin dışı.
    expect(APP).toMatch(/keys\.filePalette\)\)\s*return run\(\(\) => store\.setUi\(\{ filePaletteOpen: true, paletteMode: "files" \}\)\)/);
    expect(APP).toMatch(/keys\.textSearch \?\? ""\)\)\s*return run\(\(\) => store\.setUi\(\{ filePaletteOpen: true, paletteMode: "text" \}\)\)/);
    expect(APP).toMatch(/className="titlebar-search"[\s\S]{0,400}paletteMode: "files"/);
  });

  it("açık dosya terminali örtüyorsa 'Terminalde ara' önce paneli kapatıyor", () => {
    // Arama çubuğu terminalin sağ üstünde ve panelin ALTINDA kalırdı: kısayol
    // hiçbir şey yapmıyormuş gibi görünürdü.
    const at = APP.indexOf("matchCombo(event, keys.findInTerminal)");
    expect(at, "kısayol dalı yok").toBeGreaterThan(-1);
    const branch = APP.slice(at, APP.indexOf(";", APP.indexOf("findOpen: true", at) + 60));
    expect(branch).toMatch(/store\.ui\.treeOpen && store\.ui\.viewerPath \? \{ findOpen: true, treeOpen: false \}/);
  });

  it("dosya paneli öneri şeridinin ALTINDA", () => {
    // Panel açıkken komut kutusuna yazılan komutun önerileri görünmeli; şerit
    // terminal alanının dibinde yüzüyor ve panelle üst üste biniyor.
    const z = (sel: string) => Number(/z-index:\s*(\d+)/.exec(CSS.slice(CSS.indexOf(`${sel} {`)))?.[1]);
    expect(z(".suggest-bar"), "öneri şeridi panelin altında kalıyor").toBeGreaterThan(z(".files-layer"));
    // Terminalde arama çubuğu (20) panelin altında kalıyor; panel onu örtüyor
    // ve kısayol açık bir dosya varken paneli kapatıyor (App.tsx).
    expect(z(".files-layer")).toBeGreaterThan(z(".find-bar"));
  });

  it("dosya paneli kapalıyken hiç çizilmiyor", () => {
    // `display: none` DEĞİL: kapalı panelin katmanı terminalin üstünde boş
    // durmamalı; React onu hiç kurmuyor.
    expect(APP, "panel koşulsuz çiziliyor").toMatch(/\{treeOpen && <FilePanel \/>\}/);
  });

  it("dosya düğmesinin simgesi klasör", () => {
    // Kullanıcının aradığı şey "dosyalar"; ağaç simgesi bir veri yapısını
    // anlatıyordu. Simge değişimi geri alınırsa bu test söyler.
    const titlebar = APP.slice(APP.indexOf('className="titlebar"'), APP.indexOf("<GroupSidebar"));
    expect(titlebar, "klasör simgesi yok").toContain("<FolderIcon");
    expect(titlebar, "ağaç simgesi geri gelmiş").not.toContain("<TreeIcon");
  });

  it("iki düğme de basılı durumu bildiriyor", () => {
    // Görsel durum yalnızca zeminde; ekran okuyucu için `aria-pressed` şart.
    const titlebar = APP.slice(APP.indexOf('className="titlebar"'), APP.indexOf("<GroupSidebar"));
    const count = [...titlebar.matchAll(/aria-pressed=/g)].length;
    expect(count, "başlık çubuğunda aria-pressed eksik").toBeGreaterThanOrEqual(2);
  });

  it("açık ağaç düğmesi işaretli görünüyor", () => {
    // Kapatabilen bir düğmenin açık olduğu tıklamadan ÖNCE belli olmalı.
    expect(APP, "açık durumda 'on' sınıfı verilmiyor").toMatch(
      /treeOpen \? "icon-btn view-btn on" : "icon-btn view-btn"/,
    );
    expect(CSS, "'on' sınıfının bir görünümü yok").toMatch(/\.icon-btn\.on \{/);
  });
});
