// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kabuk kapanınca sekme KENDİLİĞİNDEN yeniden başlıyor.
 *
 * İSTEK: "'Bu sekmedeki kabuk kapandı' — buna gerek yok, doğrudan yeniden
 * başlatma işlemi gerçekleşsin. Kullanıcı isterse sol kısımdan ya da üstten
 * sekmeyi kapatır."
 *
 * Asıl riski bu testler tutuyor: koşulsuz bir yeniden başlatma, AÇILAMAYAN bir
 * kabukta sonsuz döngü demek. Profilde olmayan bir yürütülebilir, bozuk bir
 * `.zshrc`, silinmiş bir çalışma dizini — hepsinde kabuk doğar doğmaz ölüyor
 * ve uygulama saniyede yüzlerce süreç başlatmaya çalışırdı.
 */

const h = vi.hoisted(() => ({
  exitHandlers: new Map<string, (code: number | null) => void>(),
  scrollbackSave: vi.fn(async () => {}),
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      ptySpawn: async () => ({ pid: 1, shell: "/bin/zsh", integration: true, cwd: "/x" }),
      scrollbackSave: (...a: unknown[]) => h.scrollbackSave(...(a as [])),
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async (id: string, handler: (code: number | null) => void) => {
    h.exitHandlers.set(id, handler);
    return () => h.exitHandlers.delete(id);
  },
}));

const { sessions, useStore } = await import("./useStore");

/**
 * GERÇEK `restartTab`.
 *
 * Testlerin bir kısmı onu sahteyle değiştiriyor ve zustand deposu testler
 * arasında yaşıyor: geri koymazsak bir sonraki test, önceki testin sahtesini
 * çağırıp sessizce yanlış şeyi ölçer.
 */
const gercekRestartTab = useStore.getState().restartTab;

function jsdomEksikleri() {
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

const TAB = "t1";
const BASLANGIC = Date.UTC(2026, 0, 1);
let saat = 0;

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
    },
    groups: [
      {
        id: "g1",
        name: "g1",
        color: null,
        icon: null,
        collapsed: false,
        favorite: false,
        ungrouped: false,
        defaultProfileId: "p1",
        defaultCwd: null,
        env: {},
        activeTabId: TAB,
        tabs: [
          {
            id: TAB,
            title: "",
            customTitle: null,
            profileId: "p1",
            cwd: null,
            createdAt: 0,
            lastActiveAt: 0,
            hasScrollback: false,
            lastCommand: null,
            locked: false,
          },
        ],
      },
    ],
    activeGroupId: "g1",
    exited: {},
    running: {},
    sessionEpoch: {},
  });
}

/** Oturumu kurup kabuğu başlatır; çıkış olayını tetikleyen işlevi döner. */
async function kabuk() {
  const session = await useStore.getState().ensureSession(TAB);
  await session!.start(null);
  return () => h.exitHandlers.get(TAB)?.(0);
}

beforeEach(() => {
  /*
   * Her test BİR SAAT ileride başlıyor.
   *
   * Ölçülen şey iki çıkış ARASINDAKİ süre ve o süreyi tutan kayıt modül
   * düzeyinde, yani testler arasında yaşıyor. Saati her testte aynı ana
   * kurmak, önceki testin bıraktığı kaydı "az önce oldu" gibi gösterip bir
   * sonraki testi sessizce yanlış dala sokuyordu.
   */
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BASLANGIC + saat++ * 3_600_000));
  jsdomEksikleri();
  useStore.setState({ restartTab: gercekRestartTab });
  h.exitHandlers.clear();
  h.scrollbackSave.mockClear();
  sessions.clear();
  seed();
});

describe("kabuk kapanınca", () => {
  it("kendiliğinden yeniden başlıyor, kutu ÇIKMIYOR", async () => {
    const oldur = await kabuk();
    const restartTab = vi.fn(async () => {});
    useStore.setState({ restartTab });

    oldur();

    expect(restartTab).toHaveBeenCalledWith(TAB);
    expect(useStore.getState().exited[TAB], "kutu çizilecek").toBeFalsy();
    expect(useStore.getState().running[TAB]).toBe(false);
  });

  it("ARKA ARKAYA hemen ölürse ikinci kez denenmiyor", async () => {
    /*
     * Döngü koruması. Bu olmadan açılamayan bir kabuk (profilde olmayan
     * yürütülebilir, silinmiş çalışma dizini) saniyede yüzlerce süreç
     * doğururdu ve uygulama kilitlenirdi.
     */
    const oldur = await kabuk();
    const restartTab = vi.fn(async () => {});
    useStore.setState({ restartTab });

    oldur();
    oldur();

    expect(restartTab, "ikinci kez de yeniden başlatıldı").toHaveBeenCalledTimes(1);
    expect(useStore.getState().exited[TAB], "kutu çizilmiyor").toBe(true);
  });

  it("uzun yaşayıp öldüyse yine yeniden başlıyor", async () => {
    // İki `exit` arasında dakikalar varsa sorun kabukta değil: kullanıcı
    // `exit` yazmıştır ve yeniden başlatmak doğru.
    const oldur = await kabuk();
    const restartTab = vi.fn(async () => {});
    useStore.setState({ restartTab });

    oldur();
    vi.setSystemTime(Date.now() + 60_000);
    oldur();

    expect(restartTab).toHaveBeenCalledTimes(2);
    expect(useStore.getState().exited[TAB]).toBeFalsy();
  });
});

describe("yeniden başlatma ekranı koruyor", () => {
  it("ekran kaydırma tamponuna yazılıyor", async () => {
    /*
     * Yeniden başlatma xterm örneğini yeniden kuruyor ve yeni örnek boş
     * açılıyor. Elle basılan bir düğmede bu göze alınabilir bir bedeldi;
     * kabuk kapanınca KENDİLİĞİNDEN yeniden başladığı için artık değil —
     * `exit` yazan biri ekranının silinmesini beklemiyor.
     */
    await kabuk();
    const session = sessions.get(TAB)!;
    vi.spyOn(session, "serialize").mockReturnValue("eski ekran");

    await useStore.getState().restartTab(TAB);

    expect(h.scrollbackSave).toHaveBeenCalledWith(TAB, "eski ekran");
    const tab = useStore.getState().groups[0].tabs[0];
    expect(tab.hasScrollback, "işaret olmadan barındırıcı yüklemiyor").toBe(true);
  });

  it("boş ekran yazılmıyor", async () => {
    // Boş bir tamponu kaydetmek, sekmeye yalnızca bir ayıraç çizdirirdi.
    await kabuk();
    vi.spyOn(sessions.get(TAB)!, "serialize").mockReturnValue("   ");

    await useStore.getState().restartTab(TAB);

    expect(h.scrollbackSave).not.toHaveBeenCalled();
  });
});
