// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Silme her zaman sorar" kuralı.
 *
 * Kullanıcının açık isteği: ekranlarda herhangi bir yerdeki silme işlemi onay
 * istemeli. Bu kural kod içinde dağınık duruyor (depoda, panellerde, ayarlar
 * penceresinde) ve tek bir yerde unutmak sessizce veri kaybına yol açıyor —
 * eksik onay, çalışan bir özellik gibi görünüyor.
 *
 * Bu yüzden davranışsal test: her silme yolu için (1) soruluyor mu, (2) VAZGEÇ
 * denince silme gerçekten olmuyor mu. İkincisi kritik: onayı gösterip cevabı
 * yok saymak en kötü durum.
 */

const removeByCommand = vi.fn(async () => 1);
const removeFavorites = vi.fn(async () => 1);
const historyDelete = vi.fn(async () => 1);
const historyQuery = vi.fn(async () => ({
  entries: [] as { id: string; command: string; tabId: string }[],
  total: 0,
  grandTotal: 0,
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      favoritesRemoveByCommand: (...a: unknown[]) => removeByCommand(...(a as [])),
      favoritesRemove: (...a: unknown[]) => removeFavorites(...(a as [])),
      historyDelete: (...a: unknown[]) => historyDelete(...(a as [])),
      favoritesList: async () => [],
      saveWorkspace: async () => {},
      scrollbackDelete: async () => {},
      historyQuery: (...a: unknown[]) => historyQuery(...(a as [])),
      saveSettings: async () => {},
    } as Record<string, unknown>,
    {
      // Testin ilgilenmediği her çağrı sessizce başarılı olsun; eksik bir
      // sahte fonksiyon yüzünden test konusu dışında bir hata almak istemiyoruz.
      get: (target, prop) => target[prop as string] ?? (async () => undefined),
    },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("./useStore");

/**
 * `askConfirm`i sahteleyip verilen cevabı döndürür.
 *
 * `vi.spyOn` yerine eylemi doğrudan değiştiriyoruz: spy her testte yenisi
 * kurulduğunda öncekini sarmalıyor ve çağrı sayıları testler arasında
 * birikiyordu (1, 3, 4, 5…). Kendi sayacımız her testte sıfırdan başlıyor.
 */
let asked: { title: string; message: string }[] = [];

function stubConfirm(answer: boolean) {
  asked = [];
  useStore.setState({
    askConfirm: async (request) => {
      asked.push({ title: request.title, message: request.message });
      return answer;
    },
  });
}

function group(id: string, name = id) {
  return {
    id,
    name,
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: null,
    tabs: [],
  };
}

function favorite(id: string, command: string) {
  return {
    id,
    command,
    label: null,
    note: null,
    groupId: null,
    folder: null,
    cwd: null,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  removeByCommand.mockClear();
  removeFavorites.mockClear();
  historyDelete.mockClear();
  // `mockReset`: aşağıdaki bir testin verdiği kayıtlar sonrakine taşınmasın.
  historyQuery.mockReset();
  useStore.setState({
    groups: [group("g1", "Yayın"), group("g2", "Geliştirme")],
    activeGroupId: "g1",
    favorites: [favorite("f1", "npm test")],
  });
});

describe("grup silme", () => {
  it("onay soruyor", async () => {
    stubConfirm(true);
    await useStore.getState().deleteGroup("g2");
    expect(asked).toHaveLength(1);
    expect(useStore.getState().groups.map((g) => g.id)).toEqual(["g1"]);
  });

  it("vazgeçince silmiyor", async () => {
    stubConfirm(false);
    await useStore.getState().deleteGroup("g2");
    expect(useStore.getState().groups.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("boş grupta da soruyor", async () => {
    // Eskiden boş grup soru sormadan siliniyordu; "boş" olması silmenin geri
    // dönüşü olduğu anlamına gelmiyor (ad, renk, ortam değişkenleri gidiyor).
    stubConfirm(false);
    expect(useStore.getState().groups.find((g) => g.id === "g2")!.tabs).toHaveLength(0);
    await useStore.getState().deleteGroup("g2");
    expect(asked).toHaveLength(1);
  });

  it("son grup silinemez ve soru da sorulmaz", async () => {
    useStore.setState({ groups: [group("g1")], activeGroupId: "g1" });
    stubConfirm(true);
    await useStore.getState().deleteGroup("g1");
    expect(asked, "yapılamayacak bir işlem için soru sorulmamalı").toEqual([]);
    expect(useStore.getState().groups).toHaveLength(1);
  });
});

describe("favori silme", () => {
  it("kimlikle kaldırma onay soruyor", async () => {
    stubConfirm(true);
    await useStore.getState().removeFavorite("f1");
    expect(asked).toHaveLength(1);
    expect(removeFavorites).toHaveBeenCalledWith(["f1"]);
  });

  it("vazgeçince kaldırmıyor", async () => {
    stubConfirm(false);
    await useStore.getState().removeFavorite("f1");
    expect(removeFavorites, "vazgeçilmesine rağmen silindi").not.toHaveBeenCalled();
  });

  it("olmayan favori için soru sormuyor", async () => {
    stubConfirm(true);
    await useStore.getState().removeFavorite("yok");
    expect(asked).toEqual([]);
  });

  it("yıldızı kapatmak onay soruyor", async () => {
    // Yıldız bir anahtar gibi görünüyor ama kapatmak favoriyi siliyor.
    stubConfirm(true);
    await useStore.getState().toggleFavorite("npm test");
    expect(asked).toHaveLength(1);
    expect(removeByCommand).toHaveBeenCalledWith("npm test");
  });

  it("yıldızı kapatmaktan vazgeçince silmiyor", async () => {
    stubConfirm(false);
    await useStore.getState().toggleFavorite("npm test");
    expect(removeByCommand).not.toHaveBeenCalled();
    expect(useStore.getState().favorites).toHaveLength(1);
  });

  it("yıldızı AÇMAK soru sormuyor", async () => {
    // Ekleme yıkıcı değil; orada soru sormak sadece gürültü.
    stubConfirm(true);
    await useStore.getState().toggleFavorite("git status");
    expect(asked).toEqual([]);
  });
});

describe("öneri panelinden geçmiş silme", () => {
  // Panelin × düğmesi ve Shift+Delete buradan geçiyor. Liste yazarken gelen
  // ön ek listesi: kapsamı bütün sekmeler, sekme kurmaya gerek yok.
  beforeEach(() => {
    const ui = useStore.getState().ui;
    useStore.setState({
      suggestHistory: [{ command: "npm test", cwd: null, tabId: "t1" }],
      ui: { ...ui, suggest: { items: ["npm test"], index: 0, input: "np", kind: "history" } },
    });
    historyQuery.mockResolvedValue({
      entries: [{ id: "h1", command: "npm test", tabId: "t1" }],
      total: 1,
      grandTotal: 1,
    });
  });

  it("onay soruyor ve komutu soruda adıyla söylüyor", async () => {
    stubConfirm(true);
    await useStore.getState().deleteSuggestionAt(0);
    expect(asked).toHaveLength(1);
    expect(asked[0].message).toContain("npm test");
    expect(historyDelete).toHaveBeenCalledWith(["h1"]);
    expect(useStore.getState().suggestHistory).toEqual([]);
  });

  it("vazgeçince silmiyor, panel de olduğu gibi kalıyor", async () => {
    stubConfirm(false);
    await useStore.getState().deleteSuggestionAt(0);
    expect(historyQuery, "vazgeçilmesine rağmen disk arandı").not.toHaveBeenCalled();
    expect(historyDelete, "vazgeçilmesine rağmen silindi").not.toHaveBeenCalled();
    expect(useStore.getState().suggestHistory).toHaveLength(1);
    expect(useStore.getState().ui.suggest?.items).toEqual(["npm test"]);
  });
});

/**
 * Onay beklerken değişen durum korunuyor.
 *
 * Onay saniyeler sürüyor ve o sırada kabuklar başlık/cwd bildiriyor
 * (`updateTab`), gruba sekme ekleniyor. ÖLÇÜLEN HATA: `closeTab` ve
 * `deleteGroup` hesaplarını onay ÖNCESİ alınan kopyadan türetiyor ve `set`
 * listeyi o eski hâle döndürüyordu: başlık yamaları geri alınıyor, eklenen
 * sekme durumdan siliniyor (oturumu DOM'da ve `sessions`ta kalıyor: xterm +
 * PTY sızıntısı), onay sırasında eklenen grup kayboluyordu.
 */
describe("onay beklerken değişen durum", () => {
  function sekme(id: string, title = id) {
    return {
      id,
      title,
      customTitle: null,
      profileId: "p1",
      cwd: null,
      createdAt: 0,
      lastActiveAt: 0,
      hasScrollback: false,
      lastCommand: null,
      locked: false,
    };
  }

  /** Cevabı testin verdiği, bekleyen bir onay. */
  function bekleyenOnay() {
    let cevapla: (ok: boolean) => void = () => {};
    useStore.setState({
      askConfirm: () =>
        new Promise<boolean>((resolve) => {
          cevapla = resolve;
        }),
    });
    return (ok: boolean) => cevapla(ok);
  }

  it("sekme kapatma: bu arada gelen başlık ve eklenen sekme kalıyor", async () => {
    const settings = useStore.getState().settings;
    useStore.setState({
      settings: { ...settings, behavior: { ...settings.behavior, confirmCloseTab: "always" } },
      groups: [{ ...group("g1"), tabs: [sekme("t1"), sekme("t2", "eski")], activeTabId: "t1" }],
      activeGroupId: "g1",
    });
    const cevapla = bekleyenOnay();

    const kapanis = useStore.getState().closeTab("t1");
    await Promise.resolve();
    // Onay açıkken: komşu sekmenin kabuğu başlık bildiriyor, gruba sekme ekleniyor.
    useStore.getState().updateTab("t2", { title: "yeni" });
    useStore.setState({
      groups: useStore.getState().groups.map((g) => ({ ...g, tabs: [...g.tabs, sekme("t3")] })),
    });
    cevapla(true);
    await kapanis;

    const tabs = useStore.getState().groups[0].tabs;
    expect(tabs.map((t) => t.id), "kapanan gitti, eklenen kaldı").toEqual(["t2", "t3"]);
    expect(tabs[0].title, "onay sırasında gelen başlık geri alındı").toBe("yeni");
    useStore.setState({ settings });
  });

  it("grup silme: bu arada eklenen grup kalıyor", async () => {
    const cevapla = bekleyenOnay();

    const silme = useStore.getState().deleteGroup("g2");
    await Promise.resolve();
    useStore.setState({ groups: [...useStore.getState().groups, group("g3", "Sonradan")] });
    cevapla(true);
    await silme;

    expect(useStore.getState().groups.map((g) => g.id)).toEqual(["g1", "g3"]);
  });
});

/**
 * Git önbellekleri sekmeyle birlikte düşüyor.
 *
 * `gitInfo` klasör başına dal + değişiklik listesi; yalnızca büyüyordu.
 * Günlerce açık uygulamada yüzlerce depo arasında `cd` yapan biri için
 * yüzlerce nesne ve her `set`te hepsinin kopyası. Sekme kapanınca hiçbir canlı
 * oturumun klasörü olmayan kayıtlar gidiyor.
 */
describe("git önbelleği", () => {
  it("kapanan sekmenin klasörü düşüyor, canlı sekmeninki kalıyor", async () => {
    const { sessions } = await import("./useStore");
    const settings = useStore.getState().settings;
    const sekme = (id: string) => ({
      id, title: id, customTitle: null, profileId: "p1", cwd: null, createdAt: 0, lastActiveAt: 0,
      hasScrollback: false, lastCommand: null, locked: false,
    });
    useStore.setState({
      settings: { ...settings, behavior: { ...settings.behavior, confirmCloseTab: "never" } },
      groups: [{ ...group("g1"), tabs: [sekme("t1"), sekme("t2")], activeTabId: "t1" }],
      activeGroupId: "g1",
      gitInfo: { "/depo/a": null, "/depo/b": null, "/depo/eski": null },
    });
    sessions.set("t1", { cwd: "/depo/a", dispose: async () => {} } as never);
    sessions.set("t2", { cwd: "/depo/b", dispose: async () => {} } as never);

    await useStore.getState().closeTab("t1");

    expect(Object.keys(useStore.getState().gitInfo).sort()).toEqual(["/depo/b"]);
    sessions.clear();
    useStore.setState({ settings, gitInfo: {} });
  });
});
