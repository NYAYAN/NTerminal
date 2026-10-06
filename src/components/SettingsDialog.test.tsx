// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { defaultFontStack, setPlatform } from "../lib/platform";
import { LIMITS } from "../lib/settingsLimits";
import { useStore } from "../store/useStore";
import { SettingsDialog } from "./SettingsDialog";

/**
 * Ayarlar penceresinin yapısı.
 *
 * Pencere bu oturumda hızla büyüdü (dil, görünüm kipi, sağ tık, kapatma onayı,
 * bağlantı rengi, komut önerisi…) ve iki somut kusur oluştu:
 *
 *  - "Terminal" başlığı İKİ ayrı bölümde geçiyordu; kullanıcı bir ayarı
 *    hangisinde arayacağını bilemiyordu.
 *  - Tek bir bölümün içeriği 776px, görünür alan 461px — her şey kaydırma
 *    içinde kalmıştı.
 *
 * Bu testler yapıyı bağlıyor: bölüm sayısı, gezinmenin çalışması ve **aynı
 * başlığın iki bölümde geçmemesi**.
 */

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  setLanguage("tr");
  const state = useStore.getState();
  // Profiller ve Gruplar iki panelli: sag taraftaki form ancak bir kayit
  // seciliyken ciziliyor. Bos depoyla olcmek o bolumleri "bos" gosterir.
  useStore.setState({
    // `settingsSection` de sifirlaniyor: bolum istegi bir acilisi
    // yonlendiriyor ve birakilirsa SONRAKI testin penceresini baska bir
    // bolumde acar - testler birbirinin durumuna bagli olmamali.
    ui: { ...state.ui, settingsOpen: true, editingGroupId: null, settingsSection: null },
    appVersion: "0.1.0",
    settings: {
      ...state.settings,
      profiles: [
        {
          id: "p1",
          name: "PowerShell 7",
          kind: "pwsh",
          shell: "pwsh.exe",
          args: [],
          cwd: null,
          env: {},
          shellIntegration: true,
          color: "#58a6ff",
          icon: null,
          unavailable: false,
        },
      ],
      defaultProfileId: "p1",
    },
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
        activeTabId: null,
        tabs: [],
      },
    ],
    activeGroupId: "g1",
  });
});

afterEach(() => {
  cleanup();
  const ui = useStore.getState().ui;
  useStore.setState({ ui: { ...ui, settingsOpen: false } });
});

const navLabels = (c: HTMLElement) =>
  [...c.querySelectorAll(".settings-nav button")].map((b) => b.textContent!.trim());

const headings = (c: HTMLElement) =>
  [...c.querySelectorAll(".modal-body h3")].map((h) => h.textContent!.trim());

