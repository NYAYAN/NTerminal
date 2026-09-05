// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
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
    expect(headings(container)).toEqual(["Dil", "Görünüm biçimi"]);

    fireEvent.click([...container.querySelectorAll(".settings-nav button")][1]);
    await settle();
    expect(headings(container)).toEqual([
      "Tema",
      "Terminal yazı tipi",
      "Arayüz yazı tipi",
      "İmleç ve kaydırma",
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
