// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GRUPTAN BAĞIMSIZ sekme.
 *
 * BİLDİRİLEN İSTEK: "Bir sekmeyi illa gruba eklemeye gerek olmamalı… her zaman
 * bir grup seçili olduğu için sağ tıklayıp sekme ekle dediğimde seçili gruba
 * ekleniyor."
 *
 * Model değişmedi — sekmeler yine bir grubun içinde. Değiştirmek "sekme
 * nerede" sorusunu geçmiş kaydından favori süzgecine kadar her yerde ikiye
 * bölerdi. Bunun yerine TEK bir grup "gruplanmamış" olarak işaretleniyor ve
 * arayüz onu başlıksız düz bir liste olarak çiziyor.
 *
 * Testlerin konusu bu kovanın sözleşmesi: en fazla bir tane, listenin başında,
 * boşalınca kayboluyor.
 */

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: () => async () => undefined,
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("./useStore");

function seed() {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    settings: {
      ...state.settings,
      profiles: [
        {
          id: "p1",
          name: "zsh",
          kind: "zsh",
          shell: "/bin/zsh",
          args: [],
          cwd: null,
          env: {},
          shellIntegration: true,
          color: null,
          icon: null,
          unavailable: false,
        },
      ],
      defaultProfileId: "p1",
      // Kapatma onayı bu testlerin konusu değil.
      behavior: { ...state.settings.behavior, confirmCloseTab: "never" },
    },
    groups: [],
    activeGroupId: null,
  });
  const id = useStore.getState().addGroup("Ana");
  useStore.getState().addTab({ groupId: id });
  return id;
}

const bucket = () => useStore.getState().groups.find((g) => g.ungrouped);

beforeEach(() => {
  seed();
});

describe("gruplanmamış sekme", () => {
  it("kovayı kuruyor ve sekmeyi oraya koyuyor", () => {
    const tabId = useStore.getState().addLooseTab();
    const kova = bucket();
    expect(kova, "kova kurulmadı").toBeDefined();
    expect(kova!.tabs.map((t) => t.id)).toEqual([tabId]);
  });

  it("kova listenin BAŞINDA duruyor", () => {
    // Gruplanmamış sekmeler grupların üstünde: kökteki dosyalar gibi.
    useStore.getState().addLooseTab();
    expect(useStore.getState().groups[0].ungrouped).toBe(true);
  });

  it("ikinci sekme AYNI kovaya giriyor", () => {
    // İkinci bir kova, "gruplanmamış" kavramını ikiye bölerdi.
    useStore.getState().addLooseTab();
    useStore.getState().addLooseTab();
    expect(useStore.getState().groups.filter((g) => g.ungrouped)).toHaveLength(1);
    expect(bucket()!.tabs).toHaveLength(2);
  });

  it("etkin grup başkayken bile gruba EKLEMİYOR", () => {
    // İstek tam olarak buydu: seçili grup ne olursa olsun sekme dışarıda.
    const anaId = seed();
    useStore.setState({ activeGroupId: anaId });
    useStore.getState().addLooseTab();

    const ana = useStore.getState().groups.find((g) => g.id === anaId)!;
    expect(ana.tabs, "sekme seçili gruba eklenmiş").toHaveLength(1);
    expect(bucket()!.tabs).toHaveLength(1);
  });

  it("son sekmesi kapanınca kova kayboluyor", async () => {
    // Boş ve adsız bir bölüm ekranda yalnızca "bu ne" sorusu doğururdu.
    const tabId = useStore.getState().addLooseTab()!;
    await useStore.getState().closeTab(tabId);
    expect(bucket()).toBeUndefined();
  });

  it("kova kaybolunca etkin grup gerçek bir gruba dönüyor", async () => {
    const tabId = useStore.getState().addLooseTab()!;
    // `addTab` etkin grubu kovaya çekiyor; kapatınca boşta kalmamalı.
    expect(useStore.getState().activeGroupId).toBe(bucket()!.id);
    await useStore.getState().closeTab(tabId);

    const aktif = useStore.getState().activeGroupId;
    expect(aktif).not.toBe(null);
    expect(useStore.getState().groups.some((g) => g.id === aktif)).toBe(true);
  });

  it("gerçek grup boşalınca SİLİNMİYOR", () => {
    // Kural yalnızca kovaya ait: gerçek grubu kullanıcı kurdu, adı ve rengi
    // var, boş kalması onu yok etmeye gerekçe değil.
    const anaId = seed();
    const ana = useStore.getState().groups.find((g) => g.id === anaId)!;
    void useStore.getState().closeTab(ana.tabs[0].id);
    expect(useStore.getState().groups.some((g) => g.id === anaId)).toBe(true);
  });

  it("kova en üstte kalıyor, grup onun üstüne taşınamıyor", () => {
    // Başlıksız bir bölüm listenin ortasında kalırsa sekmelerin kime ait
    // olduğu anlaşılmıyor.
    const anaId = seed();
    useStore.getState().addLooseTab();
    const digerId = useStore.getState().addGroup("Diğer");

    useStore.getState().moveGroupTo(digerId, 0);
    expect(useStore.getState().groups[0].ungrouped, "kova ikinciye düştü").toBe(true);
    expect(useStore.getState().groups[1].id).toBe(digerId);
    expect(useStore.getState().groups.some((g) => g.id === anaId)).toBe(true);
  });
});