describe("ayarlar penceresi", () => {
  it("dikey gezinme var, yatay şerit yok", () => {
    // Dokuz bölüm yatay bir şeride sığmıyor; her yeni ayar şeridi daraltıyordu.
    const { container } = render(<SettingsDialog />);
    expect(container.querySelector(".settings-nav"), "dikey gezinme yok").not.toBe(null);
    expect(container.querySelector(".tabs-strip"), "yatay şerit kalmış").toBe(null);
  });

  it("dokuz bölüm listeleniyor", () => {
    const { container } = render(<SettingsDialog />);
    expect(navLabels(container)).toEqual([
      "Genel",
      "Görünüm",
      "Terminal",
      "Oturum",
      "Geçmiş",
      "Profiller",
      "Gruplar",
      "Kısayollar",
      "Hakkında",
    ]);
  });

  it("açılışta Genel bölümü seçili", () => {
    const { container } = render(<SettingsDialog />);
    const on = container.querySelector(".settings-nav button.on");
    expect(on!.textContent!.trim()).toBe("Genel");
    expect(on!.getAttribute("aria-current")).toBe("true");
  });

  it("bölüm değiştirmek içeriği değiştiriyor", async () => {
    const { container } = render(<SettingsDialog />);
    // "Düzen", "Görünüm biçimi" değil: "Görünüm" yan menüde bir bölümün adı.
    expect(headings(container)).toEqual(["Dil", "Düzen"]);

    fireEvent.click([...container.querySelectorAll(".settings-nav button")][1]);
    await settle();
    // Kaydırma tamponu Oturum › Ekran çıktısı'na taşındı; başlık "İmleç".
    expect(headings(container)).toEqual([
      "Tema",
      "Terminal yazı tipi",
      "Arayüz yazı tipi",
      "İmleç",
      "Sekmeler",
    ]);

    fireEvent.click([...container.querySelectorAll(".settings-nav button")][2]);
    await settle();
    expect(headings(container)).toEqual([
      "Kopyala ve yapıştır",
      "Bağlantılar",
      "Komut satırı",
      "Komut önerisi",
    ]);
  });

  it("aynı başlık iki bölümde geçmiyor", async () => {
    // Somut kusur: "Terminal" başlığı hem Görünüm hem Davranış bölümündeydi.
    // Bir ayarı hangi bölümde arayacağınız belirsizdi.
    const { container } = render(<SettingsDialog />);
    const buttons = [...container.querySelectorAll(".settings-nav button")];
    const seen = new Map<string, string>();
    const clashes: string[] = [];

    for (const button of buttons) {
      const section = button.textContent!.trim();
      fireEvent.click(button);
      await settle();
      for (const heading of headings(container)) {
        const previous = seen.get(heading);
        if (previous && previous !== section) clashes.push(`"${heading}": ${previous} + ${section}`);
        else seen.set(heading, section);
      }
    }

    expect(clashes, `birden çok bölümde geçen başlık:\n${clashes.join("\n")}`).toEqual([]);
  });

  it("her bölümün en az bir başlığı var", async () => {
    // Boş bir bölüm gezinmede yer alıp hiçbir şey göstermemeli.
    const { container } = render(<SettingsDialog />);
    const empty: string[] = [];
    for (const button of [...container.querySelectorAll(".settings-nav button")]) {
      fireEvent.click(button);
      await settle();
      if (headings(container).length === 0) empty.push(button.textContent!.trim());
    }
    expect(empty, `başlıksız bölüm: ${empty.join(", ")}`).toEqual([]);
  });

  it("dil seçici Genel bölümünde ve iki dil sunuyor", () => {
    const { container } = render(<SettingsDialog />);
    const select = container.querySelector(".modal-body select") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.value);
    expect(options).toEqual(["tr", "en"]);
    expect(select.value).toBe("tr");
  });

  it("dil değişince bölüm adları da değişiyor", async () => {
    const { container } = render(<SettingsDialog />);
    await act(async () => {
      setLanguage("en");
    });
    expect(navLabels(container).slice(0, 5)).toEqual([
      "General",
      "Appearance",
      "Terminal",
      "Session",
      "History",
    ]);
  });

  it("grup düzenlemeyle açılınca Gruplar bölümü seçili", () => {
    // Kenar çubuğundan "Grup ayarları…" bu yolla açılıyor; Genel bölümüne
    // düşmek kullanıcıyı yanlış yere bırakır.
    const ui = useStore.getState().ui;
    useStore.setState({ ui: { ...ui, editingGroupId: "g1" } });
    const { container } = render(<SettingsDialog />);
    expect(container.querySelector(".settings-nav button.on")!.textContent!.trim()).toBe("Gruplar");
  });

  it("istenen bölümle açılınca o bölüm seçili", () => {
    // BİLDİRİLEN HATA: sekme çubuğundaki "+" menüsünden "Profilleri düzenle…"
    // deyince pencere açılıyor ama Genel bölümünde kalıyordu — öğenin sözü
    // profilleri düzenlemek.
    const ui = useStore.getState().ui;
    useStore.setState({ ui: { ...ui, settingsSection: "profiles" } });
    const { container } = render(<SettingsDialog />);
    expect(container.querySelector(".settings-nav button.on")!.textContent!.trim()).toBe(
      "Profiller",
    );
  });

  /*
   * Yönlendirme TÜKETİLİYOR: bir açılış için geçerli.
   *
   * `settingsSection` ve `editingGroupId` kalıcı durum değil, birer istek.
   * Silinmeselerdi yapışırlardı: "Hakkında"ya bir kez giden kullanıcı sonraki
   * her açılışta oraya düşerdi — dişliyle, Ctrl+, ile ya da paletten açsa
   * bile. Tüketim AÇILIŞA bağlı, kapanışa değil: pencereyi kapatan üç yol var
   * ve yalnızca biri `close()`tan geçiyor.
   */
  it("bölüm isteği bir açılışta tükeniyor, yapışmıyor", async () => {
    const ui = useStore.getState().ui;
    useStore.setState({ ui: { ...ui, settingsSection: "about" } });

    const ilk = render(<SettingsDialog />);
    expect(ilk.container.querySelector(".settings-nav button.on")!.textContent!.trim()).toBe(
      "Hakkında",
    );
    await settle();
    expect(useStore.getState().ui.settingsSection, "istek silinmedi").toBe(null);
    ilk.unmount();

    // İkinci açılış: kimse bir bölüm istemedi, Genel'e düşmeli.
    const ikinci = render(<SettingsDialog />);
    expect(
      ikinci.container.querySelector(".settings-nav button.on")!.textContent!.trim(),
      "önceki açılışın bölümü yapışmış",
    ).toBe("Genel");
  });

  it("grup isteği de tükeniyor", async () => {
    // Aynı tuzak `editingGroupId` için de vardı ve `close()` onu temizlese de
    // Escape ile kapatan yol oradan geçmiyor.
    const ui = useStore.getState().ui;
    useStore.setState({ ui: { ...ui, editingGroupId: "g1" } });

    const ilk = render(<SettingsDialog />);
    await settle();
    expect(useStore.getState().ui.editingGroupId, "istek silinmedi").toBe(null);
    ilk.unmount();

    const ikinci = render(<SettingsDialog />);
    expect(
      ikinci.container.querySelector(".settings-nav button.on")!.textContent!.trim(),
      "önceki açılışın grubu yapışmış",
    ).toBe("Genel");
  });
});

