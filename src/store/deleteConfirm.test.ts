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

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      favoritesRemoveByCommand: (...a: unknown[]) => removeByCommand(...(a as [])),
      favoritesRemove: (...a: unknown[]) => removeFavorites(...(a as [])),
      historyDelete: (...a: unknown[]) => historyDelete(...(a as [])),
      favoritesList: async () => [],
      saveWorkspace: async () => {},
      scrollbackDelete: async () => {},
      historyQuery: async () => ({ entries: [], total: 0, grandTotal: 0 }),
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
