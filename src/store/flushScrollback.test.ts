// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ekran çıktısı yalnızca DEĞİŞTİYSE diske yazılıyor.
 *
 * ## Ölçülen maliyet
 *
 * `flushAllState` yalnızca kapanışta değil, iki dakikada bir de koşuyor
 * (`App` içindeki güvenlik kaydı). Her sekme için `serialize()` çağırmak on
 * sekmede on kez 2000 satırın metne çevrilmesi demek — hepsi ana iş
 * parçacığında, ardından on disk yazımı. Sekmeye yeni çıktı gelmediyse
 * diskteki kopya zaten doğru.
 *
 * ## Atlanan sekmenin TUZAĞI
 *
 * `hasScrollback` bayrağı çalışma alanına yazılıyor ve açılışta "bu sekmenin
 * ekran çıktısını geri yükle" kararını o veriyor. Atlanan sekmeyi kümeye
 * eklememek, dosya diskte dururken "kaydı yok" demek olurdu: kullanıcı
 * uygulamayı açtığında sessiz sekmelerin geçmişi kaybolurdu. Bu testin asıl
 * işi o bayrağın taşındığını bağlamak.
 */

const cagrilar = vi.hoisted(() => ({
  kaydedilen: [] as { tabId: string; data: string }[],
  silinen: [] as string[],
  calismaAlani: [] as { groups: { tabs: { id: string; hasScrollback: boolean }[] }[] }[],
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => {
      if (prop === "scrollbackSave") {
        return async (tabId: string, data: string) => {
          cagrilar.kaydedilen.push({ tabId, data });
        };
      }
      if (prop === "scrollbackDelete") {
        return async (tabId: string) => {
          cagrilar.silinen.push(tabId);
        };
      }
      if (prop === "saveWorkspace") {
        return async (workspace: {
          groups: { tabs: { id: string; hasScrollback: boolean }[] }[];
        }) => {
          cagrilar.calismaAlani.push(workspace);
        };
      }
      return async () => null;
    },
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { flushAllState, sessions, useStore } = await import("./useStore");
type Oturum = NonNullable<ReturnType<typeof sessions.get>>;

/** `flushAllState`in bir oturumdan istediği yüzey — o kadarı. */
function taklitOturum(opts: { kirli: boolean; icerik?: string }) {
  const durum = { kirli: opts.kirli, kaydedildi: 0, seriHaleGetirme: 0 };
  const oturum = {
    cwd: "C:/proje",
    hasUnsavedOutput: () => durum.kirli,
    serialize: () => {
      durum.seriHaleGetirme++;
      return opts.icerik ?? "önceki oturum çıktısı";
    },
    markOutputSaved: () => {
      durum.kirli = false;
      durum.kaydedildi++;
    },
  };
  return { durum, oturum: oturum as unknown as Oturum };
}

function tab(id: string, hasScrollback: boolean) {
  return {
    id,
    title: id,
    customTitle: null,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback,
    lastCommand: null,
    locked: false,
  };
}

beforeEach(() => {
  cagrilar.kaydedilen.length = 0;
  cagrilar.silinen.length = 0;
  cagrilar.calismaAlani.length = 0;
  sessions.clear();
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    bootError: null,
    activeGroupId: "g1",
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, restoreScrollback: true },
    },
    groups: [
      {
        id: "g1",
        name: "Grup",
        color: "#58a6ff",
        icon: null,
        collapsed: false,
        favorite: false,
        defaultProfileId: null,
        defaultCwd: null,
        env: {},
        activeTabId: "kirli",
        tabs: [tab("kirli", true), tab("temiz", true)],
      },
    ],
  });
});

afterEach(() => {
  sessions.clear();
});

describe("ekran çıktısını diske yazma", () => {
  it("çıktısı değişmeyen sekme yeniden seri hâle getirilmiyor", async () => {
    const kirli = taklitOturum({ kirli: true });
    const temiz = taklitOturum({ kirli: false });
    sessions.set("kirli", kirli.oturum);
    sessions.set("temiz", temiz.oturum);

    await flushAllState();

    expect(cagrilar.kaydedilen.map((k) => k.tabId)).toEqual(["kirli"]);
    expect(temiz.durum.seriHaleGetirme, "temiz sekme yine seri hâle getirildi").toBe(0);
    expect(kirli.durum.kaydedildi, "yazımdan sonra işaret temizlenmedi").toBe(1);
  });

  it("atlanan sekmenin kaydı çalışma alanında duruyor", async () => {
    // ASIL TUZAK: bayrak düşerse açılışta o sekmenin geçmişi geri yüklenmez.
    sessions.set("kirli", taklitOturum({ kirli: true }).oturum);
    sessions.set("temiz", taklitOturum({ kirli: false }).oturum);

    await flushAllState();

    const yazilan = cagrilar.calismaAlani.at(-1);
    const bayraklar = Object.fromEntries(
      yazilan!.groups[0].tabs.map((t) => [t.id, t.hasScrollback]),
    );
    expect(bayraklar).toEqual({ kirli: true, temiz: true });
  });

  it("çıktısı boşalmış sekmenin dosyası siliniyor", async () => {
    sessions.set("kirli", taklitOturum({ kirli: true, icerik: "   \n" }).oturum);

    await flushAllState();

    expect(cagrilar.silinen).toEqual(["kirli"]);
    expect(cagrilar.kaydedilen).toEqual([]);
    const yazilan = cagrilar.calismaAlani.at(-1);
    const kirliTab = yazilan!.groups[0].tabs.find((t) => t.id === "kirli");
    expect(kirliTab!.hasScrollback, "boş çıktı 'kaydı var' sayıldı").toBe(false);
  });
});