describe("ayarlarda arama", () => {
  const input = (c: HTMLElement) =>
    c.querySelector(".settings-search input") as HTMLInputElement;
  const results = (c: HTMLElement) => [...c.querySelectorAll(".settings-result")];

  it("arama kutusu var", () => {
    const { container } = render(<SettingsDialog />);
    expect(input(container), "arama kutusu bulunamadı").not.toBe(null);
  });

  it("yazmak bölüm listesini sonuçlarla değiştiriyor", async () => {
    const { container } = render(<SettingsDialog />);
    expect(navLabels(container)).toContain("Genel");

    fireEvent.change(input(container), { target: { value: "tema" } });
    await settle();

    expect(results(container).length, "sonuç çıkmadı").toBeGreaterThan(0);
    // Bölüm listesi yerini sonuçlara bırakmalı.
    expect(navLabels(container)).not.toContain("Genel");
  });

  it("sonuç hem ayarın adını hem bölümünü gösteriyor", async () => {
    // Bölüm adı olmadan kullanıcı nereye gittiğini anlamıyor.
    const { container } = render(<SettingsDialog />);
    fireEvent.change(input(container), { target: { value: "tema" } });
    await settle();
    const first = results(container)[0];
    expect(first.querySelector(".settings-result-label")!.textContent).toBe("Renk teması");
    expect(first.querySelector(".settings-result-section")!.textContent).toBe("Görünüm");
  });

  it("sonuca tıklamak bölüme götürüyor ve satırı vurguluyor", async () => {
    const { container } = render(<SettingsDialog />);
    fireEvent.change(input(container), { target: { value: "sağ tık" } });
    await settle();
    fireEvent.click(results(container)[0]);
    await settle();

    // Terminal bölümü açılmalı.
    expect(headings(container)).toContain("Kopyala ve yapıştır");
    // Ve aradığı satır vurgulanmalı: yalnızca bölüme götürmek yarım iş.
    const row = container.querySelector('[data-setting="settings.rightClick"]');
    expect(row, "ayar satırı bulunamadı").not.toBe(null);
    expect(row!.classList.contains("found"), "satır vurgulanmadı").toBe(true);
  });

  it("Enter ilk sonuca gidiyor", async () => {
    const { container } = render(<SettingsDialog />);
    fireEvent.change(input(container), { target: { value: "tema" } });
    await settle();
    fireEvent.keyDown(input(container), { key: "Enter" });
    await settle();
    expect(headings(container)).toContain("Tema");
  });

  it("Esc aramayı temizliyor", async () => {
    const { container } = render(<SettingsDialog />);
    fireEvent.change(input(container), { target: { value: "tema" } });
    await settle();
    fireEvent.keyDown(input(container), { key: "Escape" });
    await settle();
    expect(input(container).value).toBe("");
    expect(navLabels(container)).toContain("Genel");
  });

  it("temizle düğmesi yalnızca sorgu varken görünüyor", async () => {
    const { container } = render(<SettingsDialog />);
    expect(container.querySelector(".settings-search .icon-btn")).toBe(null);
    fireEvent.change(input(container), { target: { value: "x" } });
    await settle();
    expect(container.querySelector(".settings-search .icon-btn")).not.toBe(null);
  });

  it("eşleşme yoksa bunu söylüyor", async () => {
    const { container } = render(<SettingsDialog />);
    fireEvent.change(input(container), { target: { value: "kubernetes" } });
    await settle();
    expect(results(container)).toHaveLength(0);
    expect(container.querySelector(".settings-results .hint")!.textContent).toBe(
      "Eşleşen ayar yok.",
    );
  });

  it("aksansız yazım da buluyor", async () => {
    // Aksanlı harfe basmak zorunda kalmak arama kutusunu kullanılmaz yapıyor.
    const { container } = render(<SettingsDialog />);
    fireEvent.change(input(container), { target: { value: "gorunum" } });
    await settle();
    expect(results(container).length).toBeGreaterThan(0);
  });
});

describe("profil silme", () => {
  it("onay soruyor ve vazgeçince silmiyor", async () => {
    // Kullanıcının kuralı: her silmede sor. Profil silmek geri dönüşü olmayan
    // bir kayıp (exe yolu, argümanlar, ortam değişkenleri).
    const asked: string[] = [];
    useStore.setState({
      askConfirm: async (request) => {
        asked.push(request.message);
        return false;
      },
      settings: {
        ...useStore.getState().settings,
        profiles: [
          ...useStore.getState().settings.profiles,
          {
            id: "p2",
            name: "Git Bash",
            kind: "bash",
            shell: "bash.exe",
            args: [],
            cwd: null,
            env: {},
            shellIntegration: true,
            color: null,
            icon: null,
            unavailable: false,
          },
        ],
      },
    });

    const { container } = render(<SettingsDialog />);
    fireEvent.click([...container.querySelectorAll(".settings-nav button")][5]); // Profiller
    await settle();

    const remove = [...container.querySelectorAll(".modal-body button.danger")].find((b) =>
      b.textContent?.trim() === "Sil",
    )!;
    expect(remove, "profil silme düğmesi bulunamadı").toBeTruthy();
    fireEvent.click(remove);
    await settle();

    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("PowerShell 7");
    // Vazgeçildi: profil listesi olduğu gibi kalmalı.
    expect(useStore.getState().settings.profiles).toHaveLength(2);
  });

  it("tek profil kalmışsa soru sorulmuyor", async () => {
    // Yapılamayacak bir işlem için soru sormak kullanıcıyı yanıltır.
    const asked: string[] = [];
    useStore.setState({
      askConfirm: async (request) => {
        asked.push(request.message);
        return true;
      },
    });

    const { container } = render(<SettingsDialog />);
    fireEvent.click([...container.querySelectorAll(".settings-nav button")][5]);
    await settle();
    const remove = [...container.querySelectorAll(".modal-body button.danger")].find((b) =>
      b.textContent?.trim() === "Sil",
    )!;
    fireEvent.click(remove);
    await settle();

    expect(asked).toEqual([]);
    expect(useStore.getState().settings.profiles).toHaveLength(1);
  });
});

/**
 * "Hakkında" bölümündeki geliştirici bilgileri.
 *
 * Önceki hâli sürüm açıklamasının altındaki tek bir soluk satırdı ve orada
 * kayboluyordu. Uygulamayı kimin yazdığı, kaynağın nerede olduğu ve hangi
 * lisansla dağıtıldığı birbirine bağlı üç bilgi; kendi bölümlerinde ve
 * etiketli duruyorlar.
 */
describe("hakkında bölümü", () => {
  /** "Hakkında" bölümünü açar (dokuzuncu ve son gezinme düğmesi). */
  async function openAbout() {
    const view = render(<SettingsDialog />);
    const buttons = [...view.container.querySelectorAll(".settings-nav button")];
    fireEvent.click(buttons[buttons.length - 1]);
    await settle();
    return view;
  }

  it("geliştirici, kaynak ve lisans etiketli duruyor", async () => {
    const { container } = await openAbout();
    const labels = [...container.querySelectorAll(".modal-body .field label")].map((l) =>
      l.textContent!.trim(),
    );
    expect(labels).toContain("Geliştiren");
    expect(labels).toContain("Kaynak kodu");
    expect(labels).toContain("Lisans");
  });

  it("ad, depo adresi, lisans ve telif görünüyor", async () => {
    const { container } = await openAbout();
    const body = container.querySelector(".modal-body")!;
    expect(body.textContent).toContain("Nurullah YAYAN");
    expect(body.textContent).toContain("MIT lisansı");
    expect(body.textContent).toContain("© 2026");

    const repo = [...body.querySelectorAll("input")].find((i) =>
      i.value.includes("github.com"),
    );
    expect(repo, "depo adresi yok").not.toBe(undefined);
    expect(repo!.readOnly, "adres elle değiştirilebiliyor").toBe(true);
  });

  it("sürüm başlıkta duruyor", async () => {
    const { container } = await openAbout();
    expect(headings(container)[0]).toBe("N-Terminal 0.1.0");
  });
});

/**
 * Ayar açıklamaları "i" düğmesinin arkasında.
 *
 * Ölçülen sorun: açıklamalar her ayarın altında duran soluk satırlardı ve
 * açıklaması olan bir ayar, olmayanın iki katı yer kaplıyordu — Terminal
 * bölümünde on ayarın sekizi açıklamalıydı, bölümün yüksekliğinin yarısı
 * açıklamaydı. Kullanıcının sözleri: "çok yer kaplıyor ekranda ve bütünlük
 * kayboluyor".
 *
 * Metin kaybolmuyor: aramada hâlâ eşleşiyor, tek tıkla ekranda. Bu testler
 * bağladığı şey davranış: kapalı başlıyor, açılıyor, aynı anda tek tane açık
 * kalıyor ve bölüm değişince kapanıyor.
 */
describe("ayar açıklamaları", () => {
  const LANG_HINT = "Tarih ve saat biçimleri de dille birlikte değişir";

  it("açıklama metni başta ekranda değil", () => {
    const { container } = render(<SettingsDialog />);
    expect(
      container.querySelectorAll(".info-btn").length,
      "açıklama düğmesi hiç yok",
    ).toBeGreaterThan(0);
    expect(container.querySelector(".info-pop"), "açıklama baştan açık").toBe(null);
    expect(container.querySelector(".modal-body")!.textContent).not.toContain(LANG_HINT);
  });

  it("düğmeye basınca açılıyor, yeniden basınca kapanıyor", () => {
    const { container } = render(<SettingsDialog />);
    const button = container.querySelector(".info-btn") as HTMLButtonElement;

    fireEvent.click(button);
    expect(container.querySelector(".info-pop")!.textContent).toContain(LANG_HINT);
    expect(button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(button);
    expect(container.querySelector(".info-pop"), "ikinci tıklama kapatmadı").toBe(null);
  });

  it("aynı anda tek açıklama açık kalıyor", () => {
    // İkisi birden açıkken katmanlar alt alta ayarların üstüne biniyor ve
    // hangisinin hangi satıra ait olduğu okunmuyor.
    const { container } = render(<SettingsDialog />);
    const buttons = [...container.querySelectorAll(".info-btn")] as HTMLButtonElement[];
    expect(buttons.length, "tek düğmeli bölümde ölçülemez").toBeGreaterThan(1);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(container.querySelectorAll(".info-pop").length).toBe(1);
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
  });

  it("başka bir yere tıklamak kapatıyor", () => {
    const { container } = render(<SettingsDialog />);
    fireEvent.click(container.querySelector(".info-btn")!);
    fireEvent.mouseDown(container.querySelector(".modal-body")!);
    expect(container.querySelector(".info-pop")).toBe(null);
  });

  it("bölüm değişince açık açıklama kapanıyor", () => {
    // `useId` ağaçtaki KONUMA göre kimlik üretiyor: kap yenilenmezse yeni
    // bölümdeki aynı konumdaki açıklama eskisinin kimliğini alıp kendiliğinden
    // açık görünürdü (gerekçe SettingHint.tsx içinde).
    const { container } = render(<SettingsDialog />);
    fireEvent.click(container.querySelector(".info-btn")!);
    fireEvent.click([...container.querySelectorAll(".settings-nav button")][2]);
    expect(container.querySelector(".info-pop"), "bölüm değişti, katman açık kaldı").toBe(
      null,
    );
  });

  it("düğme bilgi sütununda, satırın kendi çocuğu olarak duruyor", () => {
    // Yerleşim jsdom'da ölçülemiyor; bağlanabilen şey YAPI: düğme `.field`in
    // ya da bölümün DOĞRUDAN çocuğu olmalı, çünkü sütununu (`grid-column: 3`)
    // oradan alıyor. Bir sarmalayıcının içine düşerse ızgara sütunu kayboluyor
    // ve düğme satırın altına, en sola geçiyor (bir kez oldu).
    const { container } = render(<SettingsDialog />);
    for (const info of container.querySelectorAll(".info")) {
      const parent = info.parentElement!;
      expect(
        parent.classList.contains("field") ||
          parent.classList.contains("section") ||
          parent.classList.contains("settings-form"),
        `açıklama düğmesinin ebeveyni ızgara değil: ${parent.className}`,
      ).toBe(true);
    }
  });
});

/**
 * Klavye odağı pencerede.
 *
 * ÖLÇÜLEN: ⌘, ile açılan pencerede odak arkadaki terminalin gizli
 * textarea'sında kalıyordu; yazılan harf kabuğa gidiyordu (`pty_write "x"`) ve
 * Enter komutu çalıştırırdı.
 */
describe("klavye odağı", () => {
  const search = (c: HTMLElement) => c.querySelector(".settings-search input") as HTMLInputElement;

  it("açılınca odak arama kutusunda", () => {
    const terminal = document.body.appendChild(document.createElement("textarea"));
    terminal.focus();
    const { container } = render(<SettingsDialog />);
    expect(document.activeElement, "odak arkada kaldı").toBe(search(container));
    terminal.remove();
  });

  it("kapanınca odak açılıştaki yerine dönüyor", () => {
    const terminal = document.body.appendChild(document.createElement("textarea"));
    terminal.focus();
    const { unmount } = render(<SettingsDialog />);
    unmount();
    expect(document.activeElement, "kullanıcı kaldığı yerden yazamıyor").toBe(terminal);
    terminal.remove();
  });

  it("dışarı kaçan odak geri çekiliyor", () => {
    const terminal = document.body.appendChild(document.createElement("textarea"));
    const { container } = render(<SettingsDialog />);
    terminal.focus();
    expect(document.activeElement, "odak terminalde kaldı").toBe(search(container));
    terminal.remove();
  });

  it("pencere bir iletişim kutusu olarak tanımlı", () => {
    const { container } = render(<SettingsDialog />);
    const modal = container.querySelector(".modal.settings")!;
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    const title = container.querySelector(`#${CSS.escape(modal.getAttribute("aria-labelledby")!)}`);
    expect(title?.textContent).toBe("Ayarlar");
  });

  it("kapat düğmesinin bir adı var", () => {
    // "×" ekran okuyucuda "çarpı işareti" diye okunuyordu.
    const { container } = render(<SettingsDialog />);
    expect(container.querySelector(".modal-head .icon-btn")!.getAttribute("aria-label")).toBe(
      "Kapat",
    );
  });
});

/**
 * Esc'yi geri alacak bir şeyi olan kutu sahipleniyor (bkz. `escapeOwnedBy`).
 * Genel dinleyici bu testlerde yok; sahiplik özniteliği ve kutunun kendi Esc
 * davranışı burada, dinleyicinin özniteliğe baktığı `focus.test.ts`te bağlı.
 */
describe("Esc sahipliği", () => {
  it("arama kutusu yalnızca doluyken sahipleniyor", async () => {
    // Boşken Esc pencereyi kapatmalı: geri alacak bir şey yok.
    const { container } = render(<SettingsDialog />);
    const input = container.querySelector(".settings-search input")!;
    expect(input.hasAttribute("data-owns-escape")).toBe(false);
    fireEvent.change(input, { target: { value: "tema" } });
    await settle();
    expect(input.hasAttribute("data-owns-escape")).toBe(true);
  });

  it("kısayol kaydında Esc kaydı iptal ediyor", async () => {
    const s = useStore.getState().settings;
    useStore.setState({ settings: { ...s, keybindings: { newTab: "Ctrl+T" } } });
    const { container } = render(<SettingsDialog />);
    fireEvent.click([...container.querySelectorAll(".settings-nav button")][7]); // Kısayollar
    await settle();
    const input = container.querySelector(".key-capture") as HTMLInputElement;
    fireEvent.focus(input);
    await settle();
    expect(input.value).toBe("Tuşa basın…");
    expect(input.hasAttribute("data-owns-escape"), "kayıtta Esc pencereyi kapatır").toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    await settle();
    expect(input.value).toBe("Ctrl+T");
    expect(useStore.getState().settings.keybindings.newTab).toBe("Ctrl+T");
  });
});

describe("görünüm bölümü", () => {
  async function openAppearance() {
    const view = render(<SettingsDialog />);
    fireEvent.click([...view.container.querySelectorAll(".settings-nav button")][1]);
    await settle();
    return view;
  }

  it("tema kartlarla seçiliyor, ilki 'Sistemi izle'", async () => {
    const { container } = await openAppearance();
    const cards = [...container.querySelectorAll(".theme-card")];
    expect(cards[0].textContent).toBe("Sistemi izle");
    fireEvent.click(cards[0]);
    await settle();
    expect(useStore.getState().settings.appearance.theme).toBe("system");
    expect(cards[0].getAttribute("aria-checked")).toBe("true");
  });

  it("fabrika yazı tipi menüde: 'Özel…' olarak görünmüyor", async () => {
    // ÖLÇÜLEN: ilk açılışta yazı tipi "Özel…" olarak, altında çiğ bir
    // yığınla görünüyordu — varsayılan menüde yoktu.
    const s = useStore.getState().settings;
    useStore.setState({
      settings: { ...s, appearance: { ...s.appearance, fontFamily: defaultFontStack() } },
    });
    const { container } = await openAppearance();
    const select = container.querySelector(
      '[data-setting="settings.fontFamily"] select',
    ) as HTMLSelectElement;
    expect(select.value).toBe(defaultFontStack());
    expect(container.querySelector(".font-custom")).toBe(null);
  });

  it("arayüz yazı tipi de bir menü, öneri listesi değil", async () => {
    const { container } = await openAppearance();
    const row = container.querySelector('[data-setting="settings.uiFontFamily"]')!;
    expect(row.querySelector("datalist")).toBe(null);
    const select = row.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[0].textContent).toBe("Sistemin kendi yazı tipi");
  });

  it("kaydırıcılar ortak sınırları kullanıyor", async () => {
    const { container } = await openAppearance();
    const size = container.querySelector('[data-setting="settings.fontSize"] input')!;
    expect(size.getAttribute("max"), "kaydırıcı ile ⌘= farklı sınırda").toBe(String(LIMITS.fontSize.max));
    const spacing = container.querySelector('[data-setting="settings.letterSpacingLabel"] input')!;
    expect(spacing.getAttribute("step"), "yarım adımların yarısı etkisiz").toBe("1");
  });

  it("kısayolla yakınlaştırılmışken bunu söylüyor", async () => {
    const s = useStore.getState().settings;
    useStore.setState({
      settings: {
        ...s,
        keybindings: { zoomReset: "Ctrl+0" },
        appearance: { ...s.appearance, fontSize: 10, fontZoom: 2 },
      },
    });
    const { container } = await openAppearance();
    const row = container.querySelector('[data-setting="settings.fontSize"]')!;
    expect(row.querySelector("label")!.textContent).toBe("Boyut (10 px)");
    expect(row.querySelector(".hintline")!.textContent).toContain("12 px");
  });
});

describe("oturum bölümü", () => {
  async function openSession() {
    const view = render(<SettingsDialog />);
    fireEvent.click([...view.container.querySelectorAll(".settings-nav button")][3]);
    await settle();
    return view;
  }

  it("ekran çıktısının iki sayısı yan yana, pencere kapatma kendi başlığında", async () => {
    const { container } = await openSession();
    expect(headings(container)).toEqual([
      "Oturum devamlılığı",
      "Ekran çıktısı",
      "Yeni sekmeler",
      "Kapatma",
    ]);
    const output = [...container.querySelectorAll(".section")][1];
    expect(output.querySelector('[data-setting="settings.scrollbackLines"]')).not.toBe(null);
    expect(output.querySelector('[data-setting="settings.scrollbackPerTab"]')).not.toBe(null);
  });

  it("çıktı geri yüklenmiyorsa diske yazılan satır kutusu kapalı", async () => {
    const s = useStore.getState().settings;
    useStore.setState({ settings: { ...s, behavior: { ...s.behavior, restoreScrollback: false } } });
    const { container } = await openSession();
    const input = container.querySelector(
      '[data-setting="settings.scrollbackPerTab"] input',
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});

describe("profiller bölümü", () => {
  afterEach(() => setPlatform("windows"));

  async function openProfiles() {
    const view = render(<SettingsDialog />);
    fireEvent.click([...view.container.querySelectorAll(".settings-nav button")][5]);
    await settle();
    return view;
  }

  const argsInput = (c: HTMLElement) =>
    [...c.querySelectorAll(".settings-form .field")]
      .find((f) => f.querySelector("label")?.textContent === "Argümanlar")!
      .querySelector("input") as HTMLInputElement;

  it("argüman kutusu boşluğu yutmuyor", async () => {
    // ÖLÇÜLEN: "-l -i" yazmak "-l-i" üretiyordu. Her tuş kutunun O ANKİ
    // değerine ekleniyor — tarayıcıdaki gibi. Testin kendi tuttuğu metne
    // eklemek, kutunun boşluğu silmesini görmezdi (bir kez öyle geçti).
    const { container } = await openProfiles();
    fireEvent.change(argsInput(container), { target: { value: "" } });
    await settle();
    for (const ch of "-l -i") {
      fireEvent.change(argsInput(container), { target: { value: argsInput(container).value + ch } });
      await settle();
    }
    expect(argsInput(container).value).toBe("-l -i");
    expect(useStore.getState().settings.profiles[0].args).toEqual(["-l", "-i"]);
  });

  it("mac'te yeni profil zsh türünde", async () => {
    // Önceden PowerShell türünde açılıyordu; kabuk yolu boşken pwsh aranıyor
    // ve çoğu mac'te yok.
    setPlatform("macos");
    const { container } = await openProfiles();
    fireEvent.click(
      [...container.querySelectorAll(".profile-grid button")].find((b) =>
        b.textContent?.includes("Ekle"),
      )!,
    );
    await settle();
    const created = useStore.getState().settings.profiles.at(-1)!;
    expect(created.kind).toBe("zsh");
    expect(created.args).toEqual(["-l"]);
  });

  it("varsayılan profil bir düğmeyle seçiliyor; işaret kaldırılamayan kutu yok", async () => {
    const s = useStore.getState().settings;
    useStore.setState({
      settings: {
        ...s,
        profiles: [...s.profiles, { ...s.profiles[0], id: "p2", name: "Zsh" }],
      },
    });
    const { container } = await openProfiles();
    expect(container.querySelector("#isDefault"), "eski onay kutusu duruyor").toBe(null);
    expect(container.querySelector(".default-btn"), "varsayılanda düğme olmamalı").toBe(null);

    const rows = [...container.querySelectorAll(".profile-list .row")] as HTMLElement[];
    expect(rows[1].tagName, "satır klavyeyle seçilemiyor").toBe("BUTTON");
    fireEvent.click(rows[1]);
    await settle();
    fireEvent.click(container.querySelector(".default-btn")!);
    await settle();
    expect(useStore.getState().settings.defaultProfileId).toBe("p2");
  });
});

describe("kısayollar bölümü", () => {
  async function openKeys(keybindings: Record<string, string>) {
    const s = useStore.getState().settings;
    useStore.setState({ settings: { ...s, keybindings } });
    const view = render(<SettingsDialog />);
    fireEvent.click([...view.container.querySelectorAll(".settings-nav button")][7]);
    await settle();
    return view;
  }

  it("gruplu ve sabit sırada, kimliğe göre alfabetik değil", async () => {
    const { container } = await openKeys({
      clearTerminal: "Ctrl+Shift+K",
      closeTab: "Ctrl+W",
      copy: "Ctrl+Shift+C",
      newTab: "Ctrl+T",
    });
    expect(headings(container)).toEqual(["Klavye kısayolları", "Sekmeler ve gruplar", "Pano", "Ekran"]);
    const labels = [...container.querySelectorAll(".modal-body .field label")].map((l) => l.textContent);
    expect(labels.indexOf("Yeni sekme")).toBeLessThan(labels.indexOf("Sekmeyi kapat"));
  });

  it("aynı tuş iki eyleme atanmışsa iki satır da uyarıyor", async () => {
    const { container } = await openKeys({ newTab: "Ctrl+T", clearTerminal: "ctrl+t" });
    const warnings = [...container.querySelectorAll(".hintline.warn")].map((w) => w.textContent);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toContain("Yeni sekme");
  });
});

describe("hakkında: dosya konumları", () => {
  it("dosyalar veri klasörüne göre, başlıkta yol yok", async () => {
    useStore.setState({
      paths: {
        root: "/Users/x/Library/Application Support/NTerminal",
        settingsFile: "/Users/x/Library/Application Support/NTerminal/settings.json",
        workspaceFile: "/Users/x/Library/Application Support/NTerminal/workspace.json",
        historyFile: "/Users/x/Library/Application Support/NTerminal/history.jsonl",
        scrollbackDir: "/Users/x/Library/Application Support/NTerminal/scrollback",
        integrationDir: "/Users/x/Library/Application Support/NTerminal/shell-integration",
        portable: false,
      },
    });
    const view = render(<SettingsDialog />);
    expect(view.container.querySelector(".modal-head")!.textContent).not.toContain("settings.json");
    const buttons = [...view.container.querySelectorAll(".settings-nav button")];
    fireEvent.click(buttons[buttons.length - 1]);
    await settle();
    const rel = [...view.container.querySelectorAll(".path-rel")].map((e) => e.textContent);
    expect(rel).toEqual(["settings.json", "workspace.json", "history.jsonl", "shell-integration"]);
    useStore.setState({ paths: null });
  });

  it("güncelleme satırının etiketi düğmesini tekrarlamıyor", async () => {
    const view = render(<SettingsDialog />);
    const buttons = [...view.container.querySelectorAll(".settings-nav button")];
    fireEvent.click(buttons[buttons.length - 1]);
    await settle();
    const row = view.container.querySelector('[data-setting="update.check"]')!;
    expect(row.querySelector("label")!.textContent).toBe("Yüklü sürüm");
    expect(row.textContent).toContain("0.1.0");
  });
});

describe("arama sonuçları", () => {
  it("başlıkla birlikte, yer tutucusuz", async () => {
    const { container } = render(<SettingsDialog />);
    fireEvent.change(container.querySelector(".settings-search input")!, {
      target: { value: "boyut" },
    });
    await settle();
    const results = [...container.querySelectorAll(".settings-result")];
    expect(results.map((r) => r.querySelector(".settings-result-label")!.textContent)).not.toContain(
      "Boyut ({n} px)",
    );
    const groups = results.map((r) => r.querySelector(".settings-result-group")?.textContent ?? "");
    expect(groups.some((g) => g.includes("Terminal yazı tipi"))).toBe(true);
    expect(groups.some((g) => g.includes("Arayüz yazı tipi"))).toBe(true);
  });
});
